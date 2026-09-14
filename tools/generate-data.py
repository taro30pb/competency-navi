# -*- coding: utf-8 -*-
"""
コンピテンシー一覧のxlsxから、アプリが使うデータファイルを作る。

    python tools/generate-data.py "2026年度 コンピテンシー一覧 （一般 ） (1).xlsx"

出力は2つ。公開してよいものと、そうでないものを分けている。

    src/competencies.js        83項目の名称と定義。一般的な内容なので公開する
    data/assignments.local.js  その年度に職種別で選ばれた項目。社内の方針が読めるため
                               .gitignore で除外し、手元にだけ置く

年度が変わったら、新しいxlsxを指定して再実行すればよい。
"""
import sys, io, re, json, zipfile
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def shared_strings(z):
    try:
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    except KeyError:
        return []
    out = []
    for si in root.findall(NS + 'si'):
        parts = []
        for child in si:
            if child.tag == NS + 'rPh':      # ふりがなは本文ではない
                continue
            if child.tag == NS + 't':
                parts.append(child.text or '')
            elif child.tag == NS + 'r':
                for t in child.findall(NS + 't'):
                    parts.append(t.text or '')
        out.append(''.join(parts))
    return out


def sheet_rows(z, sheet_name):
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = None
    rmap = {r.get('Id'): r.get('Target') for r in rels}
    for sh in wb.find(NS + 'sheets'):
        if sh.get('name').strip() == sheet_name:
            t = rmap.get(sh.get(REL + 'id'), '').lstrip('/')
            target = t if t.startswith('xl/') else 'xl/' + t
    if target is None:
        raise SystemExit('シートが見つかりません: ' + sheet_name)

    ss = shared_strings(z)
    root = ET.fromstring(z.read(target))
    for row in root.find(NS + 'sheetData'):
        cells = {}
        for c in row.findall(NS + 'c'):
            col = 0
            for ch in re.match(r'([A-Z]+)', c.get('r')).group(1):
                col = col * 26 + ord(ch) - 64
            col -= 1
            t, v, isel = c.get('t'), c.find(NS + 'v'), c.find(NS + 'is')
            if t == 's' and v is not None:
                val = ss[int(v.text)]
            elif t == 'inlineStr' and isel is not None:
                val = ''.join(x.text or '' for x in isel.iter(NS + 't'))
            elif v is not None:
                val = v.text
            else:
                val = ''
            val = (val or '').strip()
            if val:
                cells[col] = re.sub(r'\s+', ' ', val)
        yield cells


def split_item(raw):
    """「1-11　　適応力」を ('1-11', '適応力') に分ける"""
    m = re.match(r'\s*([0-9]+-[0-9]+)\s+(.+)$', raw)
    return (m.group(1), m.group(2).strip()) if m else (None, raw.strip())


def build_master(z):
    items = []
    for cells in sheet_rows(z, 'コンピテンシー83項目'):
        raw = cells.get(0, '')
        code, name = split_item(raw)
        if not code:
            continue
        items.append({'code': code, 'name': name, 'definition': cells.get(1, '')})
    return items


def build_assignments(z):
    groups, group, division, role = [], '', '', ''
    for cells in sheet_rows(z, 'コンピテンシー一覧'):
        if cells.get(0, '').startswith('◆') or cells.get(3) == 'Ｎｏ':
            continue
        if 0 in cells:
            group = cells[0]
        # 本部が変わったら職位は引き継がない（結合セルのため空欄になる）
        if 1 in cells:
            division, role = cells[1], ''
        if 2 in cells:
            role = cells[2]
        code, name = split_item(cells.get(4, ''))
        if not code:
            continue
        # 「③九州」「③関東」のように、同じ番号で条件が分かれることがある
        note = re.sub(r'^[①-⑳⓷➀]+', '', cells.get(3, '')).strip()
        key = (group, division, role)
        if not groups or groups[-1]['key'] != key:
            groups.append({'key': key, 'group': group, 'division': division, 'role': role, 'items': []})
        # 付与型は会社が評価尺度を決める項目で、本人が目標を書かない（目標設定入力不要）。
        # 列7に「自己設定型」と書かれていれば自己設定型、評価尺度の文章が入っていれば付与型。
        seventh = cells.get(7, '')
        if seventh == '自己設定型' or seventh == '':
            kind = '自己設定型'
        else:
            kind = '付与型'

        item = {'code': code, 'name': name, 'definition': cells.get(5, ''), 'kind': kind}

        # 付与型は会社が1〜4の評価尺度を示している。列7〜10がそれにあたる。
        if kind == '付与型':
            levels = [cells.get(c, '') for c in (7, 8, 9, 10)]
            if any(levels):
                item['levels'] = levels
        # 選定理由は「なぜこの項目を選んだか」という評価者からのメッセージ。
        # どう書けば評価されるかの手がかりになるので取り込む（社内限定のファイル側）。
        message = cells.get(6, '')
        if message:
            item['message'] = message
        if note:
            item['note'] = note
        groups[-1]['items'].append(item)
    for g in groups:
        del g['key']
    return groups


def write_js(path, header, varname, data, public):
    body = json.dumps(data, ensure_ascii=False, indent=2)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/**\n * ' + header + '\n *\n')
        f.write(' * tools/generate-data.py が作る。手で書き換えない。\n')
        if not public:
            f.write(' * 社内の方針が読み取れるため、.gitignore で除外している。\n')
        f.write(' */\n')
        f.write('const ' + varname + ' = ' + body + ';\n\n')
        f.write("if (typeof module !== 'undefined') module.exports = { " + varname + ': ' + varname + ' };\n')
    print('  ' + path + '  ' + str(len(data)) + '件')


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    z = zipfile.ZipFile(sys.argv[1])
    print('読み込み: ' + sys.argv[1])
    write_js('src/competencies.js', 'コンピテンシー83項目（名称と定義）', 'COMPETENCIES', build_master(z), True)
    write_js('data/assignments.local.js', '年度ごとの職種別コンピテンシー割当', 'ASSIGNMENTS', build_assignments(z), False)


main()
