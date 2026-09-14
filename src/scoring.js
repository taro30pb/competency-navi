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
 *   KPI連動     R  Relevant    会社の指標とつながっているか
 *   期限・頻度   T  Time-bound  いつまでかが決まっているか
 *   報告・振返り  ＋  SMARTを保つ仕組み（SMARTERのE・R）
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

/** 2つの文字列に共通して現れる、いちばん長い部分の長さ */
function longestCommonSubstring(a, b) {
  if (!a || !b) return 0;
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + best + 1; j <= a.length; j++) {
      const piece = a.slice(i, j);
      if (b.indexOf(piece) === -1) break;
      best = piece.length;
    }
  }
  return best;
}

/**
 * 現状値から目標値への伸び方を測る。
 * 「3件→8件」なら2.67倍。数値が読めないときは null を返す。
 */
function growthRatio(current, target) {
  const c = parseFloat(String(current).replace(/[^\d.]/g, ''));
  const t = parseFloat(String(target).replace(/[^\d.]/g, ''));
  if (!isFinite(c) || !isFinite(t) || c <= 0) return null;
  return t / c;
}

/** 1〜5点の範囲に収める */
function clamp(score) {
  return Math.max(1, Math.min(5, score));
}

/**
 * 6観点で採点する。
 * draft … 自己設定の行動目標（初稿）
 * mbo   … 対応するMBO { name, current, target }
 */
function scoreDraft(draft, mbo) {
  mbo = mbo || {};
  const text = (draft || '').trim();
  const mboName = (mbo.name || '').trim();
  const vague = findWords(text, VAGUE_WORDS);
  // 「実施後レビュー期限遵守率」のように指標名そのものに含まれる語は、
  // 本人の行動ではなく指標の名前なので、手段として数えない。
  const actions = findWords(text, ACTION_VERBS).filter(function (w) { return mboName.indexOf(w) === -1; });
  const systems = findWords(text, SYSTEM_WORDS);
  const deadlines = findWords(text, DEADLINE_WORDS);
  const frequencies = findWords(text, FREQUENCY_WORDS);
  const reports = findWords(text, REPORT_WORDS);
  const reviews = findWords(text, REVIEW_WORDS);
  const outcomes = findWords(text, OUTCOME_WORDS);
  const dependents = findWords(text, DEPENDENT_WORDS);
  const quantities = findQuantities(text);
  const ratio = growthRatio(mbo.current, mbo.target);

  const half = toHalfWidth(text);
  const target = String(mbo.target || '').replace(/[^\d.]/g, '');
  const hasTarget = target !== '' && half.indexOf(target) !== -1;
  const overlap = longestCommonSubstring(mboName, text);

  // 観点ごとに3つの条件を見て、満たした数＋1を点数とする（1〜4点）。
  // 社のコンピテンシー評価が4点満点なので、それに合わせている。
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
  ]);

  // ② 定量性（M 測れる）
  axis('quantity', '定量性', 'M', '件数・人数・％など、数えられる形で書かれているか', [
    quantities.length >= 1,
    quantities.length >= 2,
    quantities.length >= 3,
  ]);

  // ③ 手段（A 達成できる）
  axis('method', '手段', 'A', '結果ではなく、自分が動かせる行動で書かれているか', [
    actions.length >= 1,
    actions.length >= 2 || systems.length >= 1,
    // 他人任せでなく、成果の言いっぱなしでもなく、無茶な跳ね上がりでもない
    dependents.length === 0
      && !(outcomes.length > 0 && actions.length === 0)
      && !(ratio !== null && ratio >= 3 && quantities.length === 0),
  ]);

  // ④ KPI連動（R 指標とつながる）
  axis('linkage', 'KPI連動', 'R', '対応する指標と、現状値→目標値の逆算が入っているか', [
    overlap >= 2,
    overlap >= 4,
    hasTarget,
  ]);

  // ⑤ 期限・頻度（T 期限がある）
  axis('timing', '期限・頻度', 'T', 'いつまでに・どのくらいの頻度で、が決まっているか', [
    frequencies.length + deadlines.length >= 1,
    frequencies.length >= 1 && deadlines.length >= 1,
    frequencies.length + deadlines.length >= 3,
  ]);

  // ⑥ 報告・振返り（＋ 見直す）
  axis('followup', '報告・振返り', '＋', '誰に報告し、ずれたときにどう立て直すかがあるか', [
    reports.length >= 1,
    reviews.length >= 1,
    reports.length >= 1 && (frequencies.length >= 1 || deadlines.length >= 1),
  ]);

  // 最終点は6観点の平均。小数第1位まで出す（例 3.2／4）
  let sum = 0;
  axes.forEach(function (a) { sum += a.score; });
  const total = Math.round((sum / axes.length) * 10) / 10;

  return {
    total: total,
    max: 4,
    axes: axes,
    detected: {
      vague: vague, actions: actions, systems: systems, deadlines: deadlines,
      frequencies: frequencies, reports: reports, reviews: reviews,
      outcomes: outcomes, quantities: quantities, dependents: dependents, growthRatio: ratio,
    },
  };
}

/** 合計点から判定を返す */
function judge(total) {
  if (total >= 3.5) return { level: 'pass', label: '合格水準', note: 'このまま上長に提出できる水準です。' };
  if (total >= 2.5) return { level: 'near', label: 'あと一歩', note: '骨格はできています。弱い観点を1〜2つ直せば届きます。' };
  return { level: 'weak', label: '書き直しが必要', note: 'このままでは上長が達成・未達を判定できません。' };
}

if (typeof module !== 'undefined') {
  module.exports = { scoreDraft: scoreDraft, judge: judge };
}
