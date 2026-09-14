/**
 * SMARTの観点（特にA：達成できる）の検査が効いているかを見る。
 * 実行: node test/smart.test.js
 */
const { scoreDraft } = require('../src/scoring.js');
const { buildAdvice } = require('../src/advice.js');

const mbo = { name: 'ヒヤリハット報告件数', current: '3件/月', target: '8件/月' };

const cases = [
  {
    name: '他人任せの書き方はA（達成できる）を下げる',
    draft: 'ヒヤリハットがあったら、現場の担当者に報告してもらうようにします。',
    expect: function (r, adv) {
      const hasComment = adv.comments.some(function (c) { return c.indexOf('他の人が動くことを前提') !== -1; });
      return hasComment && !smartMet(adv, 'A');
    },
  },
  {
    name: '自分で動く書き方ならA（達成できる）が立つ',
    draft: '毎日の終業前5分でヒヤリハット記録シートを確認し、気づいた事象を当日中に自分で登録して月8件以上とする。毎週月曜の朝礼で前週分を共有し、再発防止策を1件決めて翌週に点検する。',
    expect: function (r, adv) {
      return smartMet(adv, 'A') && smartMet(adv, 'M') && smartMet(adv, 'T');
    },
  },
  {
    name: '裏づけのない大きな跳ね上がりは指摘する',
    mbo: { name: '来店組数', current: '10組/月', target: '50組/月' },
    draft: '来店組数を増やせるように、チラシの配布やSNSの発信を続けていきます。',
    expect: function (r, adv) {
      return adv.comments.some(function (c) { return c.indexOf('3倍以上') !== -1; });
    },
  },
  {
    name: 'SMARTはS→M→A→R→Tの順で返る',
    draft: '毎週金曜に担当5件を点検して報告する。',
    expect: function (r, adv) {
      return adv.smart.map(function (x) { return x.letter; }).join('') === 'SMART＋';
    },
  },
];

function smartMet(adv, letter) {
  return adv.smart.filter(function (x) { return x.letter === letter; })[0].met;
}

let failed = 0;
cases.forEach(function (c) {
  const m = c.mbo || mbo;
  const r = scoreDraft(c.draft, m);
  const adv = buildAdvice(r, m);
  const ok = c.expect(r, adv);
  console.log((ok ? '  OK  ' : '  NG  ') + c.name
    + '   [' + adv.smart.map(function (x) { return x.letter + (x.met ? '○' : '×'); }).join(' ') + ']');
  if (!ok) failed++;
});

console.log('\n' + (failed === 0 ? 'すべて期待どおり' : failed + ' 件が期待とずれています'));
process.exit(failed === 0 ? 0 : 1);
