/**
 * コンピテンシー目標ナビ — 画面の動き
 */
(function () {
  'use strict';

  const el = function (id) { return document.getElementById(id); };

  const SAMPLE = {
    draft: '実施後レビューを忘れないように、期限をしっかり守ってやるようにします。',
  };

  function readMbo() {
    const roleIndex = el('role').value;
    return {
      competency: selectedCompetency(),
      // 役職者かどうかで求められる水準が変わるため、選んだ所属・職位も渡す
      role: roleIndex === '' ? '' : roleLabel(byRole[Number(roleIndex)]),
    };
  }

  // ---- コンピテンシー項目の選択 ----------------------------------------

  // data/assignments.local.js は手元にだけ置くファイル。無くてもアプリは動く。
  const assignments = (typeof ASSIGNMENTS !== 'undefined') ? ASSIGNMENTS : [];
  const master = (typeof COMPETENCIES !== 'undefined') ? COMPETENCIES : [];

  // 全社共通の項目は職位に関係なく全員に入る
  const companyWide = assignments.filter(function (g) { return g.group.indexOf('全社共通') === 0; });
  const byRole = assignments.filter(function (g) { return g.group.indexOf('全社共通') !== 0; });

  function roleLabel(g) {
    return [g.division, g.role].filter(function (x) { return x; }).join('　').replace(/\s+/g, ' ').trim();
  }

  function option(value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }

  function fillRoles() {
    if (byRole.length === 0) return;          // 割当データが無い環境では出さない
    const sel = el('role');
    sel.appendChild(option('', '選んでください'));
    byRole.forEach(function (g, i) {
      sel.appendChild(option(String(i), roleLabel(g)));
    });
    el('role-field').hidden = false;
  }

  function fillCompetencies() {
    const sel = el('competency');
    sel.innerHTML = '';
    sel.appendChild(option('', '選ばない（文章だけで診断する）'));

    const roleIndex = el('role').value;
    const mine = [];
    companyWide.forEach(function (g) { g.items.forEach(function (it) { mine.push(it); }); });
    if (roleIndex !== '') {
      byRole[Number(roleIndex)].items.forEach(function (it) { mine.push(it); });
    }

    // 付与型（会社が評価尺度を決める項目）も選べるようにする。年度や人で変わるうえ、
    // 尺度が決まっていても「では何をするか」は本人が考えるため、助けられる場面がある。
    if (mine.length > 0) {
      const group = document.createElement('optgroup');
      group.label = roleIndex === '' ? '全社共通' : 'あなたの項目';
      mine.forEach(function (it) {
        const mark = it.kind === '付与型' ? '　［付与型］' : '';
        group.appendChild(option(it.code, it.code + '　' + it.name + (it.note ? '（' + it.note + '）' : '') + mark));
      });
      sel.appendChild(group);
    }

    // 職位を選んだ人には、自分に関係する項目だけを出す。
    // 選んでいない人（割当データが無い環境を含む）には83項目すべてを出す。
    if (master.length > 0 && roleIndex === '') {
      const all = document.createElement('optgroup');
      all.label = '83項目から選ぶ';
      master.forEach(function (it) {
        all.appendChild(option(it.code, it.code + '　' + it.name));
      });
      sel.appendChild(all);
    }
  }

  /** 選ばれている項目（コード・名称・定義）を返す。選んでいなければ null */
  function selectedCompetency() {
    const code = el('competency').value;
    if (!code) return null;
    // 割当データ側を先に探す。評価者からのメッセージ（選定理由）が入っているため。
    let hit = null;
    assignments.forEach(function (g) {
      g.items.forEach(function (it) { if (it.code === code && !hit) hit = it; });
    });
    if (hit) return hit;
    return master.filter(function (it) { return it.code === code; })[0] || null;
  }

  function showDefinition() {
    const item = selectedCompetency();
    const box = el('definition');
    if (!item) {
      box.hidden = true;
      return;
    }
    box.textContent = item.name + '　—　' + (item.definition || '');
    box.hidden = false;

    // 選定理由は、なぜこの項目を選んだかという評価者からのメッセージ。
    // どう書けば評価されるかの手がかりになるので、書く前に読んでもらう。
    el('competency-message').textContent = item.message || '';
    el('competency-message-box').hidden = !item.message;

    // 付与型は評価尺度が会社から与えられている。目標の記入は不要だが、
    // その尺度を上げるための行動を考えたい人のために、尺度を見せたうえで診断は使えるようにする。
    const note = el('excluded-note');
    if (item.kind === '付与型') {
      note.textContent = 'この項目は付与型です。評価尺度は上長が決めるため、目標の記入は不要です。'
        + 'ここから先は、その尺度を上げるために何をするかを考えたい場合にお使いください。';
      note.hidden = false;
      renderGivenLevels(item.levels);
    } else {
      note.hidden = true;
      renderGivenLevels(null);
    }
  }

  /**
   * 観点と指摘を1つの表としてまとめて描く。
   * 観点ごとに「点数」と「その観点の指摘」が並ぶ。
   */
  function renderFindings(advice) {
    const list = el('findings');
    list.innerHTML = '';

    advice.axes.forEach(function (axis) {
      const li = document.createElement('li');
      li.className = 'finding'
        + (axis.score === null ? ' finding-check' : axis.score <= 2 ? ' finding-weak' : axis.met ? ' finding-strong' : '');

      const head = document.createElement('div');
      head.className = 'finding-head';

      const letter = document.createElement('span');
      letter.className = 'axis-letter';
      letter.textContent = axis.smart;

      const name = document.createElement('span');
      name.className = 'axis-name';
      name.textContent = axis.label;

      head.appendChild(letter);
      head.appendChild(name);

      if (axis.score === null) {
        const check = document.createElement('span');
        check.className = 'axis-check';
        check.textContent = '要確認';
        head.appendChild(check);
      } else {
        const meter = document.createElement('span');
        meter.className = 'axis-meter';
        meter.setAttribute('role', 'img');
        meter.setAttribute('aria-label', axis.score + '点／5点');
        for (let i = 1; i <= 5; i++) {
          const dot = document.createElement('span');
          dot.className = 'dot' + (i <= axis.score ? ' dot-on' : '');
          meter.appendChild(dot);
        }
        const value = document.createElement('span');
        value.className = 'axis-score';
        value.textContent = axis.score;
        const max = document.createElement('small');
        max.textContent = '/5';
        value.appendChild(max);

        head.appendChild(meter);
        head.appendChild(value);
      }

      const hint = document.createElement('p');
      hint.className = 'axis-hint';
      hint.textContent = axis.hint;

      li.appendChild(head);
      li.appendChild(hint);

      if (axis.comments.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'finding-comments';
        axis.comments.forEach(function (text) {
          const c = document.createElement('li');
          c.textContent = text;
          ul.appendChild(c);
        });
        li.appendChild(ul);
      } else if (axis.score !== null) {
        const ok = document.createElement('p');
        ok.className = 'finding-ok';
        ok.textContent = '✓ この観点は書けています。';
        li.appendChild(ok);
      }

      list.appendChild(li);
    });
  }

  /** 会社から与えられている評価尺度（付与型）を表示する */
  function renderGivenLevels(levels) {
    const box = el('given-levels');
    const list = el('given-levels-list');
    list.innerHTML = '';
    if (!levels || levels.length === 0) {
      box.hidden = true;
      return;
    }
    levels.forEach(function (text, i) {
      if (!text) return;
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'levels-num';
      num.textContent = String(i + 1);
      li.appendChild(num);
      li.appendChild(document.createTextNode(text));
      list.appendChild(li);
    });
    box.hidden = false;
  }

  /**
   * 改善案を出し、その文章を同じ採点エンジンにかけて点数を添える。
   *
   * Gemini をつないだら、ここに渡す text をAIが書いた文章に差し替えるだけでよい。
   * byAi を true にすると見出しと注記がAI向けの文面に変わる。
   * 点数の出し方（scoreDraft を通す）は本人が書いた文章とまったく同じ。
   */
  function renderImprovement(text, mbo, byAi, evidence) {
    el('improve-text').textContent = text;
    if (evidence) {
      el('improve-evidence').textContent = '達成基準：' + evidence;
      el('improve-evidence').hidden = false;
    } else {
      el('improve-evidence').hidden = true;
    }
    el('improve-total').textContent = scoreDraft(text, mbo).total.toFixed(1);
    el('improve-label').textContent = byAi ? 'AIが書いた改善案' : 'この型に沿って書いた例';
    el('improve-source').textContent = byAi
      ? 'AIが書いた文章を、あなたの文章と同じ基準で採点しました。'
      : 'AIは未接続です。いまは書き方の型と、その型に沿って書いた例を出しています。';
  }

  /** 書き直しの型。〈　〉は自分で埋める枠なので、枠として見えるようにする。 */
  function renderSkeleton(text) {
    const box = el('skeleton');
    box.textContent = '';
    text.split(/(〈[^〉]*〉)/).forEach(function (part) {
      if (part === '') return;
      if (part.charAt(0) === '〈') {
        const slot = document.createElement('span');
        slot.className = 'slot';
        slot.textContent = part;
        box.appendChild(slot);
      } else {
        box.appendChild(document.createTextNode(part));
      }
    });
  }

  function run() {
    const draft = el('draft').value.trim();
    if (draft === '') {
      el('result').hidden = true;
      el('empty').hidden = false;
      el('empty').textContent = '行動目標が空です。まず自分の言葉で書いてみてください。';
      el('empty').className = 'empty empty-warn';   // 見せ方だけ。文面は変えていない
      return;
    }

    const mbo = readMbo();
    const result = scoreDraft(draft, mbo);
    const verdict = judge(result.total);
    const advice = buildAdvice(result, mbo);

    el('score-total').textContent = result.total.toFixed(1);
    el('verdict-label').textContent = verdict.label;
    el('verdict-label').className = 'badge badge-' + verdict.level;
    el('verdict-note').textContent = verdict.note;

    renderFindings(advice);
    renderSkeleton(buildSkeleton(result, mbo));
    renderImprovement(buildExample(), mbo, false);

    el('empty').hidden = true;
    el('result').hidden = false;
  }

  function fillSample() {
    el('draft').value = SAMPLE.draft;
    run();
  }

  el('role').addEventListener('change', function () {
    fillCompetencies();
    showDefinition();
    if (!el('result').hidden) run();
  });

  el('competency').addEventListener('change', function () {
    showDefinition();
    if (!el('result').hidden) run();
  });

  fillRoles();
  fillCompetencies();

  /**
   * 改善案を写し取る。評価シートへ貼るための機能なので、
   * 使えない環境（古いブラウザ、クリップボードが塞がれている場合）でも
   * 文章を選択状態にして、手で写せるところまでは面倒を見る。
   */
  el('copy').addEventListener('click', function () {
    const text = el('improve-text').textContent;
    const done = function () {
      const button = el('copy');
      button.textContent = 'コピーしました';
      setTimeout(function () { button.textContent = 'コピー'; }, 1800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, selectText);
    } else {
      selectText();
    }
  });

  /** クリップボードが使えないときは、せめて選択状態にする */
  function selectText() {
    const range = document.createRange();
    range.selectNodeContents(el('improve-text'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    el('copy').textContent = '選択しました（Ctrl+C）';
    setTimeout(function () { el('copy').textContent = 'コピー'; }, 2400);
  }

  // ---- AI連携 ---------------------------------------------------------

  const KEY_STORE = 'competency-navi.gemini-key';

  /** 保存してあるAPIキーを読む。ブラウザが保存を許していない場合は空を返す */
  function storedKey() {
    try {
      return window.localStorage.getItem(KEY_STORE) || '';
    } catch (e) {
      return '';
    }
  }

  function showKeyState() {
    const has = storedKey() !== '';
    el('key-state').textContent = has
      ? 'このブラウザに保存されています。'
      : '未設定です。改善案はAIなしの記入例を出します。';
    el('improve').hidden = !has;
    if (has) el('api-key').value = '';
  }

  el('save-key').addEventListener('click', function () {
    const value = el('api-key').value.trim();
    if (value === '') return;
    try {
      window.localStorage.setItem(KEY_STORE, value);
    } catch (e) {
      el('key-state').textContent = 'このブラウザでは保存できませんでした。';
      return;
    }
    showKeyState();
  });

  el('clear-key').addEventListener('click', function () {
    try { window.localStorage.removeItem(KEY_STORE); } catch (e) { /* 保存できない環境 */ }
    el('api-key').value = '';
    showKeyState();
  });

  el('improve').addEventListener('click', function () {
    const draft = el('draft').value.trim();
    if (draft === '') return;

    const button = el('improve');
    button.disabled = true;
    button.textContent = 'AIが書いています…';
    el('improve-error').hidden = true;

    const mbo = readMbo();
    requestImprovement(storedKey(), {
      draft: draft,
      role: mbo.role,
      competency: mbo.competency,
    }).then(function (result) {
      renderImprovement(result.improved, mbo, true, result.evidence);
      renderLevels(result.indicator, result.levels);
      if (result.relevance) setRelevance(result.relevance);
      if (result.points.length > 0) addAiPoints(result.points);
    }).catch(function (error) {
      el('improve-error').textContent = 'AIに問い合わせできませんでした：' + error.message;
      el('improve-error').hidden = false;
    }).then(function () {
      button.disabled = false;
      button.textContent = 'AIに改善案を書いてもらう';
    });
  });

  /**
   * 評点の付け方（1〜4）を出す。上長がこれを見れば点数を機械的に決められる。
   * 御社のコンピテンシー評価が4点満点であることに合わせている。
   */
  function renderLevels(indicator, levels) {
    const box = el('levels');
    const list = el('levels-list');
    list.innerHTML = '';
    if (!levels || levels.length === 0) {
      // 件数で測りにくい項目では、AIが段階を作らずに理由だけ返すことがある
      if (indicator) {
        el('levels-indicator').textContent = '';
        const li = document.createElement('li');
        li.className = 'levels-note';
        li.textContent = indicator;
        list.appendChild(li);
        box.hidden = false;
      } else {
        box.hidden = true;
      }
      return;
    }
    el('levels-indicator').textContent = indicator ? '（' + indicator + '）' : '';
    levels.forEach(function (text, i) {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'levels-num';
      num.textContent = String(i + 1);
      li.appendChild(num);
      // 「1：」のような番号表記だけを外す。区切り記号が無ければ外さない
      // （「3件のアプリを…」の3まで消してしまうため）
      const body = String(text).replace(/^\s*[1-4]\s*[：:．.、]\s*/, '');
      li.appendChild(document.createTextNode(body));
      list.appendChild(li);
    });
    box.hidden = false;
  }

  /** R（項目との関連）の行を、AIの判定で置き換える */
  function setRelevance(text) {
    const rows = el('findings').getElementsByClassName('finding-check');
    if (rows.length === 0) return;
    const comments = rows[0].getElementsByClassName('finding-comments');
    if (comments.length === 0) return;
    comments[0].innerHTML = '';
    const li = document.createElement('li');
    li.textContent = text;
    comments[0].appendChild(li);
  }

  /** AIが挙げた指摘を、ルールの指摘の後ろに足す */
  function addAiPoints(points) {
    const first = el('findings').getElementsByClassName('finding')[0];
    if (!first) return;
    let box = first.getElementsByClassName('finding-comments')[0];
    if (!box) {
      box = document.createElement('ul');
      box.className = 'finding-comments';
      first.appendChild(box);
    }
    points.forEach(function (text) {
      const li = document.createElement('li');
      li.className = 'comment-ai';
      li.textContent = 'AI：' + text;
      box.appendChild(li);
    });
  }

  showKeyState();

  el('run').addEventListener('click', run);
  el('sample').addEventListener('click', fillSample);

  // URLの末尾に #demo を付けて開くと、サンプルを入れた状態で立ち上がる
  if (window.location.hash === '#demo') fillSample();

  el('clear').addEventListener('click', function () {
    ['draft'].forEach(function (id) {
      el(id).value = '';
    });
    el('role').value = '';
    fillCompetencies();
    showDefinition();
    el('result').hidden = true;
    el('empty').hidden = false;
    el('empty').textContent = '行動目標を入力して「診断する」を押してください。';
    el('empty').className = 'empty';
  });

  // 入力しながら結果を出したい人向け。空のときは何もしない。
  el('draft').addEventListener('input', function () {
    if (!el('result').hidden) run();
  });
})();
