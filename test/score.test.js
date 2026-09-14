/**
 * 採点エンジンの動作確認。
 * 参考資料（コンピテンシー目標AI診断）の初稿・改善版の点差を再現できるか見る。
 * 実行: node test/score.test.js
 */
const { scoreDraft, judge } = require('../src/scoring.js');

const cases = [
  {
    name: 'MBO① 実施後レビュー期限遵守率',
    mbo: { name: '実施後レビュー期限遵守率', current: '80%', target: '100%' },
    draft: '実施後レビューを忘れないように、期限をしっかり守ってやるようにします。',
    improved: '担当20名の実施後レビュー期限を毎月1日に一覧化し、期限1ヶ月前に面談を設定、2週間前までに管理者へドラフト提出する運用で、期限遵守率を80%から100%にする。進捗は週次ミーティングで報告し、遅延が出た件は当週中にリカバリー日程を確定して消し込む。',
  },
  {
    name: 'MBO② 平均稼働率',
    mbo: { name: '全部門平均稼働率', current: '85%', target: '92%' },
    draft: 'お客様に喜んでもらえる支援をして、稼働率を上げられるように頑張ります。',
    improved: '欠席連絡を受けた当日中に振替利用を提案し月20件以上とする。空き枠情報は毎週金曜に主要取引校2校へ共有し、説明会を月4件実施して翌月の受注につなげ、平均稼働率を85%から92%へ引き上げる。実績は週次で営業所長に報告し、翌週の受入枠を調整する。',
  },
  {
    name: 'MBO③ ヒヤリハット報告件数',
    mbo: { name: 'ヒヤリハット報告件数', current: '3件/月', target: '8件/月' },
    draft: '事故がないように気をつけて、ヒヤリハットがあったらちゃんと報告するようにします。',
    improved: '毎日の終業前5分でヒヤリハット記録シートを確認し、気づいた事象を当日中に登録して月8件以上とする。毎週月曜の朝礼で前週分を共有し、再発防止策を1件以上決めて翌週に点検する。',
  },
];

let failed = 0;
cases.forEach(function (c) {
  const before = scoreDraft(c.draft, c.mbo);
  const after = scoreDraft(c.improved, c.mbo);
  const gain = after.total - before.total;
  console.log('\n■ ' + c.name);
  console.log('  初稿   ' + String(before.total).padStart(2) + '/30  ' + judge(before.total).label
    + '   ' + before.axes.map(function (a) { return a.label + ':' + a.score; }).join(' '));
  console.log('  改善版 ' + String(after.total).padStart(2) + '/30  ' + judge(after.total).label
    + '   ' + after.axes.map(function (a) { return a.label + ':' + a.score; }).join(' '));
  console.log('  改善幅 +' + gain);

  if (before.total > 12) { console.log('  NG: 初稿が高すぎる（弱い目標を見抜けていない）'); failed++; }
  if (after.total < 25) { console.log('  NG: 改善版が合格水準に届いていない'); failed++; }
  if (gain < 12) { console.log('  NG: 改善幅が小さすぎる'); failed++; }
});

console.log('\n' + (failed === 0 ? 'すべて期待どおり' : failed + ' 件が期待とずれています'));
process.exit(failed === 0 ? 0 : 1);
