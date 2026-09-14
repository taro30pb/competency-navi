/**
 * コンピテンシー目標ナビ — 指摘コメント生成
 *
 * 採点結果（scoring.js）を受け取り、上長の立場から見た指摘を日本語で組み立てる。
 * AIは使わない。弱い観点と、検出した言葉から文章を選ぶ。
 */

/** 語幹のまま出すと読みにくい言葉を、指摘文での見せ方に直す */
const DISPLAY_FORM = {
  '頑張': '頑張ります', 'がんば': 'がんばります', '努め': '努めます',
  '心がけ': '心がけます', '心掛け': '心掛けます', '意識し': '意識します',
  '喜んでもら': '喜んでもらう', '満足してもら': '満足してもらう',
  '気をつけ': '気をつける', '気を付け': '気を付ける',
};

function displayWord(word) {
  return DISPLAY_FORM[word] || word;
}

/** 初稿が弱くなる典型的な原因。優先して指摘する */
const ROOT_CAUSES = [
  {
    key: 'feeling',
    test: function (r) {
      return r.detected.vague.length > 0;
    },
    message: function (r) {
      const words = r.detected.vague.slice(0, 3).map(displayWord).join('」「');
      return '「' + words + '」は気持ちであって行動ではありません。'
        + '上長はこの書き方では達成・未達を判定できないので、目に見える動きに置き換えてください。';
    },
  },
  {
    key: 'outcome',
    test: function (r) {
      return r.detected.outcomes.length > 0 && r.detected.actions.length === 0;
    },
    message: function () {
      return '書かれているのは成果であって、行動ではありません。'
        + 'その成果を生む動きは何かを考え、件数で数えられる行動に分解してください。';
    },
  },
  {
    key: 'backcast',
    test: function (r, mbo) {
      return Boolean(mbo && mbo.current && mbo.target)
        && r.axes.filter(function (a) { return a.key === 'linkage'; })[0].score <= 3;
    },
    message: function (r, mbo) {
      return mbo.current + '→' + mbo.target + 'への逆算（毎月あるいは毎週どれだけ積み上げるのか）が抜けています。'
        + '差を埋める量を自分で計算し、その数字を目標に書き込んでください。';
    },
  },
];

/** 観点ごとの指摘文。点数が低いときに出す */
const AXIS_ADVICE = {
  specificity: '誰の何を対象にするのかが読み取れません。担当する人数・件数・範囲を書き入れてください。',
  quantity: '数字が入っていないため、やったかどうかを後から数えられません。件数・人数・％のいずれかで書いてください。',
  linkage: '対応するMBOとのつながりが見えません。指標名と、現状値から目標値までの差を本文に入れてください。',
  method: '何をするのかが動作になっていません。「提案する」「一覧化する」「同行する」のように、自分が動かせる行動で書いてください。',
  timing: 'いつやるのかが決まっていません。「毎週金曜に」「月末までに」のように、頻度か期限のどちらかを必ず入れてください。',
  followup: '進み具合を誰にどう報告するか、遅れたときにどう立て直すかがありません。報告の場と、遅れた場合の手当てを書き添えてください。',
};

/** 褒める材料。強い観点があれば1つだけ返す */
const AXIS_PRAISE = {
  specificity: '対象がはっきり書けています。',
  quantity: '数字で数えられる形になっています。',
  linkage: 'MBOとのつながりが取れています。',
  method: '行動が具体的に書けています。',
  timing: '期限と頻度が決まっています。',
  followup: '報告と振り返りの仕組みが入っています。',
};

/**
 * 指摘コメントを組み立てる。
 * result … scoreDraft() の戻り値
 * mbo    … { name, current, target }
 */
function buildAdvice(result, mbo) {
  mbo = mbo || {};
  const comments = [];

  ROOT_CAUSES.forEach(function (cause) {
    if (cause.test(result, mbo)) comments.push(cause.message(result, mbo));
  });

  const weakAxes = result.axes
    .filter(function (a) { return a.score <= 3; })
    .sort(function (a, b) { return a.score - b.score; });

  weakAxes.forEach(function (axis) {
    const text = AXIS_ADVICE[axis.key];
    if (text && comments.indexOf(text) === -1) comments.push(text);
  });

  const strongAxes = result.axes.filter(function (a) { return a.score >= 4; });
  const praise = strongAxes.length > 0 ? AXIS_PRAISE[strongAxes[0].key] : null;

  return {
    comments: comments.slice(0, 5),
    praise: praise,
    weakAxes: weakAxes,
  };
}

/**
 * 書き直しの雛形を作る。
 * AIを使わないので文章そのものは書けないが、埋めるべき枠は示せる。
 */
function buildSkeleton(result, mbo) {
  mbo = mbo || {};
  const indicator = mbo.name || '〈指標名〉';
  const current = mbo.current || '〈現状値〉';
  const target = mbo.target || '〈目標値〉';

  return '〈対象と件数〉に対して〈具体的な行動〉を〈頻度・期限〉に実施し、'
    + indicator + 'を' + current + 'から' + target + 'にする。'
    + '進捗は〈頻度〉に〈報告先〉へ報告し、遅れた場合は〈立て直しの手当て〉を行う。';
}

if (typeof module !== 'undefined') {
  module.exports = { buildAdvice: buildAdvice, buildSkeleton: buildSkeleton };
}
