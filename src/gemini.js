/**
 * コンピテンシー目標ナビ — Gemini への問い合わせ
 *
 * APIキーは使う人のブラウザにだけ保存する。コードにも履歴にも残さない。
 * 問い合わせは1回だけで、指摘・改善案・達成基準・項目との関連をまとめて受け取る。
 *
 * 指示文の考え方は docs/gemini-prompt.md を参照。
 */

/**
 * 使うモデル。速さと料金の兼ね合いで Flash 系を既定にする。
 *
 * Google側でモデルが入れ替わると「このモデルは使えません。models/○○ を使ってください」
 * というエラーが返る。そのときは案内されたモデル名で1度だけ自動的にやり直すので、
 * ここを書き換えなくても動き続ける。
 */
const GEMINI_MODEL = 'gemini-3.6-flash';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** AIに渡す指示文を組み立てる */
function buildPrompt(input) {
  const competency = input.competency
    ? input.competency.code + ' ' + input.competency.name + '（' + input.competency.definition + '）'
    : '（本人が選んでいない）';

  return [
    'あなたは組織開発と人事評価の専門家で、コンピテンシー評価（行動特性評価）のスペシャリストです。',
    'グリーンライフ産業株式会社の社員が書いた行動目標の原案を、上司が期末に客観的に確認でき、',
    'かつ本人の成長につながる行動目標に書き直してください。',
    '',
    '# 入力',
    'コンピテンシー項目：' + competency,
    '所属・職位：' + (input.role || '（選んでいない）'),
    '本人が書いた原案：' + input.draft,
    '',
    '# 手順',
    '1. 原案に「極力」「可能な限り」「努力する」「頑張る」「意識する」「しっかり」「心がける」などの',
    '   曖昧な表現があれば、すべて削除し、回数や期限を伴う具体的な行動に置き換える。',
    '2. 原案から「行動内容」「頻度・期限」「可視化手段（誰がどうやって確認するか）」を抜き出す。',
    '   欠けている要素は、その職種の一般的な業務の流れから補う。',
    '3. 心構えではなく、第三者が観察できる事実として書き直す。',
    '',
    '# 制約',
    '- 成果（売上を上げる）と行動（商談前に資料を準備する）を混同しない。行動だけを書く。',
    '- 職位に合った水準にする。役職者（店長・課長・部長など）の場合は、部下の育成や意思決定の要素を必ず入れる。',
    '- 箇条書きにせず、ひと続きの行動宣言文にする。長くても200字程度に収める。',
    '- 他人が動くことを前提にした書き方（「〜してもらう」「会社が」）にしない。',
    '- 選んだコンピテンシー項目の定義から外れないこと。',
    '- 原案に書かれていない事実（具体的な数値や固有名詞）を作る場合は、その職種でありがちな範囲にとどめる。',
    '',
    '# 出力',
    '次のJSONだけを返してください。前置きや説明文は不要です。',
    '{',
    '  "points": ["原案のどこが曖昧で、なぜ上司が判定しづらいのかを2〜4点。各60字程度"],',
    '  "improved": "すべての条件を満たした、ひと続きの行動宣言文",',
    '  "evidence": "期末に達成したと判断するための証拠（提出物・レビュー履歴など）を1文で",',
    '  "relevance": "選んだコンピテンシー項目に効く行動になっているか。ずれていればその理由を1〜2文で"',
    '}',
  ].join('\n');
}

/**
 * Gemini に問い合わせる。
 * 成功すると { points, improved, evidence, relevance } を返す。
 */
function askGemini(key, input, model) {
  const body = {
    contents: [{ parts: [{ text: buildPrompt(input) }] }],
    generationConfig: {
      temperature: 0.4,          // 言い回しが毎回大きく変わらないように低めにする
      responseMimeType: 'application/json',
    },
  };

  const using = model || GEMINI_MODEL;

  return fetch(GEMINI_ENDPOINT + using + ':generateContent?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok) {
        const message = (data && data.error && data.error.message) || ('HTTP ' + res.status);
        const error = new Error(message);
        // 「models/○○ を使ってください」と案内された場合は、そのモデル名を覚えておく
        const suggested = message.match(/use\s+models\/([A-Za-z0-9.\-]+)/);
        if (suggested) error.suggestedModel = suggested[1];
        throw error;
      }
      return data;
    });
  }).then(function (data) {
    const candidate = data.candidates && data.candidates[0];
    const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
    const text = part && part.text;
    if (!text) throw new Error('AIから空の返事が返りました。もう一度お試しください。');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // まれに前後に文字が付くことがあるので、JSONらしい部分だけ取り出して読み直す
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AIの返事を読み取れませんでした。');
      parsed = JSON.parse(match[0]);
    }

    if (!parsed.improved) throw new Error('AIから改善案が返りませんでした。');
    return {
      model: using,
      points: Array.isArray(parsed.points) ? parsed.points : [],
      improved: String(parsed.improved).trim(),
      evidence: parsed.evidence ? String(parsed.evidence).trim() : '',
      relevance: parsed.relevance ? String(parsed.relevance).trim() : '',
    };
  });
}

/**
 * 問い合わせる。モデルが入れ替わっていた場合は、案内されたモデルで1度だけやり直す。
 */
function requestImprovement(key, input) {
  return askGemini(key, input).catch(function (error) {
    if (!error.suggestedModel) throw error;
    return askGemini(key, input, error.suggestedModel);
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    askGemini: askGemini,
    requestImprovement: requestImprovement,
    buildPrompt: buildPrompt,
    GEMINI_MODEL: GEMINI_MODEL,
  };
}
