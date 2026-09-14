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
    '# 改善案に必ず含めるもの（この社の採点基準）',
    'アプリ側は次の観点で機械的に採点します。改善案はこれを満たすように書いてください。',
    '- 対象：誰の何を対象にするか（担当◯件、社内、部署名など）',
    '- 数量：単位の付いた数字を2つ以上（「20件」「月4件」「5名」「80%」など）。',
    '  さらに「月4件以上」「30分以内」のように、どこまでやれば達成かの線を数字で引く。',
    '- 行動：自分が動かせる動作を3つ以上（「一覧化する」「提案する」「点検する」など動詞の形で）。',
    '  あわせて、手順・チェックリスト・台帳・シートなど、残る形にも触れる。',
    '- 期限と頻度：頻度（毎週・毎月）と期限（〜までに）の両方を入れ、',
    '  「毎週金曜」「月末」のように曜日や日付まで決める。',
    '- 報告と立て直し：誰に（上長・所長・店長など）、どの場で（朝礼・週次ミーティング）報告し、',
    '  遅れたときにどう立て直すかまで書く。',
    '- 可視化：上司が確認できる事実（シートに記録、日報で提出、レビューを受ける）を入れる。',
    '  「提案前に上司レビューを受ける」「月次1on1で次の行動を更新する」のように、',
    '  上司との確認の場を行動の中に組み込むと、期末に事実で確認できる。',
    '',
    '# 禁止',
    '- 「〇月〇日」「◯件」「XX名」のような伏せ字を絶対に使わない。',
    '  日付や件数が原案に無い場合は、その職種でありがちな具体的な数字を自分で決めて書く。',
    '- 数字を1つも入れずに書き終えない。',
    '- 「毎週」「毎月」などの頻度を省かない。',
    '',
    '# 手本（この水準を目指す）',
    '担当している20件の見積案件について、毎週金曜に進捗を一覧化して確認し、遅れている案件は',
    '当日中に対応方針を決める。月4件以上の改善提案を作成し、週次ミーティングで所長に報告して',
    '翌週の段取りを見直す。',
    '',
    '# 書き終える前の自己点検',
    '次の3つを満たしているか確認し、欠けていれば書き直してから出力すること。',
    '1. 単位の付いた数字が2つ以上ある（伏せ字は数に入らない）',
    '2. 「毎週」「毎月」などの頻度と、「〜までに」の期限の両方がある',
    '3. 曜日または具体的な日付が入っている',
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
      temperature: 0.2,          // 言い回しと守るべき条件がぶれないように低くする
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
