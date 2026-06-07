// ==UserScript==
// @name         Suno Creator (minimal)
// @namespace    hwiiza.suno
// @version      0.1.0
// @description  SunoのCreate画面にパネルを出し、JSON(1曲/配列)を貼って生成・連続生成する検証用ミニ版
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
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- Suno UI 操作 ----
  function ensureAdvanced() {
    const adv = byText('button', 'Advanced');
    if (adv) { adv.click(); }
  }
  function ensureMoreOptions() {
    if (firstVisible('[role="slider"][aria-label="Weirdness"]')) return;
    const mo = byText('div', 'More Options') || byText('button', 'More Options');
    if (mo) mo.click();
  }
  function getLyrics() { return firstVisible('textarea[data-testid="lyrics-textarea"]'); }
  function getStyle() {
    for (const t of document.querySelectorAll('textarea:not([data-testid="lyrics-textarea"])')) if (isVisible(t)) return t;
    return null;
  }
  function getTitle() { return firstVisible('input[placeholder="Song Title (Optional)"]'); }
  function getCreate() { return firstVisible('button[aria-label="Create song"]') || byText('button', 'Create'); }

  function setVocal(gender) {
    const label = gender === 'female' ? 'Female' : gender === 'male' ? 'Male' : null;
    if (!label) return;
    const btn = byText('button', label);
    if (btn && btn.getAttribute('data-selected') !== 'true') btn.click();
  }
  // ※ 現状: ページ内JSでは合成keydownがスライダーに効かないため未対応。
  //    設定できなければ false を返す(呼び元で警告)。既定値のまま生成される。
  function setSlider(ariaLabel, target) {
    const s = firstVisible(`[role="slider"][aria-label="${ariaLabel}"]`);
    if (!s) return false;
    target = Math.max(0, Math.min(100, Math.round(target)));
    s.focus();
    for (let k = 0; k < 250; k++) {
      const now = Number(s.getAttribute('aria-valuenow'));
      if (Number.isNaN(now) || now === target) break;
      s.dispatchEvent(new KeyboardEvent('keydown', { key: now < target ? 'ArrowRight' : 'ArrowLeft', bubbles: true }));
      const after = Number(s.getAttribute('aria-valuenow'));
      if (after === now) break;
      if ((now < target) !== (after < target)) break;
    }
    return Number(s.getAttribute('aria-valuenow')) === target;
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

    const needMore = song.exclude || (song.vocal && song.vocal !== 'auto') ||
      song.weirdness != null || song.styleInfluence != null;
    if (needMore) {
      ensureMoreOptions();
      await sleep(500);
      if (song.exclude) { const ex = firstVisible('input[placeholder="Exclude styles"]'); if (ex) setNativeValue(ex, song.exclude); }
      if (song.vocal && song.vocal !== 'auto') setVocal(song.vocal);
      if (song.weirdness != null && !setSlider('Weirdness', Number(song.weirdness))) log('⚠ Weirdnessは現状未対応（既定値のまま）');
      if (song.styleInfluence != null && !setSlider('Style Influence', Number(song.styleInfluence))) log('⚠ Style Influenceは現状未対応（既定値のまま）');
    }
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

  // ---- パネルUI ----
  const PANEL_ID = 'suno-creator-panel';
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <style>
      #${PANEL_ID}{position:fixed;right:16px;bottom:16px;width:340px;z-index:999999;
        background:#171a21;color:#e6e9ef;border:1px solid #2a3040;border-radius:10px;
        font-family:"Segoe UI","Yu Gothic UI",sans-serif;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.5);}
      #${PANEL_ID} .hd{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #2a3040;cursor:move;}
      #${PANEL_ID} .hd b{font-size:13px;}
      #${PANEL_ID} .bd{padding:10px 12px;}
      #${PANEL_ID} textarea{width:100%;height:120px;background:#0b0d12;color:#e6e9ef;border:1px solid #2a3040;
        border-radius:7px;padding:8px;font-family:Consolas,monospace;font-size:12px;resize:vertical;outline:none;}
      #${PANEL_ID} .row{display:flex;gap:6px;margin-top:8px;}
      #${PANEL_ID} button{flex:1;background:#1f2430;color:#e6e9ef;border:1px solid #2a3040;border-radius:7px;
        padding:7px;cursor:pointer;font-size:12px;}
      #${PANEL_ID} button.primary{background:#6c8cff;border-color:#6c8cff;color:#fff;font-weight:600;}
      #${PANEL_ID} button:hover{border-color:#6c8cff;}
      #${PANEL_ID} .log{margin-top:8px;height:84px;overflow:auto;background:#0b0d12;border:1px solid #2a3040;
        border-radius:7px;padding:6px 8px;font-family:Consolas,monospace;font-size:11px;color:#8b93a7;white-space:pre-wrap;}
      #${PANEL_ID} .min .bd{display:none;}
    </style>
    <div class="hd"><b>Suno Creator</b><span style="flex:1"></span>
      <button id="sc-min" style="flex:0 0 auto;padding:2px 8px;">_</button></div>
    <div class="bd">
      <textarea id="sc-json" placeholder='1曲: {"style":"uplifting trance, female vocal","lyrics":"[Verse]..."}
