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

// 上長の評点は4点満点、アプリは5点満点なので、同じ尺度に直して比べる
function toFive(fourPoint) {
  return fourPoint === null ? null : Math.round(((fourPoint - 1) / 3 * 4 + 1) * 10) / 10;
}

console.log('■ 上長の評点と、アプリの採点');
console.log('');
console.log('  評点  換算  アプリ  差    項目');

let gaps = [];
rows.forEach(function (r) {
  const converted = toFive(r.actual);
  const diff = converted === null ? null : Math.round((r.app - converted) * 10) / 10;
  console.log('  '
    + (r.actual === null ? ' — ' : r.actual.toFixed(1)).padStart(4)
    + (converted === null ? '   — ' : converted.toFixed(1).padStart(6))
    + r.app.toFixed(1).padStart(8)
    + (diff === null ? '     —' : (diff > 0 ? '+' : '') + diff.toFixed(1)).padStart(7)
    + '   ' + r.item.slice(0, 22));
  if (diff !== null && diff <= -1.0) gaps.push({ row: r, diff: diff });
});

console.log('');
if (gaps.length === 0) {
  console.log('上長の評点より大きく低く出たものはありません。');
} else {
  console.log('■ 上長の評点よりアプリが1点以上低く出たもの（' + gaps.length + '件）');
  console.log('  ここに語彙の穴か、基準のずれが隠れている可能性があります。');
  gaps.sort(function (a, b) { return a.diff - b.diff; });
  gaps.forEach(function (g) {
    const r = g.row;
    console.log('');
    console.log('  ● ' + r.item + '　上長 ' + r.actual + '/4 → アプリ ' + r.app + '/5（差 ' + g.diff + '）');
    console.log('    ' + r.goal.slice(0, 76) + '…');
    console.log('    弱い観点: ' + r.axes.filter(function (a) { return a.score !== null && a.score <= 2; })
      .map(function (a) { return a.label; }).join('・') || '（なし）');
    console.log('    拾えた数量: ' + (r.detected.quantities.join('／') || 'なし'));
    console.log('    拾えた行動: ' + (r.detected.actions.join('／') || 'なし'));
    console.log('    曖昧な語  : ' + (r.detected.vague.join('／') || 'なし'));
  });
}
