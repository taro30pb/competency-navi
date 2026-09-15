/**
 * 実際に書かれた目標を、当社の最終評点とアプリの採点で突き合わせる。
 *
 *   python tools/audit-goals.py _private     ← 先にこちらで取り出す
 *   node tools/audit-goals.js
 *
 * 注意：上長の評点とアプリの採点は、測っているものが違う。
 *   上長の評点   … 期末に「やったかどうか」（成果と期末コメント）
 *   アプリの採点 … 期初の「目標文の書き方」
 * したがって差が出るのは当然で、一致させるべきものではない。
 * この突き合わせは、差そのものではなく「拾えなかった語」を見つけるために使う。
 */
const fs = require('fs');
const path = require('path');
const { scoreDraft, judge } = require('../src/scoring.js');

const file = process.argv[2] || path.join('_private', 'goals.json');
if (!fs.existsSync(file)) {
  console.log('見つかりません: ' + file);
  console.log('先に python tools/audit-goals.py _private を実行してください。');
  process.exit(1);
}

const goals = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = goals.map(function (g) {
  const r = scoreDraft(g.goal);
  const actual = parseFloat(g.score);
  return {
    item: g.item || '（項目不明）',
    goal: g.goal,
    actual: isFinite(actual) ? actual : null,
    app: r.total,
    axes: r.axes,
    detected: r.detected,
  };
});

// 上長の評点とアプリの採点は、測っているものが違うので比べない。
// 上長の評点は期末に「やったかどうか」、アプリは期初の「目標文の書き方」。
// この道具の役目は、拾えなかった言い回しを見つけることにある。

console.log('■ 実際に書かれた目標の採点');
console.log('  （上長の評点は期末の成果で決まるため、並べても比べるものではありません）');
console.log('');
console.log('  アプリ  上長   何も拾えなかった観点            項目');

const blind = { specificity: 0, quantity: 0, method: 0, timing: 0, followup: 0 };

rows.forEach(function (r) {
  const empty = r.axes.filter(function (a) { return a.score === 1; });
  empty.forEach(function (a) { blind[a.key] = (blind[a.key] || 0) + 1; });
  console.log('  '
    + r.app.toFixed(1).padStart(5)
    + (r.actual === null ? '     —' : (r.actual.toFixed(1) + '/4').padStart(7))
    + '   ' + (empty.map(function (a) { return a.label; }).join('・') || '（なし）').padEnd(28)
    + ' ' + r.item.slice(0, 20));
});

console.log('');
console.log('■ 観点ごとに「何も拾えなかった」件数（全' + rows.length + '件中）');
console.log('  件数が多い観点ほど、語彙が足りていない可能性があります。');
console.log('');
const labels = { specificity: 'S 具体性', quantity: 'M 定量性', method: 'A 手段', timing: 'T 期限・頻度', followup: '＋ 報告・振返り' };
Object.keys(blind).forEach(function (k) {
  console.log('  ' + labels[k].padEnd(16) + String(blind[k]).padStart(3) + '件');
});

console.log('');
console.log('■ 一度も拾えなかった目標の中身（語彙の穴を探す手がかり）');

rows.filter(function (r) {
  return r.axes.filter(function (a) { return a.score === 1; }).length >= 2;
}).forEach(function (r) {
  console.log('');
  console.log('  ● ' + r.item + '（アプリ ' + r.app + '/5）');
  console.log('    ' + r.goal.slice(0, 76) + '…');
  console.log('    拾えた数量: ' + (r.detected.quantities.join('／') || 'なし'));
  console.log('    拾えた行動: ' + (r.detected.actions.join('／') || 'なし'));
  console.log('    拾えた頻度: ' + (r.detected.frequencies.concat(r.detected.deadlines).join('／') || 'なし'));
  console.log('    NGワード  : ' + (r.detected.vague.join('／') || 'なし'));
});