複数: [ {...}, {...} ]（最大5曲）'></textarea>
      <div class="row">
        <button id="sc-file" style="flex:0 0 auto;">ファイル読込</button>
        <button id="sc-fmt" style="flex:0 0 70px;">整形</button>
      </div>
      <div class="row">
        <button id="sc-run" class="primary">生成 / 連続生成</button>
      </div>
      <input id="sc-fileinput" type="file" accept=".json,application/json" style="display:none" />
      <div class="log" id="sc-log">「ファイル読込」でJSONを選ぶか、直接貼って「生成」。配列なら順に投入（最大5曲）。</div>
    </div>`;
  document.body.appendChild(panel);

  const $ = (id) => panel.querySelector(id);
  const logEl = $('#sc-log');
  const log = (m) => { logEl.textContent += '\n' + m; logEl.scrollTop = logEl.scrollHeight; };

  $('#sc-min').addEventListener('click', () => panel.classList.toggle('min'));
  $('#sc-fmt').addEventListener('click', () => {
    try { $('#sc-json').value = JSON.stringify(JSON.parse($('#sc-json').value), null, 2); }
    catch (e) { log('✖ JSON不正: ' + e.message); }
  });

  // ファイル選択でJSON読込 → テキストエリアへ展開
  $('#sc-file').addEventListener('click', () => $('#sc-fileinput').click());
  $('#sc-fileinput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const txt = String(rd.result).replace(/^﻿/, '').trim(); // BOM除去
      try {
        const data = JSON.parse(txt);
        $('#sc-json').value = JSON.stringify(data, null, 2);
        const n = Array.isArray(data) ? data.length : 1;
        log('📂 読込: ' + f.name + '（' + n + '曲）');
      } catch (err) { log('✖ JSON不正: ' + err.message); }
    };
    rd.onerror = () => log('✖ 読込失敗');
    rd.readAsText(f, 'utf-8');
    e.target.value = ''; // 同じファイルを再選択できるようにリセット
  });

  let busy = false;
  $('#sc-run').addEventListener('click', async () => {
    if (busy) return;
    let data;
    try { data = JSON.parse($('#sc-json').value); }
    catch (e) { log('✖ JSON不正: ' + e.message); return; }
    let songs = Array.isArray(data) ? data : [data];
    for (let i = 0; i < songs.length; i++) { const e = validate(songs[i]); if (e) { log(`✖ #${i + 1}: ${e}`); return; } }
    if (songs.length > MAX_BATCH) { log(`⚠ 最大${MAX_BATCH}曲。先頭${MAX_BATCH}曲のみ投入します。`); songs = songs.slice(0, MAX_BATCH); }

    busy = true; $('#sc-run').disabled = true;
    log(`— ${songs.length}曲 生成 —`);
    try {
      for (let i = 0; i < songs.length; i++) {
        log(`[${i + 1}/${songs.length}]`);
        await generateOne(songs[i], log);
        if (i < songs.length - 1) await sleep(9000); // 次の投入まで待つ
      }
      log('✅ 完了（Suno側で生成中）');
    } catch (e) { log('✖ ' + e.message); }
    finally { busy = false; $('#sc-run').disabled = false; }
  });

  // パネルをドラッグ移動
  (function drag() {
    const hd = panel.querySelector('.hd'); let sx, sy, ox, oy, on = false;
    hd.addEventListener('mousedown', (e) => { if (e.target.id === 'sc-min') return; on = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (!on) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; });
    window.addEventListener('mouseup', () => { on = false; });
  })();

  console.log('[Suno Creator] panel injected');
})();
