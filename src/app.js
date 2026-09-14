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
    weight: '0.30',
    draft: '実施後レビューを忘れないように、期限をしっかり守ってやるようにします。',
  };

  function readMbo() {
    return {
      name: el('mbo-name').value,
      current: el('mbo-current').value,
      target: el('mbo-target').value,
    };
  }

  function renderAxes(axes) {
    const list = el('axes');
    list.innerHTML = '';
    axes.forEach(function (axis) {
      const li = document.createElement('li');
      li.className = 'axis' + (axis.score <= 2 ? ' axis-weak' : axis.score >= 4 ? ' axis-strong' : '');

      const name = document.createElement('span');
      name.className = 'axis-name';
      name.textContent = axis.label;

      const meter = document.createElement('span');
      meter.className = 'axis-meter';
      meter.setAttribute('role', 'img');
      meter.setAttribute('aria-label', axis.score + '点／5点');
      for (let i = 1; i <= 5; i++) {
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

  function renderComments(advice) {
    const list = el('comments');
    list.innerHTML = '';

    if (advice.praise) {
      const li = document.createElement('li');
      li.className = 'comment comment-praise';
      li.textContent = advice.praise;
      list.appendChild(li);
    }

    advice.comments.forEach(function (text) {
      const li = document.createElement('li');
      li.className = 'comment';
      li.textContent = text;
      list.appendChild(li);
    });

    if (advice.comments.length === 0) {
      const li = document.createElement('li');
      li.className = 'comment comment-praise';
      li.textContent = '指摘はありません。このまま提出できます。';
      list.appendChild(li);
    }
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

    el('score-total').textContent = result.total;
    el('verdict-label').textContent = verdict.label;
    el('verdict-label').className = 'badge badge-' + verdict.level;
    el('verdict-note').textContent = verdict.note;

    renderAxes(result.axes);
    renderComments(advice);
    el('skeleton').textContent = buildSkeleton(result, mbo);

    el('empty').hidden = true;
    el('result').hidden = false;
  }

  function fillSample() {
    el('mbo-name').value = SAMPLE.name;
    el('mbo-current').value = SAMPLE.current;
    el('mbo-target').value = SAMPLE.target;
    el('mbo-weight').value = SAMPLE.weight;
    el('draft').value = SAMPLE.draft;
    run();
  }

  el('run').addEventListener('click', run);
  el('sample').addEventListener('click', fillSample);

  // URLの末尾に #demo を付けて開くと、サンプルを入れた状態で立ち上がる
  if (window.location.hash === '#demo') fillSample();

  el('clear').addEventListener('click', function () {
    ['mbo-name', 'mbo-current', 'mbo-target', 'mbo-weight', 'draft'].forEach(function (id) {
      el(id).value = '';
    });
    el('result').hidden = true;
    el('empty').hidden = false;
    el('empty').textContent = '行動目標を入力して「診断する」を押してください。';
  });

  // 入力しながら結果を出したい人向け。空のときは何もしない。
  el('draft').addEventListener('input', function () {
    if (!el('result').hidden) run();
  });
})();
