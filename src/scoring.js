/**
 * コンピテンシー目標ナビ — 採点エンジン
 *
 * 行動目標の文章を6観点で採点し、指摘コメントの材料を返す。
 * 各観点1〜4点、最終点はその平均（4点満点）。社のコンピテンシー評価の満点に合わせている。
 * AIは使わない。すべて手元で完結する検査。
 *
 * 6観点はSMARTの法則に対応させている。
 *   具体性      S  Specific    はっきりしているか
 *   定量性      M  Measurable  数えられるか
 *   手段        A  Achievable  自分の力でやれるか
 *   期限・頻度   T  Time-bound  いつまでかが決まっているか
 *   報告・振返り  ＋  SMARTを保つ仕組み（SMARTERのE・R）
 *
 * R（Relevant＝選んだコンピテンシー項目に効くか）は採点しない。
 * 言葉の一致では測れないため（「変化に応じる」と「変わる場面で試す」は同じことを指す）。
 * 指摘の中で本人に確認してもらい、判定はAIにつないだ後に任せる。
 */

/** 気持ち・態度を表すだけで、行動として測れない言葉 */
const VAGUE_WORDS = [
  '頑張', 'がんば', 'しっかり', 'きちんと', 'ちゃんと', '努め', '心がけ', '心掛け',
  '意識し', 'なるべく', 'できるだけ', '出来るだけ', '積極的に', '前向きに',
  '忘れないように', '丁寧に', 'スムーズに', '適切に', '随時', '可能な限り',
  '喜んでもら', '満足してもら', '信頼される', '迷惑をかけない', '気をつけ', '気を付け',
];

/** 成果（結果）を表す言葉。行動に分解されていないと減点対象になる */
const OUTCOME_WORDS = ['率', '売上', '受注高', '粗利', '利益', '実績', 'シェア'];

/** 実際の動作を表す言葉。多いほど「手段」が具体的 */
const ACTION_VERBS = [
  '提案', '共有', '作成', '一覧化', '記録', '確認', '提出', '実施', '案内', '訪問',
  '連絡', '点検', '登録', '設定', '依頼', '同行', '説明', '集計', '分析', '整理',
  '配布', 'レビュー', '面談', '架電', '送付', '入力', '更新', '見積', '発注', '巡回',
];

/** 自分ではなく他人が動くことになっている言葉。達成可能性（A）を下げる */
const DEPENDENT_WORDS = ['してもらう', 'してもらえ', 'いただく', 'させる', '会社が', '上司が', '上長が', '他部署が', '誰かが'];

/** 仕組み・型として残る言葉 */
const SYSTEM_WORDS = ['一覧', 'チェックリスト', 'テンプレート', 'フォーム', 'ルール', '手順', '仕組み', '台帳', 'シート'];

/** 期限を表す言葉 */
const DEADLINE_WORDS = ['までに', '以内', '当日', '翌日', '翌週', '翌月', '期末', '月末', '週末'];

/** 頻度を表す言葉 */
const FREQUENCY_WORDS = ['毎日', '毎週', '毎月', '週次', '月次', '日次', '四半期', '毎回', '隔週'];

/** 報告先・報告行為を表す言葉 */
const REPORT_WORDS = ['報告', '共有', '提出', '朝礼', 'ミーティング', '会議', '上長', '所長', '店長', '上司', '定例'];

/** 振り返り・立て直しを表す言葉 */
const REVIEW_WORDS = ['振り返', 'ふり返', '見直', 'レビュー', '改善', '修正', 'リカバリ', '調整', '検証', '再発防止', '対策'];

/**
 * 行動の言葉が「動詞の形」で使われているかを見る。
 * 「実施後レビュー」は名詞なので行動と数えないが、「レビューする」「点検して」は数える。
 */
function findActions(text) {
  return ACTION_VERBS.filter(function (w) {
    let from = 0;
    while (true) {
      const at = text.indexOf(w, from);
      if (at === -1) return false;
      const after = text.slice(at + w.length, at + w.length + 3);
      if (/^(する|し[てたまなよ]?|させ|され|でき|を行|を実施|に行)/.test(after)) return true;
      from = at + 1;
    }
  });
}

/** 文章中に含まれる語を拾う */
function findWords(text, words) {
  return words.filter(function (w) { return text.indexOf(w) !== -1; });
}

/** 全角数字を半角に直す */
function toHalfWidth(text) {
  return text.replace(/[０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
  });
}

/** 文章中の数値表現を拾う */
function findNumbers(text) {
  return toHalfWidth(text).match(/\d+(?:\.\d+)?/g) || [];
}

/** 単位の付いた数値だけを拾う（「20名」は数えるが、裸の数字は数えない） */
function findQuantities(text) {
  return toHalfWidth(text).match(/\d+(?:\.\d+)?\s*(?:%|％|件|名|人|回|枚|社|店|校|時間|円|万円)/g) || [];
}

/** 1〜5点の範囲に収める */
function clamp(score) {
  return Math.max(1, Math.min(5, score));
}

/**
 * 6観点で採点する。
 * draft … 自己設定の行動目標（初稿）
 * mbo   … 選んだコンピテンシー項目 { competency }
 */
