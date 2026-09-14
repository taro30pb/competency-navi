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
  'R': { word: 'Relevant', label: '項目に効く', note: '選んだコンピテンシー項目に効く（点数にせず、指摘の中で確認する）' },
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

/**
 * コンピテンシーの定義文から、内容を表す言葉だけを取り出す。
 * 「環境や状況の変化に応じる力」→ ['環境', '状況', '変化', '応じる力']
 *
 * 注意：これで本文との一致を見ても、項目に沿っているかは判定できない。
 * 「変化に応じる」を「変わる場面で試す」と書く人を拾えないため。
 * 沿っているかどうかの判断はAIにつないだ後に任せる。
 */
function definitionKeywords(definition) {
  return (definition || '')
    .split(/[やにをはがのとでも、。・（）()　\s]+/)
    .map(function (w) { return w.trim(); })
    .filter(function (w) { return w.length >= 2; });
}

/** 書いた文章が、選んだコンピテンシーの内容に触れているか */
function touchesCompetency(text, competency) {
  if (!competency) return true;
  const words = definitionKeywords(competency.definition).concat([competency.name]);
  return words.some(function (w) { return text.indexOf(w) !== -1; });
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
      return '［S 具体的］「' + words + '」は気持ちを表す言葉なので、やったかどうかを後から確かめられません。'
        + '目に見える動きに言い換えると、期末に自分の成果として説明しやすくなります。';
    },
  },
  {
    key: 'outcome',
    test: function (r) {
      return r.detected.outcomes.length > 0 && r.detected.actions.length === 0;
    },
    message: function () {
      return '［A 達成できる］書かれているのは成果で、そこに至る行動がまだ見えません。'
        + 'その成果を生む動きを1つ2つ挙げて、件数で数えられる形にすると強くなります。';
    },
  },
  {
    key: 'dependent',
    test: function (r) {
      return r.detected.dependents.length > 0;
    },
    message: function (r) {
      return '［A 達成できる］「' + r.detected.dependents[0] + '」のように、他の人が動くことを前提にした書き方が入っています。'
        + 'SMARTのA（達成できる）は、自分の判断で動かせることが条件です。'
        + '相手が動かなかった場合でも自分で進められる行動を1つ足しておくと安心です。';
    },
  },
];

/** 観点ごとの指摘文。点数が低いときに出す */
const AXIS_ADVICE = {
  specificity: '［S 具体的］誰の何を対象にするのかが読み取れません。担当する人数・件数・範囲を一言添えると、ぐっと伝わります。',
  quantity: '［M 測れる］数字が入っていないため、やったかどうかを後から数えにくくなります。件数・人数・％のいずれかを入れておくと、期末の説明が楽になります。',
  method: '［A 達成できる］何をするのかが動作になっていません。「提案する」「一覧化する」「同行する」のように、自分が動かせる行動の形にすると進めやすくなります。',
  timing: '［T 期限がある］いつやるのかが決まっていません。「毎週金曜に」「月末までに」のように、頻度か期限のどちらかがあると、後回しになりにくくなります。',
  followup: '［＋ 見直す］進み具合を誰にどう報告するか、遅れたときにどう立て直すかがありません。報告の場と、遅れたときの手当てを書き添えておくと、途中で止まりません。',
};

/** 褒める材料。強い観点があれば1つだけ返す */
const AXIS_PRAISE = {
  specificity: '対象がはっきり書けています。',
  quantity: '数字で数えられる形になっています。',
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

  const list = comments.slice(0, 5);

  // 選んだ項目に効く行動かどうかは、言葉の一致では判定できない（「変化」と「変わる場面」は
  // 同じことを言っているが文字は違う）。決めつけずに、本人に確認してもらう。
  if (mbo.competency) {
    list.push('［R 指標とつながる］この行動は「' + mbo.competency.name + '（' + mbo.competency.definition
      + '）」に効きますか。上長はこの項目で見るので、ずれを感じたら'
      + '項目の言葉に寄せておくと伝わりやすくなります。');
  }

  return {
    comments: list,
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
  const item = mbo.competency ? mbo.competency.name : '選んだ項目';

  // SMARTの順（S→M→A→T→＋）に枠が並ぶようにしている
  return '〈対象と件数：S〉に対して〈自分が動かせる行動：A〉を〈頻度・期限：T〉に実施し、'
    + '〈行動の量：M〉を積み上げる。'
    + '進捗は〈頻度〉に〈報告先〉へ報告し、遅れた場合は〈立て直しの手当て〉を行う〈＋〉。'
    + 'これにより「' + item + '」の行動として示す。';
}

if (typeof module !== 'undefined') {
  module.exports = { buildAdvice: buildAdvice, buildSkeleton: buildSkeleton, SMART_MEANING: SMART_MEANING };
}
