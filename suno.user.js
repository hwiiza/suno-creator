// ==UserScript==
// @name         Suno Creator (minimal)
// @namespace    hwiiza.suno
// @version      0.1.4
// @description  SunoのCreate画面に右ドロワーを出し、JSON(1曲/配列)を読み込んで生成・連続生成する検証用ミニ版
// @match        https://suno.com/*
// @match        https://www.suno.com/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/hwiiza/suno-userscript
// @supportURL   https://github.com/hwiiza/suno-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/hwiiza/suno-userscript/main/suno.user.js
// @updateURL    https://raw.githubusercontent.com/hwiiza/suno-userscript/main/suno.user.js
// ==/UserScript==

(function () {
  'use strict';

  const MAX_BATCH = 5; // Sunoの同時生成上限(検証版は安全に最大5曲で打ち切り)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- DOMユーティリティ ----
  const isVisible = (el) => !!(el && el.getClientRects().length && el.offsetParent !== null);
  function firstVisible(selector) {
    for (const el of document.querySelectorAll(selector)) if (isVisible(el)) return el;
    return null;
  }
  function byText(tag, text) {
    for (const el of document.querySelectorAll(tag)) {
      if ((el.textContent || '').trim() === text && isVisible(el)) return el;
    }
    return null;
  }
  // React制御の input/textarea に値を入れる(nativeセッター + inputイベント)
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- Suno UI 操作 ----
  function ensureAdvanced() { const adv = byText('button', 'Advanced'); if (adv) adv.click(); }
  function ensureMoreOptions() {
    if (firstVisible('[role="slider"][aria-label="Weirdness"]')) return;
    const mo = byText('div', 'More Options') || byText('button', 'More Options');
    if (mo) mo.click();
  }
  function getLyrics() { return firstVisible('textarea[data-testid="lyrics-textarea"]'); }
  function getStyle() { for (const t of document.querySelectorAll('textarea:not([data-testid="lyrics-textarea"])')) if (isVisible(t)) return t; return null; }
  function getTitle() { return firstVisible('input[placeholder="Song Title (Optional)"]'); }
  function getCreate() { return firstVisible('button[aria-label="Create song"]') || byText('button', 'Create'); }
  function setVocal(gender) {
    const label = gender === 'female' ? 'Female' : gender === 'male' ? 'Male' : null;
    if (!label) return;
    const btn = byText('button', label);
    if (btn && btn.getAttribute('data-selected') !== 'true') btn.click();
  }

  async function fillSong(song, log) {
    ensureAdvanced();
    await sleep(800);
    if (song.instrumental) {
      const inst = firstVisible('button[aria-label*="instrumental only" i]') || byText('button', 'Instrumental');
      if (inst && inst.getAttribute('data-selected') !== 'true') inst.click();
      await sleep(300);
    } else if (song.lyrics) {
      const lyr = getLyrics();
      if (lyr) setNativeValue(lyr, song.lyrics); else log('⚠ 歌詞欄が見つからない');
    }
    if (song.style) { const st = getStyle(); if (st) setNativeValue(st, song.style); else log('⚠ スタイル欄が見つからない'); }
    if (song.title) { const ti = getTitle(); if (ti) setNativeValue(ti, song.title); }
    if (song.exclude || (song.vocal && song.vocal !== 'auto')) {
      ensureMoreOptions();
      await sleep(500);
      if (song.exclude) { const ex = firstVisible('input[placeholder="Exclude styles"]'); if (ex) setNativeValue(ex, song.exclude); }
      if (song.vocal && song.vocal !== 'auto') setVocal(song.vocal);
    }
    // ※ Weirdness/Style Influenceスライダーはページ内JSでは操作不可（既定値のまま）
  }

  function validate(s) {
    if (!s || typeof s !== 'object') return 'オブジェクトではありません';
    if (!(s.style || s.lyrics || s.instrumental)) return 'style/lyrics/instrumental のいずれか必須';
    if (s.vocal && !['male', 'female', 'auto'].includes(s.vocal)) return 'vocal は male|female|auto';
    return null;
  }

  async function generateOne(song, log) {
    await fillSong(song, log);
    await sleep(400);
    const btn = getCreate();
    if (!btn) { log('✖ 生成ボタンが見つからない'); return false; }
    btn.click();
    log('  ✅ 投入: ' + (song.title || song.style || '曲'));
    return true;
  }

  // ---- UI (SPA対策: 無ければ作る／消えたら再注入) ----
  const PANEL_ID = 'suno-creator-panel';
  const FAB_ID = 'suno-creator-fab';

  function init() {
    if (!document.body || document.getElementById(PANEL_ID)) return;
    const oldFab = document.getElementById(FAB_ID); if (oldFab) oldFab.remove();

    let songs = [];     // 読み込んだ曲
    let statuses = [];  // '' | submitting | submitted | failed
    let sel = -1;       // 選択中index
    let busy = false;
    const BADGE = { submitting: '投入中', submitted: '投入済', failed: '失敗' };

    // 開閉トグル(右端タブ)
    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.textContent = '♪ Suno Creator';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
    <style>
      #${FAB_ID}{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483646;
        background:#252529;color:#f7f4ef;border:1px solid #2e2e34;border-right:none;border-radius:10px 0 0 10px;
        padding:12px 7px;cursor:pointer;writing-mode:vertical-rl;font-size:12px;letter-spacing:.1em;
        font-family:"Neue Montreal",system-ui,"Segoe UI",sans-serif;box-shadow:-4px 0 16px rgba(0,0,0,.4);}
      #${FAB_ID}:hover{background:#303035;}
      #${PANEL_ID}{position:fixed;top:0;right:0;height:100vh;width:380px;z-index:2147483647;
        background:#101012;color:#f7f4ef;border-left:1px solid #2e2e34;display:flex;flex-direction:column;
        transform:translateX(100%);transition:transform .22s ease;box-shadow:-12px 0 40px rgba(0,0,0,.55);
        font-family:"Neue Montreal",system-ui,"Segoe UI","Yu Gothic UI",sans-serif;font-size:13px;}
      #${PANEL_ID}.open{transform:translateX(0);}
      #${PANEL_ID} *{box-sizing:border-box;}
      #${PANEL_ID} .hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #2e2e34;flex-shrink:0;}
      #${PANEL_ID} .hd b{font-size:14px;letter-spacing:.02em;}
      #${PANEL_ID} .bd{flex:1;display:flex;flex-direction:column;min-height:0;padding:12px 14px;gap:10px;}
      #${PANEL_ID} .row{display:flex;gap:8px;align-items:center;}
      #${PANEL_ID} button{background:#252529;color:#f7f4ef;border:1px solid #2e2e34;border-radius:999px;
        padding:6px 14px;cursor:pointer;font-size:12px;font-family:inherit;}
      #${PANEL_ID} button:hover{background:#303035;}
      #${PANEL_ID} button.primary{background:#f7f4ef;border-color:#f7f4ef;color:#101012;font-weight:600;}
      #${PANEL_ID} button.primary:hover{background:#fff;}
      #${PANEL_ID} button:disabled{opacity:.45;cursor:not-allowed;}
      #${PANEL_ID} .x{background:transparent;border:none;color:#8a8a90;font-size:18px;padding:0 4px;line-height:1;}
      #${PANEL_ID} .x:hover{color:#f7f4ef;background:transparent;}
      #${PANEL_ID} .cnt{color:#8a8a90;font-size:11px;}
      #${PANEL_ID} .list{flex-shrink:0;max-height:34vh;overflow:auto;border:1px solid #2e2e34;border-radius:9px;}
      #${PANEL_ID} .empty{color:#8a8a90;font-size:11px;padding:16px;text-align:center;}
      #${PANEL_ID} .item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2e2e34;cursor:pointer;}
      #${PANEL_ID} .item:last-child{border-bottom:none;}
      #${PANEL_ID} .item:hover{background:#1a1a1d;}
      #${PANEL_ID} .item.sel{background:#252529;}
      #${PANEL_ID} .item .ix{color:#8a8a90;width:16px;text-align:right;font-size:11px;}
      #${PANEL_ID} .item .mt{flex:1;min-width:0;}
      #${PANEL_ID} .item .t{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #${PANEL_ID} .item .s{font-size:10px;color:#8a8a90;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #${PANEL_ID} .bdg{font-size:10px;padding:1px 8px;border-radius:999px;border:1px solid #2e2e34;color:#8a8a90;white-space:nowrap;}
      #${PANEL_ID} .bdg.invalid,#${PANEL_ID} .bdg.failed{color:#ff8a8a;border-color:#5a2a2a;}
      #${PANEL_ID} .bdg.submitting{color:#9ec5ff;border-color:#2a4a6b;}
      #${PANEL_ID} .bdg.submitted{color:#8fe3b0;border-color:#2a5a42;}
      #${PANEL_ID} .detail{flex:1;min-height:120px;overflow:auto;border:1px solid #2e2e34;border-radius:9px;padding:11px;}
      #${PANEL_ID} .detail .ph{color:#8a8a90;font-size:12px;text-align:center;padding:20px 0;}
      #${PANEL_ID} .fld{margin-bottom:9px;}
      #${PANEL_ID} .fld label{display:block;font-size:10px;color:#8a8a90;margin-bottom:3px;}
      #${PANEL_ID} input[type=text],#${PANEL_ID} textarea,#${PANEL_ID} select{width:100%;background:#0b0b0d;color:#f7f4ef;
        border:1px solid #2e2e34;border-radius:7px;padding:7px 9px;font-family:inherit;font-size:12px;outline:none;}
      #${PANEL_ID} input:focus,#${PANEL_ID} textarea:focus,#${PANEL_ID} select:focus{border-color:#f7f4ef;}
      #${PANEL_ID} textarea{height:130px;resize:vertical;font-family:Consolas,monospace;line-height:1.45;}
      #${PANEL_ID} .two{display:flex;gap:8px;}
      #${PANEL_ID} .two>div{flex:1;}
      #${PANEL_ID} .chk{display:flex;align-items:center;gap:6px;margin-bottom:9px;}
      #${PANEL_ID} .chk input{width:15px;height:15px;accent-color:#f7f4ef;}
      #${PANEL_ID} .chk label{margin:0;color:#f7f4ef;font-size:12px;}
      #${PANEL_ID} .log{flex-shrink:0;height:74px;overflow:auto;background:#0b0b0d;border:1px solid #2e2e34;border-radius:7px;
        padding:6px 8px;font-family:Consolas,monospace;font-size:11px;color:#8a8a90;white-space:pre-wrap;}
    </style>
    <div class="hd"><b>Suno Creator</b><span style="flex:1"></span>
      <button id="sc-x" class="x" title="閉じる">×</button></div>
    <div class="bd">
      <div class="row">
        <button id="sc-file">ファイル読込</button>
        <span class="cnt" id="sc-count">0曲</span>
        <span style="flex:1"></span>
        <button id="sc-run" class="primary">連続生成（全部）</button>
      </div>
      <div class="list" id="sc-list"><div class="empty">「ファイル読込」でJSON(1曲/配列)を選択</div></div>
      <div class="detail" id="sc-detail"><div class="ph">↑ リストから曲を選択すると内容を表示</div></div>
      <input id="sc-fileinput" type="file" accept=".json,application/json" style="display:none" />
      <div class="log" id="sc-log">JSONを読み込み→曲を選んで内容確認→「連続生成（全部）」または各曲を生成（最大5曲）。</div>
    </div>`;
    document.body.appendChild(panel);

    const $ = (id) => panel.querySelector(id);
    const logEl = $('#sc-log');
    const log = (m) => { logEl.textContent += '\n' + m; logEl.scrollTop = logEl.scrollHeight; };

    // 開閉(インラインtransformで確実に。CSSの.open上書きに依存しない)
    const open = () => { panel.style.transform = 'translateX(0)'; fab.style.display = 'none'; };
    const close = () => { panel.style.transform = 'translateX(100%)'; fab.style.display = ''; };
    fab.addEventListener('click', open);
    $('#sc-x').addEventListener('click', close);

    // ---- リスト ----
    function renderList() {
      $('#sc-count').textContent = songs.length + '曲';
      const el = $('#sc-list');
      if (!songs.length) { el.innerHTML = '<div class="empty">「ファイル読込」でJSON(1曲/配列)を選択</div>'; return; }
      el.innerHTML = '';
      songs.forEach((s, i) => {
        const err = validate(s), st = statuses[i] || '';
        const it = document.createElement('div');
        it.className = 'item' + (i === sel ? ' sel' : '');
        it.innerHTML =
          '<span class="ix">' + (i + 1) + '</span>' +
          '<div class="mt"><div class="t"></div><div class="s"></div></div>' +
          (err ? '<span class="bdg invalid">要確認</span>' : (st ? '<span class="bdg ' + st + '">' + (BADGE[st] || st) + '</span>' : ''));
        it.querySelector('.t').textContent = s.title || '(無題・自動命名)';
        it.querySelector('.s').textContent = (s.instrumental ? '[inst] ' : '') + (s.style || '(スタイル未設定)');
        it.addEventListener('click', () => select(i));
        el.appendChild(it);
      });
    }

    // ---- 詳細(選択曲) ----
    function renderDetail() {
      const el = $('#sc-detail');
      if (sel < 0 || !songs[sel]) { el.innerHTML = '<div class="ph">↑ リストから曲を選択すると内容を表示</div>'; return; }
      const s = songs[sel];
      const extra = [];
      if (s.weirdness != null) extra.push('Weirdness ' + s.weirdness);
      if (s.styleInfluence != null) extra.push('StyleInfluence ' + s.styleInfluence);
      el.innerHTML = `
        <div class="fld"><label>Title</label><input type="text" id="d-title"></div>
        <div class="fld"><label>Style</label><input type="text" id="d-style"></div>
        <div class="chk"><input type="checkbox" id="d-inst"><label for="d-inst">Instrumental（歌なし）</label></div>
        <div class="fld" id="d-lyr-wrap"><label>Lyrics</label><textarea id="d-lyrics"></textarea></div>
        <div class="two">
          <div class="fld"><label>Vocal</label><select id="d-vocal">
            <option value="auto">Auto</option><option value="female">Female</option><option value="male">Male</option></select></div>
          <div class="fld"><label>Exclude</label><input type="text" id="d-exclude"></div>
        </div>
        ${extra.length ? '<div class="cnt" style="margin-bottom:9px;">' + extra.join(' / ') + '（スライダーは未対応・既定値）</div>' : ''}
        <button id="d-gen" class="primary" style="width:100%;">この曲を生成</button>`;
      $('#d-title').value = s.title || '';
      $('#d-style').value = s.style || '';
      $('#d-exclude').value = s.exclude || '';
      $('#d-lyrics').value = s.lyrics || '';
      $('#d-inst').checked = !!s.instrumental;
      $('#d-vocal').value = ['male', 'female', 'auto'].includes(s.vocal) ? s.vocal : 'auto';
      function syncInst() { const on = $('#d-inst').checked; $('#d-lyrics').disabled = on; $('#d-lyr-wrap').style.opacity = on ? .4 : 1; }
      syncInst();
      const upd = () => {
        s.title = $('#d-title').value; s.style = $('#d-style').value; s.exclude = $('#d-exclude').value;
        s.lyrics = $('#d-lyrics').value; s.instrumental = $('#d-inst').checked; s.vocal = $('#d-vocal').value;
        renderList();
      };
      ['d-title', 'd-style', 'd-exclude', 'd-lyrics', 'd-vocal'].forEach((id) => $('#' + id).addEventListener('input', upd));
      $('#d-inst').addEventListener('change', () => { upd(); syncInst(); });
      $('#d-gen').addEventListener('click', () => genIndex(sel));
    }

    function select(i) { sel = i; renderList(); renderDetail(); }
    function setStatus(i, st) { statuses[i] = st; renderList(); }

    function loadData(data) {
      songs = Array.isArray(data) ? data : [data];
      statuses = songs.map(() => '');
      sel = songs.length ? 0 : -1;
      renderList(); renderDetail();
    }

    async function genIndex(i) {
      if (busy) return;
      const s = songs[i], err = validate(s);
      if (err) { log(`✖ #${i + 1}: ${err}`); return; }
      busy = true; $('#sc-run').disabled = true;
      setStatus(i, 'submitting'); log('生成: ' + (s.title || '#' + (i + 1)));
      try { const ok = await generateOne(s, log); setStatus(i, ok ? 'submitted' : 'failed'); }
      catch (e) { setStatus(i, 'failed'); log('✖ ' + e.message); }
      finally { busy = false; $('#sc-run').disabled = false; }
    }

    // ---- ハンドラ ----
    $('#sc-file').addEventListener('click', () => $('#sc-fileinput').click());
    $('#sc-fileinput').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const txt = String(rd.result).replace(/^﻿/, '').trim();
        try { loadData(JSON.parse(txt)); log('📂 読込: ' + f.name + '（' + songs.length + '曲）'); }
        catch (err) { log('✖ JSON不正: ' + err.message); }
      };
      rd.onerror = () => log('✖ 読込失敗');
      rd.readAsText(f, 'utf-8');
      e.target.value = '';
    });
    $('#sc-run').addEventListener('click', async () => {
      if (busy) return;
      if (!songs.length) { log('曲がありません。「ファイル読込」してください。'); return; }
      for (let i = 0; i < songs.length; i++) { const e = validate(songs[i]); if (e) { log(`✖ #${i + 1}: ${e}`); return; } }
      const n = Math.min(songs.length, MAX_BATCH);
      if (songs.length > MAX_BATCH) log(`⚠ 最大${MAX_BATCH}曲。先頭${MAX_BATCH}曲のみ投入します。`);
      busy = true; $('#sc-run').disabled = true;
      log(`— ${n}曲 連続生成 —`);
      try {
        for (let i = 0; i < n; i++) {
          log(`[${i + 1}/${n}] ${songs[i].title || ''}`);
          setStatus(i, 'submitting');
          const ok = await generateOne(songs[i], log);
          setStatus(i, ok ? 'submitted' : 'failed');
          if (i < n - 1) await sleep(9000);
        }
        log('✅ 完了（Suno側で生成中）');
      } catch (e) { log('✖ ' + e.message); }
      finally { busy = false; $('#sc-run').disabled = false; }
    });

    console.log('[Suno Creator] ready (closed)');
  } // end init

  init();
  // SunoはSPA。マウント後/ページ遷移でUIが無くなったら作り直す
  setInterval(() => { if (!document.getElementById(PANEL_ID)) init(); }, 1500);
})();
