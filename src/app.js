/**
 * コンピテンシー目標ナビ — 画面の動き
 */
(function () {
  'use strict';

  const el = function (id) { return document.getElementById(id); };

  const SAMPLE = {
    name: '実施後レビュー期限遵守率',
    current: '80%',
    target: '100%',
    draft: '実施後レビューを忘れないように、期限をしっかり守ってやるようにします。',
  };

  function readMbo() {
    return {
      name: el('mbo-name').value,
      current: el('mbo-current').value,
      target: el('mbo-target').value,
      competency: selectedCompetency(),
    };
  }

  // ---- コンピテンシー項目の選択 ----------------------------------------

  // data/assignments.local.js は手元にだけ置くファイル。無くてもアプリは動く。
  const assignments = (typeof ASSIGNMENTS !== 'undefined') ? ASSIGNMENTS : [];
  const master = (typeof COMPETENCIES !== 'undefined') ? COMPETENCIES : [];

  // 全社共通の項目は職位に関係なく全員に入る
  const companyWide = assignments.filter(function (g) { return g.group.indexOf('全社共通') === 0; });
  const byRole = assignments.filter(function (g) { return g.group.indexOf('全社共通') !== 0; });

  function roleLabel(g) {
    return [g.division, g.role].filter(function (x) { return x; }).join('　').replace(/\s+/g, ' ').trim();
  }

  function option(value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }

  function fillRoles() {
    if (byRole.length === 0) return;          // 割当データが無い環境では出さない
    const sel = el('role');
    sel.appendChild(option('', '選んでください'));
    byRole.forEach(function (g, i) {
      sel.appendChild(option(String(i), roleLabel(g)));
    });
    el('role-field').hidden = false;
  }

  function fillCompetencies() {
    const sel = el('competency');
    sel.innerHTML = '';
    sel.appendChild(option('', '選ばない（文章だけで診断する）'));

    const roleIndex = el('role').value;
    const mine = [];
    companyWide.forEach(function (g) { g.items.forEach(function (it) { mine.push(it); }); });
    if (roleIndex !== '') {
      byRole[Number(roleIndex)].items.forEach(function (it) { mine.push(it); });
    }

    if (mine.length > 0) {
      const own = document.createElement('optgroup');
      own.label = roleIndex === '' ? '全社共通' : 'あなたの項目';
      mine.forEach(function (it) {
        own.appendChild(option(it.code, it.code + '　' + it.name + (it.note ? '（' + it.note + '）' : '')));
      });
      sel.appendChild(own);
    }

    // 職位を選んだ人には、自分に関係する項目だけを出す。
    // 選んでいない人（割当データが無い環境を含む）には83項目すべてを出す。
    if (master.length > 0 && roleIndex === '') {
      const all = document.createElement('optgroup');
      all.label = '83項目から選ぶ';
      master.forEach(function (it) {
        all.appendChild(option(it.code, it.code + '　' + it.name));
      });
      sel.appendChild(all);
    }
  }

  /** 選ばれている項目（コード・名称・定義）を返す。選んでいなければ null */
  function selectedCompetency() {
    const code = el('competency').value;
    if (!code) return null;
    const found = master.filter(function (it) { return it.code === code; })[0];
    if (found) return found;
    let hit = null;
    assignments.forEach(function (g) {
      g.items.forEach(function (it) { if (it.code === code) hit = it; });
    });
    return hit;
  }

  function showDefinition() {
    const item = selectedCompetency();
    const box = el('definition');
    if (!item) {
      box.hidden = true;
      return;
    }
    box.textContent = item.name + '　—　' + (item.definition || '');
    box.hidden = false;
  }

  function renderAxes(axes) {
    const list = el('axes');
    list.innerHTML = '';
    axes.forEach(function (axis) {
      const li = document.createElement('li');
      li.className = 'axis' + (axis.score <= 2 ? ' axis-weak' : axis.score >= 4 ? ' axis-strong' : '');

      const name = document.createElement('span');
      name.className = 'axis-name';
      const letter = document.createElement('span');
      letter.className = 'axis-letter';
      letter.textContent = axis.smart;
      name.appendChild(letter);
      name.appendChild(document.createTextNode(axis.label));

      const meter = document.createElement('span');
      meter.className = 'axis-meter';
      meter.setAttribute('role', 'img');
      meter.setAttribute('aria-label', axis.score + '点／4点');
      for (let i = 1; i <= 4; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i <= axis.score ? ' dot-on' : '');
        meter.appendChild(dot);
      }

      const value = document.createElement('span');
      value.className = 'axis-score';
      value.textContent = axis.score;

      const hint = document.createElement('span');
      hint.className = 'axis-hint';
      hint.textContent = axis.hint;

      li.appendChild(name);
      li.appendChild(meter);
      li.appendChild(value);
      li.appendChild(hint);
      list.appendChild(li);
    });
  }

  /**
   * 指摘文の見せ方だけを整える（文面そのものは advice.js のまま）。
   * 先頭の［S 具体的］のような印は、本文と切り離して小さく添える。
   */
  function fillComment(li, text) {
    const head = /^［([^］]*)］/.exec(text);
    if (!head) {
      li.textContent = text;
      return;
    }
    const tag = document.createElement('span');
    tag.className = 'comment-tag';
    tag.textContent = head[1];
    li.appendChild(tag);
    li.appendChild(document.createTextNode(text.slice(head[0].length)));
  }

  function renderComments(advice) {
    const list = el('comments');
    list.innerHTML = '';

    if (advice.praise) {
      const li = document.createElement('li');
      li.className = 'comment comment-praise';
      fillComment(li, advice.praise);
      list.appendChild(li);
    }

    advice.comments.forEach(function (text) {
      const li = document.createElement('li');
      li.className = 'comment';
      fillComment(li, text);
      list.appendChild(li);
    });

    if (advice.comments.length === 0) {
      const li = document.createElement('li');
      li.className = 'comment comment-praise';
      li.textContent = '指摘はありません。このまま提出できます。';
      list.appendChild(li);
    }
  }

  /**
   * 書き直しの型。〈　〉は自分で埋める枠なので、枠として見えるようにする。
   * 文面は advice.js の buildSkeleton() のまま。
   */
  function renderSkeleton(text) {
    const box = el('skeleton');
    box.textContent = '';
    text.split(/(〈[^〉]*〉)/).forEach(function (part) {
      if (part === '') return;
      if (part.charAt(0) === '〈') {
        const slot = document.createElement('span');
        slot.className = 'slot';
        slot.textContent = part;
        box.appendChild(slot);
      } else {
        box.appendChild(document.createTextNode(part));
      }
    });
  }

  function run() {
    const draft = el('draft').value.trim();
    if (draft === '') {
      el('result').hidden = true;
      el('empty').hidden = false;
      el('empty').textContent = '行動目標が空です。まず自分の言葉で書いてみてください。';
      return;
    }

    const mbo = readMbo();
    const result = scoreDraft(draft, mbo);
    const verdict = judge(result.total);
    const advice = buildAdvice(result, mbo);

    el('score-total').textContent = result.total.toFixed(1);
    el('verdict-label').textContent = verdict.label;
    el('verdict-label').className = 'badge badge-' + verdict.level;
    el('verdict-note').textContent = verdict.note;

    renderAxes(result.axes);
    renderComments(advice);
    renderSkeleton(buildSkeleton(result, mbo));

    el('empty').hidden = true;
    el('result').hidden = false;
  }

  function fillSample() {
    el('mbo-name').value = SAMPLE.name;
    el('mbo-current').value = SAMPLE.current;
    el('mbo-target').value = SAMPLE.target;
    el('draft').value = SAMPLE.draft;
    run();
  }

  el('role').addEventListener('change', function () {
    fillCompetencies();
    showDefinition();
    if (!el('result').hidden) run();
  });

  el('competency').addEventListener('change', function () {
    showDefinition();
    if (!el('result').hidden) run();
  });

  fillRoles();
  fillCompetencies();

  el('run').addEventListener('click', run);
  el('sample').addEventListener('click', fillSample);

  // URLの末尾に #demo を付けて開くと、サンプルを入れた状態で立ち上がる
  if (window.location.hash === '#demo') fillSample();

  el('clear').addEventListener('click', function () {
    ['mbo-name', 'mbo-current', 'mbo-target', 'draft'].forEach(function (id) {
      el(id).value = '';
    });
    el('role').value = '';
    fillCompetencies();
    showDefinition();
    el('result').hidden = true;
    el('empty').hidden = false;
    el('empty').textContent = '行動目標を入力して「診断する」を押してください。';
  });

  // 入力しながら結果を出したい人向け。空のときは何もしない。
  el('draft').addEventListener('input', function () {
    if (!el('result').hidden) run();
  });
})();
