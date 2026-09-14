/**
 * 採点エンジンの動作確認。
 * 弱い初稿と、書き直した改善版とで、はっきり点差が出るかを見る。
 * 実行: node test/score.test.js
 */
const { scoreDraft, judge } = require('../src/scoring.js');

const cases = [
  {
    name: '実施後レビューの期限を守る',
    draft: '実施後レビューを忘れないように、期限をしっかり守ってやるようにします。',
    improved: '担当20名の実施後レビュー期限を毎月1日に一覧化し、期限の2週間前までに管理者へドラフト提出する。'
      + '進捗は週次ミーティングで報告し、遅れが出た件は当週中にリカバリー日程を確定して消し込む。',
  },
  {
    name: '稼働率を上げる',
    draft: 'お客様に喜んでもらえる支援をして、稼働率を上げられるように頑張ります。',
    improved: '欠席連絡を受けた当日中に振替利用を提案し月20件以上とする。空き枠情報は毎週金曜に主要取引校2校へ共有し、'
      + '説明会を月4件実施する。実績は週次で営業所長に報告し、翌週の受入枠を調整する。',
  },
  {
    name: 'ヒヤリハットを報告する',
    draft: '事故がないように気をつけて、ヒヤリハットがあったらちゃんと報告するようにします。',
    improved: '毎日の終業前5分でヒヤリハット記録シートを確認し、気づいた事象を当日中に登録して月8件以上とする。'
      + '毎週月曜の朝礼で前週分を共有し、再発防止策を1件以上決めて翌週に点検する。',
  },
];

let failed = 0;
cases.forEach(function (c) {
  const before = scoreDraft(c.draft);
  const after = scoreDraft(c.improved);
  const gain = after.total - before.total;

  console.log('\n■ ' + c.name);
  console.log('  初稿   ' + before.total.toFixed(1) + '/4  ' + judge(before.total).label
    + '   ' + before.axes.map(function (a) { return a.smart + ':' + a.score; }).join(' '));
  console.log('  改善版 ' + after.total.toFixed(1) + '/4  ' + judge(after.total).label
    + '   ' + after.axes.map(function (a) { return a.smart + ':' + a.score; }).join(' '));
  console.log('  改善幅 +' + gain.toFixed(1));

  if (before.axes.length !== 5) { console.log('  NG: 観点は5つのはず'); failed++; }
  if (before.total > 2.4) { console.log('  NG: 初稿が高すぎる（弱い目標を見抜けていない）'); failed++; }
  if (after.total < 3.5) { console.log('  NG: 改善版が十分な水準に届いていない'); failed++; }
  if (gain < 1.5) { console.log('  NG: 改善幅が小さすぎる'); failed++; }
});

console.log('\n' + (failed === 0 ? 'すべて期待どおり' : failed + ' 件が期待とずれています'));
process.exit(failed === 0 ? 0 : 1);
