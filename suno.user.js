// ==UserScript==
// @name         Suno Creator (minimal)
// @namespace    hwiiza.suno
// @version      0.1.3
// @description  SunoのCreate画面にパネルを出し、JSON(1曲/配列)を読み込んで生成・連続生成する検証用ミニ版
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

  // ---- パネルUI (SPA対策: 無ければ作る／消えたら再注入) ----
  const PANEL_ID = 'suno-creator-panel';

  function init() {
    if (!document.body || document.getElementById(PANEL_ID)) return;

    let songs = [];     // 読み込んだ曲
    let statuses = [];  // '' | submitting | submitted | failed
    let sel = -1;       // 選択中index
    let busy = false;
    const BADGE = { submitting: '投入中', submitted: '投入済', failed: '失敗' };

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
    <style>
      #${PANEL_ID}{position:fixed;right:16px;bottom:16px;width:360px;z-index:2147483647;
        background:#101012;color:#f7f4ef;border:1px solid #2e2e34;border-radius:12px;
        font-family:"Neue Montreal",system-ui,"Segoe UI","Yu Gothic UI",sans-serif;font-size:13px;
        box-shadow:0 10px 36px rgba(0,0,0,.6);}
      #${PANEL_ID} *{box-sizing:border-box;}
      #${PANEL_ID} .hd{display:flex;align-items:center;gap:8px;padding:10px 13px;border-bottom:1px solid #2e2e34;cursor:move;}
      #${PANEL_ID} .hd b{font-size:13px;letter-spacing:.02em;}
      #${PANEL_ID} .bd{padding:11px 13px;}
      #${PANEL_ID} .row{display:flex;gap:7px;align-items:center;}
      #${PANEL_ID} button{background:#252529;color:#f7f4ef;border:1px solid #2e2e34;border-radius:999px;
        padding:6px 13px;cursor:pointer;font-size:12px;font-family:inherit;}
      #${PANEL_ID} button:hover{background:#303035;}
      #${PANEL_ID} button.primary{background:#f7f4ef;border-color:#f7f4ef;color:#101012;font-weight:600;}
      #${PANEL_ID} button.primary:hover{background:#fff;}
      #${PANEL_ID} button:disabled{opacity:.45;cursor:not-allowed;}
      #${PANEL_ID} .cnt{color:#8a8a90;font-size:11px;}
      #${PANEL_ID} .list{margin-top:9px;max-height:150px;overflow:auto;border:1px solid #2e2e34;border-radius:9px;}
      #${PANEL_ID} .empty{color:#8a8a90;font-size:11px;padding:14px;text-align:center;}
      #${PANEL_ID} .item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #2e2e34;cursor:pointer;}
      #${PANEL_ID} .item:last-child{border-bottom:none;}
      #${PANEL_ID} .item:hover{background:#1a1a1d;}
      #${PANEL_ID} .item.sel{background:#252529;}
      #${PANEL_ID} .item .ix{color:#8a8a90;width:15px;text-align:right;font-size:11px;}
      #${PANEL_ID} .item .mt{flex:1;min-width:0;}
      #${PANEL_ID} .item .t{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #${PANEL_ID} .item .s{font-size:10px;color:#8a8a90;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #${PANEL_ID} .bdg{font-size:10px;padding:1px 8px;border-radius:999px;border:1px solid #2e2e34;color:#8a8a90;white-space:nowrap;}
      #${PANEL_ID} .bdg.invalid,#${PANEL_ID} .bdg.failed{color:#ff8a8a;border-color:#5a2a2a;}
      #${PANEL_ID} .bdg.submitting{color:#9ec5ff;border-color:#2a4a6b;}
      #${PANEL_ID} .bdg.submitted{color:#8fe3b0;border-color:#2a5a42;}
      #${PANEL_ID} .detail{margin-top:9px;border:1px solid #2e2e34;border-radius:9px;padding:10px;max-height:240px;overflow:auto;}
      #${PANEL_ID} .detail .ph{color:#8a8a90;font-size:12px;text-align:center;padding:14px 0;}
      #${PANEL_ID} .fld{margin-bottom:8px;}
      #${PANEL_ID} .fld label{display:block;font-size:10px;color:#8a8a90;margin-bottom:3px;}
      #${PANEL_ID} input[type=text],#${PANEL_ID} textarea,#${PANEL_ID} select{width:100%;background:#0b0b0d;color:#f7f4ef;
        border:1px solid #2e2e34;border-radius:7px;padding:6px 8px;font-family:inherit;font-size:12px;outline:none;}
      #${PANEL_ID} input:focus,#${PANEL_ID} textarea:focus,#${PANEL_ID} select:focus{border-color:#f7f4ef;}
      #${PANEL_ID} textarea{height:90px;resize:vertical;font-family:Consolas,monospace;line-height:1.45;}
      #${PANEL_ID} .two{display:flex;gap:8px;}
      #${PANEL_ID} .two>div{flex:1;}
      #${PANEL_ID} .chk{display:flex;align-items:center;gap:6px;margin-bottom:8px;}
      #${PANEL_ID} .chk input{width:15px;height:15px;accent-color:#f7f4ef;}
      #${PANEL_ID} .chk label{margin:0;color:#f7f4ef;font-size:12px;}
      #${PANEL_ID} .log{margin-top:9px;height:64px;overflow:auto;background:#0b0b0d;border:1px solid #2e2e34;border-radius:7px;
        padding:6px 8px;font-family:Consolas,monospace;font-size:11px;color:#8a8a90;white-space:pre-wrap;}
      #${PANEL_ID} .min .bd{display:none;}
    </style>
    <div class="hd"><b>Suno Creator</b><span style="flex:1"></span>
      <button id="sc-min" style="padding:1px 9px;border-radius:7px;">_</button></div>
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
        ${extra.length ? '<div class="cnt" style="margin-bottom:8px;">' + extra.join(' / ') + '（スライダーは未対応・既定値）</div>' : ''}
        <button id="d-gen" class="primary" style="width:100%;">この曲を生成</button>`;
      $('#d-title').value = s.title || '';
      $('#d-style').value = s.style || '';
      $('#d-exclude').value = s.exclude || '';
      $('#d-lyrics').value = s.lyrics || '';
      $('#d-inst').checked = !!s.instrumental;
      $('#d-vocal').value = ['male', 'female', 'auto'].includes(s.vocal) ? s.vocal : 'auto';
      syncInst();

      const upd = () => {
        s.title = $('#d-title').value;
        s.style = $('#d-style').value;
        s.exclude = $('#d-exclude').value;
        s.lyrics = $('#d-lyrics').value;
        s.instrumental = $('#d-inst').checked;
        s.vocal = $('#d-vocal').value;
        renderList();
      };
      function syncInst() { const on = $('#d-inst').checked; $('#d-lyrics').disabled = on; $('#d-lyr-wrap').style.opacity = on ? .4 : 1; }
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
    $('#sc-min').addEventListener('click', () => panel.classList.toggle('min'));
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

    // ドラッグ移動
    (function () {
      const hd = panel.querySelector('.hd'); let sx, sy, ox, oy, on = false;
      hd.addEventListener('mousedown', (e) => { if (e.target.id === 'sc-min') return; on = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault(); });
      window.addEventListener('mousemove', (e) => { if (!on) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; });
      window.addEventListener('mouseup', () => { on = false; });
    })();

    console.log('[Suno Creator] panel injected');
  } // end init

  init();
  // SunoはSPA。マウント後/ページ遷移でパネルが無くなったら作り直す
  setInterval(() => { if (!document.getElementById(PANEL_ID)) init(); }, 1500);
})();
