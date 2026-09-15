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

/**
 * NGワード。社内資料「①社員向け説明資料2026.1改定」のNGワード一覧に合わせている。
 * 目標の達成度合いを評価者が判断できなくなる言葉。
 */

/** 心構え・意欲を表すだけで、行動になっていない言葉 */
const VAGUE_WORDS = [
  '努力', '努め', '徹底する', '目指す', '頑張', 'がんば', '気をつけ', '気を付け',
  '注意する', '注力', '意識し', '留意', '目標とする', '心掛け', '心がけ', '一生懸命',
  // 行動の範囲が不明確な言葉
  '極力', '可能な限り', '可能であれば', '出来る限り', 'できる限り', '出来るだけ', 'できるだけ',
  'なるべく', '必要に応じて', '許す限り', '最大限', 'ある程度',
  // 人により受け取り方が異なる言葉
  '積極的に', '定期的に', '強調して', '確実に', '臨機応変', '迅速に', '早急に', '常に',
  '随時', '適宜', 'いつも', 'なんでも', 'こまめに', 'しっかり', '丁寧に', 'スムーズに',
  '適切に', '前向きに', '忘れないように', '喜んでもら', '満足してもら', '信頼される',
  // 意欲や希望にとどまる言い方
  'するようにしたい', 'したいと思', 'していきたい', 'ようにします', 'ようにしたい',
];

/**
 * 達成したかどうかを外から見て判断しにくい動詞。
 * 「本を読んでレポートを提出する」のように、可視化できる表現が伴えば問題ない。
 * 行動としては数えず、指摘の材料にする。
 */
const WEAK_VERBS = [
  '思う', '考える', '見る', '調べる', '読む', '検討', '考慮', '図る', '勘案',
  '向上する', '推進', '効率化', '明確化', '安定化', '共有化', '強化',
];

/**
 * その事象が起きないと達成できない書き方。
 * 発生頻度が低いと評価できないため、社内資料ではNGとされている。
 */
const CONDITIONAL_WORDS = ['場合は', '場合には', 'ときは', '次第で', 'になったら', 'が発生したら', 'が出たら'];

/** 業務時間外を指す言葉。評価者が達成度合いを判断できない */
const OFF_HOURS_WORDS = ['夜寝る前', '休日に', '出勤途中', '残業してでも', '帰宅後'];

/** 範囲をあいまいにする言葉 */
const OPEN_ENDED_WORDS = ['など', '等', 'etc'];

/** 成果（結果）を表す言葉。行動に分解されていないと減点対象になる */
const OUTCOME_WORDS = ['率', '売上', '受注高', '粗利', '利益', '実績', 'シェア'];

/** 実際の動作を表す言葉。多いほど「手段」が具体的 */
const ACTION_VERBS = [
  '提案', '共有', '作成', '一覧化', '記録', '確認', '提出', '実施', '案内', '訪問',
  '連絡', '点検', '登録', '設定', '依頼', '同行', '説明', '集計', '分析', '整理',
  '配布', 'レビュー', '面談', '架電', '送付', '入力', '更新', '見積', '発注', '巡回',
  '構築', '導入', '整備', '展開', '運用', '開催', '周知', '改修', '標準化', '発信',
  'リリース', '検証', '測定', '教育', '指導', '同席', '手配', '交渉', '設計', '試作',
  '見直', '洗い出', '立案', '企画', '決定', '選定', '比較', '試算', '棚卸',
];

/** 自分ではなく他人が動くことになっている言葉。達成可能性（A）を下げる */
const DEPENDENT_WORDS = [
  'してもらう', 'してもらえ', 'していただ', 'やらせる', 'やらせてもら',
  '支援する', '助言する', '協力する', '調整する',
  '会社が', '上司が', '上長が', '他部署が', '誰かが',
];

/**
 * 上司が目で確認できる事実を表す言葉。
 * あしたのチームの判定ロジックでいう「可視化（測定可能性）」にあたる。
 * 提出物・レビュー・記録が残る行動は、期末に「やった」と示せる。
 */
const EVIDENCE_WORDS = [
  '提出', 'レビュー', '記録', 'シート', '一覧', '日報', '週報', '月報', '議事録',
  'ログ', '資料', '報告書', 'チェックリスト', 'データ', '台帳', 'フォーム', '実績表',
];

/** 仕組み・型として残る言葉 */
const SYSTEM_WORDS = ['一覧', 'チェックリスト', 'テンプレート', 'フォーム', 'ルール', '手順', '仕組み', '台帳', 'シート'];

/** 期限を表す言葉 */
const DEADLINE_WORDS = ['までに', '以内', '当日', '翌日', '翌週', '翌月', '期末', '月末', '週末', '上半期', '下半期', '今期', '年度内'];   // 「半期」は「四半期」に含まれてしまうので入れない

/** 頻度を表す言葉 */
// 「四半期」は入れない。「四半期末」という期限の言い方に含まれてしまうため
const FREQUENCY_WORDS = ['毎日', '毎週', '毎月', '週次', '月次', '日次', '四半期ごと', '四半期に', '毎回', '隔週'];

