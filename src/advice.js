/**
 * コンピテンシー目標ナビ — 指摘コメント生成
 *
 * 採点結果（scoring.js）を受け取り、上長の立場から見た指摘を日本語で組み立てる。
 * AIは使わない。弱い観点と、検出した言葉から文章を選ぶ。
 *
 * 指摘はSMARTの法則（S 具体的／M 測れる／A 達成できる／R 指標とつながる／T 期限がある）に沿う。
 */

/** SMARTの各文字の説明。画面で凡例として使う */
const SMART_MEANING = {
  'S': { word: 'Specific', label: '具体的', note: '誰の何を、どの場面で' },
  'M': { word: 'Measurable', label: '測れる', note: '件数・人数・％で数えられる' },
  'A': { word: 'Achievable', label: '達成できる', note: '自分の力で動かせて、無理のない量' },
  'R': { word: 'Relevant', label: '指標とつながる', note: '担当するMBOに効く' },
  'T': { word: 'Time-bound', label: '期限がある', note: 'いつまでに・どの頻度で' },
  '＋': { word: 'Evaluate & Review', label: '見直す', note: '報告と立て直しの仕組み' },
};

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
    key: 'dependent',
    test: function (r) {
      return r.detected.dependents.length > 0;
    },
    message: function (r) {
      return '「' + r.detected.dependents[0] + '」のように、他の人が動くことを前提にした書き方が入っています。'
        + 'SMARTのA（達成できる）は、自分の判断で動かせることが条件です。'
        + '相手が動かなかった場合でも自分が実行できる行動に言い換えてください。';
    },
  },
  {
    key: 'stretch',
    test: function (r) {
      return r.detected.growthRatio !== null && r.detected.growthRatio >= 3 && r.detected.quantities.length === 0;
    },
    message: function (r, mbo) {
      return mbo.current + 'から' + mbo.target + 'は現状の3倍以上です。'
        + '意気込みとしては良いのですが、SMARTのA（達成できる）の観点では、'
        + '毎週あるいは毎日どれだけ積み上げれば届くのかを数字で示す必要があります。';
    },
  },
  {
    key: 'backcast',
    test: function (r, mbo) {
      return Boolean(mbo && mbo.current && mbo.target)
        && r.axes.filter(function (a) { return a.key === 'linkage'; })[0].score <= 2;
    },
    message: function (r, mbo) {
      return mbo.current + '→' + mbo.target + 'への逆算（毎月あるいは毎週どれだけ積み上げるのか）が抜けています。'
        + '差を埋める量を自分で計算し、その数字を目標に書き込んでください。';
    },
  },
];

/** 観点ごとの指摘文。点数が低いときに出す */
const AXIS_ADVICE = {
  specificity: '［S 具体的］誰の何を対象にするのかが読み取れません。担当する人数・件数・範囲を書き入れてください。',
  quantity: '［M 測れる］数字が入っていないため、やったかどうかを後から数えられません。件数・人数・％のいずれかで書いてください。',
  linkage: '［R 指標とつながる］対応するMBOとのつながりが見えません。指標名と、現状値から目標値までの差を本文に入れてください。',
  method: '［A 達成できる］何をするのかが動作になっていません。「提案する」「一覧化する」「同行する」のように、自分が動かせる行動で書いてください。',
  timing: '［T 期限がある］いつやるのかが決まっていません。「毎週金曜に」「月末までに」のように、頻度か期限のどちらかを必ず入れてください。',
  followup: '［＋ 見直す］進み具合を誰にどう報告するか、遅れたときにどう立て直すかがありません。報告の場と、遅れた場合の手当てを書き添えてください。',
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
    .filter(function (a) { return a.score <= 2; })
    .sort(function (a, b) { return a.score - b.score; });

  weakAxes.forEach(function (axis) {
    const text = AXIS_ADVICE[axis.key];
    if (text && comments.indexOf(text) === -1) comments.push(text);
  });

  const strongAxes = result.axes.filter(function (a) { return a.score >= 4; });
  const praise = strongAxes.length > 0 ? AXIS_PRAISE[strongAxes[0].key] : null;

  // SMARTのどの文字が満たせていて、どれが足りないか（S→M→A→R→T→＋の順に並べる）
  const SMART_ORDER = ['S', 'M', 'A', 'R', 'T', '＋'];
  const smart = result.axes.slice().sort(function (x, y) {
    return SMART_ORDER.indexOf(x.smart) - SMART_ORDER.indexOf(y.smart);
  }).map(function (axis) {
    const meaning = SMART_MEANING[axis.smart] || {};
    return {
      letter: axis.smart,
      label: meaning.label || axis.label,
      note: meaning.note || axis.hint,
      met: axis.score >= 3,
    };
  });

  return {
    comments: comments.slice(0, 5),
    praise: praise,
    weakAxes: weakAxes,
    smart: smart,
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

  // SMARTの順（S→M→A→R→T→＋）に枠が並ぶようにしている
  return '〈対象と件数：S〉に対して〈自分が動かせる行動：A〉を〈頻度・期限：T〉に実施し、'
    + '〈行動の量：M〉を積み上げることで、'
    + indicator + 'を' + current + 'から' + target + 'にする〈R〉。'
    + '進捗は〈頻度〉に〈報告先〉へ報告し、遅れた場合は〈立て直しの手当て〉を行う〈＋〉。';
}

if (typeof module !== 'undefined') {
  module.exports = { buildAdvice: buildAdvice, buildSkeleton: buildSkeleton, SMART_MEANING: SMART_MEANING };
}
