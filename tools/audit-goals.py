# -*- coding: utf-8 -*-
"""
評価シート（あしたのクラウドHRから書き出したExcel）を読み、
本人が書いた目標と最終評点を取り出す。

    python tools/audit-goals.py _private

フォルダ内の xlsx をまとめて読み、_private/goals.json に書き出す。
そのあと次を実行すると、当社の評点とアプリの採点を並べて比べられる。

    node tools/audit-goals.js

氏名はファイル名にしか出てこないので取り込まない（目標文と評点だけを使う）。
出力先も _private なので、公開リポジトリには入らない。
"""
import sys, os, io, re, json, glob, zipfile
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def cells_of(row, shared):
    out = {}
    for c in row.findall(NS + 'c'):
        col = 0
        for ch in re.match(r'([A-Z]+)', c.get('r')).group(1):
            col = col * 26 + ord(ch) - 64
        col -= 1
        t, v, isel = c.get('t'), c.find(NS + 'v'), c.find(NS + 'is')
        if isel is not None:
            val = ''.join(x.text or '' for x in isel.iter(NS + 't'))
        elif t == 's' and v is not None:
            val = shared[int(v.text)]
        elif v is not None:
            val = v.text
        else:
            val = ''
        val = (val or '').strip()
        if val:
            out[col] = val
    return out


def shared_strings(z):
    try:
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    except KeyError:
        return []
    out = []
    for si in root.findall(NS + 'si'):
        parts = []
        for ch in si:
            if ch.tag == NS + 'rPh':
                continue
            if ch.tag == NS + 't':
                parts.append(ch.text or '')
            elif ch.tag == NS + 'r':
                for t in ch.findall(NS + 't'):
                    parts.append(t.text or '')
        out.append(''.join(parts))
    return out


def read_sheet(path):
    """1つの評価シートから、コンピテンシーの目標と評点を取り出す"""
    z = zipfile.ZipFile(path)
    shared = shared_strings(z)
    sheets = [n for n in z.namelist() if n.startswith('xl/worksheets/sheet')]
    if not sheets:
        return []

    root = ET.fromstring(z.read(sheets[0]))
    rows = [cells_of(r, shared) for r in root.find(NS + 'sheetData')]

    # 見出し行から「目標設定項目」「最終評点」が何列目かを調べる。
    # シートの様式が変わっても追随できるようにするため、列番号は決め打ちしない。
    goal_col = score_col = item_col = None
    in_competency = False
    found = []

    for cells in rows:
        head = ' '.join(cells.values())

        if any(v.startswith('コンピテンシー') for v in cells.values()):
            in_competency = True
        if any(v.startswith('KPI') for v in cells.values()):
            in_competency = False

        if '目標設定項目' in head:
            for c, v in cells.items():
                if v == '目標設定項目':
                    goal_col = c
                elif v == '最終評点':
                    score_col = c
                elif v == '項目':
                    item_col = c
            continue

        if not (in_competency and goal_col is not None):
            continue

        goal = cells.get(goal_col, '')
        score = cells.get(score_col, '') if score_col is not None else ''
        item = cells.get(item_col, '') if item_col is not None else ''
        if goal and len(goal) >= 10:
            found.append({
                'item': item,
                'goal': re.sub(r'\s+', ' ', goal),
                'score': score,
            })
    return found


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else '_private'
    files = sorted(glob.glob(os.path.join(folder, '*.xlsx')))
    if not files:
        raise SystemExit('xlsx が見つかりません: ' + folder)

    all_goals = []
    for f in files:
        try:
            got = read_sheet(f)
        except Exception as e:
            print('  読めませんでした: %s（%s）' % (os.path.basename(f), e))
            continue
        print('  %-44s %d件' % (os.path.basename(f)[:44], len(got)))
        all_goals.extend(got)

    out = os.path.join(folder, 'goals.json')
    with io.open(out, 'w', encoding='utf-8') as fp:
        json.dump(all_goals, fp, ensure_ascii=False, indent=2)
    print('')
    print('合計 %d件を %s に書き出しました。' % (len(all_goals), out))
    print('次に実行してください: node tools/audit-goals.js')


main()