/** 報告する「行為」を表す言葉 */
const REPORT_WORDS = ['報告', '共有', '提出', '連絡', 'レビュー', '承認'];

/** 報告する「相手」や「場」を表す言葉。REPORT_WORDS とは重ねない */
const REPORT_TARGETS = [
  '上長', '上司', '所長', '店長', '課長', '部長', '本部長',
  '朝礼', 'ミーティング', 'ＭＴ', 'MT', '会議', '定例', '面談', '1on1', '1対1', '打合せ', '打ち合わせ',
];

/** 振り返り・立て直しを表す言葉 */
const REVIEW_WORDS = ['振り返', 'ふり返', '見直', 'レビュー', '改善', '修正', 'リカバリ', '調整', '検証', '再発防止', '対策', '更新', '棚卸'];

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
      if (/^(する|す[るだ]?|し[てたまなよ]?|させ|され|でき|を行|を実施|に行|を受|に出)/.test(after)) return true;
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
  return toHalfWidth(text).match(/\d+(?:,\d{3})*(?:\.\d+)?/g) || [];
}

/** 単位の付いた数値だけを拾う（「20名」は数えるが、裸の数字は数えない） */
function findQuantities(text) {
  return toHalfWidth(text).match(/\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|％|件|名|人|回|枚|社|店|校|時間|円|万円|商品|製品|品番|個|本|台|箇所|ヶ所|カ所|棟|基|面|冊|案件|物件|項目|工事|現場|店舗|拠点|部署|チーム|種類|パターン|工法)/g) || [];
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
  const evidence = findWords(text, EVIDENCE_WORDS);
  const deadlines = findWords(text, DEADLINE_WORDS);
  // 「Q3」「第3四半期」「上期」のような区切りも期限として数える
  const quarterPattern = toHalfWidth(text).match(/Q[1-4]|第[1-4]四半期|上期|下期/g) || [];
  quarterPattern.forEach(function (v) { if (deadlines.indexOf(v) === -1) deadlines.push(v); });
  const frequencies = findWords(text, FREQUENCY_WORDS);
  // 「月2回」「週1回」「年4回」のような書き方も頻度として数える
  const frequencyPattern = toHalfWidth(text).match(/(毎|各)?[日週月年]\s*(に)?\s*\d+\s*回|\d+\s*回\s*\/\s*[日週月年]/g) || [];
  frequencyPattern.forEach(function (v) { if (frequencies.indexOf(v) === -1) frequencies.push(v); });
  const reports = findWords(text, REPORT_WORDS);
  const reportTargets = findWords(text, REPORT_TARGETS);
  const reviews = findWords(text, REVIEW_WORDS);
  const outcomes = findWords(text, OUTCOME_WORDS);
  const dependents = findWords(text, DEPENDENT_WORDS);
  const quantities = findQuantities(text);
  const weakVerbs = findWords(text, WEAK_VERBS);
  const conditionals = findWords(text, CONDITIONAL_WORDS);
  const offHours = findWords(text, OFF_HOURS_WORDS);
  const openEnded = findWords(text, OPEN_ENDED_WORDS);

  // 観点ごとに4つの条件を見て、満たした数＋1を点数とする（1〜5点）。
  const axes = [];
  function axis(key, label, smart, hint, conditions, penalty) {
    let met = 0;
    conditions.forEach(function (c) { if (c) met += 1; });
    const score = Math.max(1, Math.min(5, 1 + met - (penalty || 0)));
    axes.push({ key: key, label: label, smart: smart, score: score, hint: hint });
  }

  // ① 具体性（S 具体的）
  axis('specificity', '具体性', 'S', '誰の・何を、どれだけの分量で書けているか', [
    /担当|自分|私|チーム|部署|部門|課|店舗|全店|現場|顧客|お客様|お客さま|施主|案件|物件|会員|生徒|利用者|社内|全社|社員|スタッフ|メンバー|後輩|部下|協力会社|職人|商品|製品|工法|施工|工事|見積|図面/.test(text),
    text.replace(/\s/g, '').length >= 60,   // 社内資料の目安は100文字程度。20〜30文字では足りない
    vague.length === 0,
    quantities.length >= 1,                  // 対象の規模が数で示されている
  ],
    // 「〜の場合は」は、その事象が起きないと達成できない書き方なので下げる。
    // 業務時間外を指す書き方も、評価者が達成度合いを判断できない。
    (conditionals.length > 0 || offHours.length > 0) ? 1 : 0);

  // ② 定量性（M 測れる）
  axis('quantity', '定量性', 'M', '数えられる形で書かれ、上司が確認できる事実になっているか', [
    quantities.length >= 1,
    quantities.length >= 2,
    /\d+[^。、]{0,8}(以上|以内|未満|超)/.test(toHalfWidth(text)) || /達成率/.test(text),   // 数字で達成ラインが引かれている
    evidence.length >= 1,   // 提出物・レビュー・記録など、上司が確認できる形になっている
  ]);

  // ③ 手段（A 達成できる）
  axis('method', '手段', 'A', '結果ではなく、自分が動かせる行動で書かれているか', [
    actions.length >= 1,
    actions.length >= 2,
    actions.length >= 3,
    systems.length >= 1,   // 手順や仕組みとして残る形になっている
  ],
    // 他人任せ、または成果だけで行動が無い場合は引く
    (dependents.length > 0 || (outcomes.length > 0 && actions.length === 0)) ? 1 : 0);

  // R（項目に効くか）は点数にしない。言葉の一致では測れないため、確認として並べる。
  // 画面では点数の代わりに「要確認」と出す。判定はAIにつないだ後に行う。
  axes.push({
    key: 'relevance', label: '項目との関連', smart: 'R', score: null,
    hint: '選んだコンピテンシー項目に効く行動になっているか',
  });

  // ④ 期限・頻度（T 期限がある）
  // 当社は評価が四半期ごとで、期限は四半期末が既定。わざわざ書かなくても決まっている。
  // そのため「期限を書いたか」ではなく「その3か月で何回やるか（頻度）」を重く見る。
  axis('timing', '期限・頻度', 'T', 'どのくらいの頻度で、いつまでに、が決まっているか', [
    frequencies.length + deadlines.length >= 1,
    frequencies.length >= 1,                         // 繰り返す行動として決まっている
    /([月火水木金土日]曜|月末|週末|期末|\d+日までに|毎月\d+日|\d+日(まで|時点)|Q[1-4]|第[1-4]四半期)/.test(toHalfWidth(text)),  // 曜日・日付・四半期まで決まっている
    frequencies.length + deadlines.length >= 3,
  ]);

  // ⑤ 報告・振返り（＋ 見直す）
  axis('followup', '報告・振返り', '＋', '誰に報告し、ずれたときにどう立て直すかがあるか', [
    reports.length >= 1,
    reviews.length >= 1,
    reports.length >= 1 && (frequencies.length >= 1 || deadlines.length >= 1),
    reportTargets.length >= 1,   // 誰に・どの場で報告するかが決まっている
  ]);

  /**
   * 最低ライン。人事評価の分野で「これだけは満たせ」とされている3点で、
   * あしたのチームが判定に用いている「いつ・頻度・可視化」と、NGワードの排除にあたる。
   *
   *   ① 社内資料でNGとされている言葉が無い（心構え・範囲不明確・条件付き・業務時間外）
   *   ② 頻度か期限のどちらかが決まっている
   *   ③ 上司が確認できる形になっている（提出物・記録・レビュー・報告先）、
   *      または行動そのものが数えられる（数量が2つ以上）
   *
   * ここを満たした目標は、数値まで揃っていなくても提出できる水準とみなし、
   * 総合点が3.5を下回らないようにする。満たした人に「書き直し」と言わないため。
   */
  const meetsBaseline = vague.length === 0
    && conditionals.length === 0 && offHours.length === 0
    && (frequencies.length + deadlines.length) >= 1
    && (evidence.length >= 1 || reportTargets.length >= 1 || reports.length >= 1
      // 行動そのものが数えられる形（「1日100件の荷電」など）なら、それで測れる。
      // 社内資料の良い例には、上長への報告が入っていないものもある。
      || quantities.length >= 2);

  // 最終点は、点数のある5観点の平均。小数第1位まで出す（例 3.2／5）
  const scored = axes.filter(function (a) { return a.score !== null; });
  let sum = 0;
  scored.forEach(function (a) { sum += a.score; });
  let total = Math.round((sum / scored.length) * 10) / 10;
  if (meetsBaseline && total < 3.5) total = 3.5;

  return {
    text: text,
    total: total,
    meetsBaseline: meetsBaseline,
    max: 5,
    axes: axes,
    detected: {
      vague: vague, actions: actions, systems: systems, deadlines: deadlines,
      frequencies: frequencies, reports: reports, reviews: reviews,
      outcomes: outcomes, quantities: quantities, dependents: dependents,
      weakVerbs: weakVerbs, conditionals: conditionals, offHours: offHours, openEnded: openEnded,
      length: text.replace(/\s/g, '').length,
      reportTargets: reportTargets, evidence: evidence,
    },
  };
}

/** 合計点から判定を返す */
function judge(total) {
  // 点数は人事評価ではなく、書き方の目安。否定的な言い方は使わない。
  const note = '　※この点数は評価ではなく、書き方の目安です。';
  if (total >= 4.0) {
    return { level: 'pass', label: '十分に書けています',
      note: '四半期末に自分の成果を説明しやすい形になっています。' + note };
  }
  if (total >= 3.5) {
    return { level: 'near', label: '提出できる水準',
      note: '最低限そろえるべきものは入っています。弱い観点を1つ2つ足すと、さらに伝わる形になります。' + note };
  }
  return { level: 'weak', label: 'もう一段具体的にできます',
    note: '下の指摘を1つずつ足していくと、四半期末に「やった」と言いやすい目標になります。' + note };
}

if (typeof module !== 'undefined') {
  module.exports = { scoreDraft: scoreDraft, judge: judge };
}
