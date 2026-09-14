/**
 * SMARTの観点（特にA：達成できる）の検査と、選んだコンピテンシー項目の扱いを見る。
 * 実行: node test/smart.test.js
 */
const { scoreDraft } = require('../src/scoring.js');
const { buildAdvice, buildSkeleton } = require('../src/advice.js');

const competency = { code: '1-11', name: '適応力', definition: '環境や状況の変化に応じる力' };

function smartMet(adv, letter) {
  const hit = adv.smart.filter(function (x) { return x.letter === letter; })[0];
  return hit ? hit.met : false;
}

const cases = [
  {
    name: '他人任せの書き方はA（達成できる）を下げる',
    draft: 'ヒヤリハットがあったら、現場の担当者に報告してもらうようにします。',
    expect: function (r, adv) {
      return adv.comments.some(function (c) { return c.indexOf('他の人が動くことを前提') !== -1; })
        && !smartMet(adv, 'A');
    },
  },
  {
    name: '自分で動く書き方ならS・M・A・Tが立つ',
    draft: '毎日の終業前5分で担当20件の記録シートを確認し、気づいた事象を当日中に自分で登録して月8件以上とする。'
      + '毎週月曜の朝礼で前週分を共有し、再発防止策を1件決めて翌週に点検する。',
    expect: function (r, adv) {
      return ['S', 'M', 'A', 'T'].every(function (l) { return smartMet(adv, l); });
    },
  },
  {
    name: '観点はS→M→A→R→T→＋の6つ（Rは点数にしない）',
    draft: '毎週金曜に担当5件を点検して所長に報告する。',
    expect: function (r, adv) {
      const relevance = r.axes.filter(function (a) { return a.smart === 'R'; })[0];
      return r.axes.length === 6
        && relevance.score === null
        && adv.smart.map(function (x) { return x.letter; }).join('') === 'SMART＋';
    },
  },
  {
    name: '項目を選ぶと、確認の一文と型にその項目名が入る',
    draft: '毎週金曜に担当5件を点検して所長に報告する。',
    competency: competency,
    expect: function (r, adv, mbo) {
      return adv.comments.some(function (c) { return c.indexOf('適応力') !== -1; })
        && buildSkeleton(r, mbo).indexOf('適応力') !== -1;
    },
  },
];

let failed = 0;
cases.forEach(function (c) {
  const mbo = c.competency ? { competency: c.competency } : {};
  const r = scoreDraft(c.draft, mbo);
  const adv = buildAdvice(r, mbo);
  const ok = c.expect(r, adv, mbo);
  console.log((ok ? '  OK  ' : '  NG  ') + c.name
    + '   [' + adv.smart.map(function (x) { return x.letter + (x.met ? '○' : '×'); }).join(' ') + ']');
  if (!ok) failed++;
});

console.log('\n' + (failed === 0 ? 'すべて期待どおり' : failed + ' 件が期待とずれています'));
process.exit(failed === 0 ? 0 : 1);