function scoreDraft(draft, mbo) {
  mbo = mbo || {};
  const text = (draft || '').trim();
  const vague = findWords(text, VAGUE_WORDS);
  const actions = findActions(text);
  const systems = findWords(text, SYSTEM_WORDS);
  const deadlines = findWords(text, DEADLINE_WORDS);
  const frequencies = findWords(text, FREQUENCY_WORDS);
  const reports = findWords(text, REPORT_WORDS);
  const reviews = findWords(text, REVIEW_WORDS);
  const outcomes = findWords(text, OUTCOME_WORDS);
  const dependents = findWords(text, DEPENDENT_WORDS);
  const quantities = findQuantities(text);

  // 観点ごとに4つの条件を見て、満たした数＋1を点数とする（1〜5点）。
  const axes = [];
  function axis(key, label, smart, hint, conditions) {
    let met = 0;
    conditions.forEach(function (c) { if (c) met += 1; });
    axes.push({ key: key, label: label, smart: smart, score: 1 + met, hint: hint });
  }

  // ① 具体性（S 具体的）
  axis('specificity', '具体性', 'S', '誰の・何を・どの場面で、が読んで分かるか', [
    /担当|自分|私|チーム|部署|店舗|現場|顧客|お客様|施主|案件|物件|会員|生徒|利用者/.test(text),
    /(時|際|場合|後|前|当日|受けた|きたら|あったら)/.test(text),
    vague.length === 0,
    quantities.length >= 1,          // 対象の規模が数で示されている
  ]);

  // ② 定量性（M 測れる）
  axis('quantity', '定量性', 'M', '件数・人数・％など、数えられる形で書かれているか', [
    quantities.length >= 1,
    quantities.length >= 2,
    quantities.length >= 3,
    /(以上|以内|まで|率|達成)/.test(text),   // どこまでやれば達成かが書かれている
  ]);

  // ③ 手段（A 達成できる）
  axis('method', '手段', 'A', '結果ではなく、自分が動かせる行動で書かれているか', [
    actions.length >= 1,
    actions.length >= 2,
    // 他人任せでなく、成果の言いっぱなしでもない
    dependents.length === 0 && !(outcomes.length > 0 && actions.length === 0),
    actions.length >= 3 || systems.length >= 1,   // 手順や仕組みとして残る形になっている
  ]);

  // R（項目に効くか）は点数にしない。言葉の一致では測れないため、確認として並べる。
  // 画面では点数の代わりに「要確認」と出す。判定はAIにつないだ後に行う。
  axes.push({
    key: 'relevance', label: '項目との関連', smart: 'R', score: null,
    hint: '選んだコンピテンシー項目に効く行動になっているか',
  });

  // ④ 期限・頻度（T 期限がある）
  axis('timing', '期限・頻度', 'T', 'いつまでに・どのくらいの頻度で、が決まっているか', [
    frequencies.length + deadlines.length >= 1,
    frequencies.length >= 1 && deadlines.length >= 1,
    frequencies.length + deadlines.length >= 3,
    /(月曜|火曜|水曜|木曜|金曜|土曜|日曜|月末|週末|\d+日|\d+時)/.test(toHalfWidth(text)),  // 日や曜日まで決まっている
  ]);

  // ⑤ 報告・振返り（＋ 見直す）
  axis('followup', '報告・振返り', '＋', '誰に報告し、ずれたときにどう立て直すかがあるか', [
    reports.length >= 1,
    reviews.length >= 1,
    reports.length >= 1 && (frequencies.length >= 1 || deadlines.length >= 1),
    /(所長|店長|上長|上司|課長|部長|朝礼|会議|ミーティング|定例)/.test(text),   // 報告先や場が決まっている
  ]);

  // 最終点は、点数のある5観点の平均。小数第1位まで出す（例 3.2／5）
  const scored = axes.filter(function (a) { return a.score !== null; });
  let sum = 0;
  scored.forEach(function (a) { sum += a.score; });
  const total = Math.round((sum / scored.length) * 10) / 10;

  return {
    text: text,
    total: total,
    max: 5,
    axes: axes,
    detected: {
      vague: vague, actions: actions, systems: systems, deadlines: deadlines,
      frequencies: frequencies, reports: reports, reviews: reviews,
      outcomes: outcomes, quantities: quantities, dependents: dependents,
    },
  };
}

/** 合計点から判定を返す */
function judge(total) {
  // 点数は人事評価ではなく、書き方の目安。否定的な言い方は使わない。
  const note = '　※この点数は評価ではなく、書き方の目安です。';
  if (total >= 4.0) {
    return { level: 'pass', label: '十分に書けています',
      note: '期末に自分の成果を説明しやすい形になっています。' + note };
  }
  if (total >= 3.0) {
    return { level: 'near', label: 'あと少し',
      note: '骨格はできています。弱い観点を1つ2つ足すと、さらに伝わる形になります。' + note };
  }
  return { level: 'weak', label: 'もう一段具体的にできます',
    note: '下の指摘を1つずつ足していくと、期末に「やった」と言いやすい目標になります。' + note };
}

if (typeof module !== 'undefined') {
  module.exports = { scoreDraft: scoreDraft, judge: judge };
}
