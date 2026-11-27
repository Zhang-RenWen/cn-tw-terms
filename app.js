(function () {
  'use strict';

  const CFG = Object.assign({ repo: '', branch: 'main' }, window.SITE_CONFIG || {});
  const hasRepo = CFG.repo && !CFG.repo.startsWith('YOUR-');

  const MODES = {
    'cn-twp': { from: 'cn', to: 'twp', h: ['简', '繁'], inL: '原文 · 简体', outL: '結果 · 繁體', desc: '簡體轉繁體（台灣正體），並把中國用語換成台灣用語' },
    'cn-tw': { from: 'cn', to: 'tw', h: ['简', '繁'], inL: '原文 · 简体', outL: '結果 · 繁體', desc: '只轉台灣正體字形，用語只標示建議' }
  };
  const KIND_LABEL = { vocab: '一般用語', loaded: '評價意涵', false: '同字異義' };

  const $ = id => document.getElementById(id);
  const input = $('input'), output = $('output');
  // 示範文字寫在 index.html 的 <textarea> 裡（畫面不用等 JavaScript 就有內容）
  const SAMPLE = input.defaultValue;
  let mode = 'cn-twp', terms = [], files = [], matcher = null;
  const convCache = {};

  // 一個簡體字對多個繁體字（干：乾／幹、发：發／髮、面：面／麵、后：后／後）時 OpenCC 會選錯的詞，收在 data/char-fixes.json。
  // fixChars() 先標出這些字該轉成哪個字（佔位字，字數不變；一個字被好幾個例外詞涵蓋時取最長的詞），
  // 轉換時 OpenCC 照原文轉、保留前後文，再把標出的位置換成正確的字，最後才套台灣字形與用語
  let fixIdx = new Map(), fixBack = {};
  const PH = /[\uE001-\uF8FF]/g;
  function setFixes(data) {
    const idx = new Map(), back = {}, ph = {};
    let code = 0xE001;
    for (const [k, groups] of Object.entries(data || {})) {
      if (k.length !== 1 || !groups || typeof groups !== 'object') continue;
      for (const [to, words] of Object.entries(groups)) {
        if (to.length !== 1 || !Array.isArray(words)) continue;
        const id = k + to;
        if (!ph[id]) { ph[id] = String.fromCharCode(code++); back[ph[id]] = [k, to]; }
        for (const w of words.map(String)) {
          const offs = [];
          for (let j = w.indexOf(k); j >= 0; j = w.indexOf(k, j + 1)) offs.push(j);
          if (!offs.length) continue;
          if (!idx.has(k)) idx.set(k, []);
          idx.get(k).push({ w, offs, ch: ph[id] });
        }
      }
    }
    idx.forEach(list => list.sort((a, b) => b.w.length - a.w.length));
    fixIdx = idx; fixBack = back;
  }
  function fixChars(s) {
    if (!fixIdx.size) return s;
    let out = '';
    for (let p = 0; p < s.length; p++) {
      const list = fixIdx.get(s[p]);
      let ch = s[p];
      if (list) find: for (const f of list) for (const o of f.offs) if (p >= o && s.startsWith(f.w, p - o)) { ch = f.ch; break find; }
      out += ch;
    }
    return out;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const flash = (id, msg, ms = 2400) => { const el = $(id); el.textContent = msg; setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, ms); };

  function getConv(from, to) {
    if (!window.OpenCC) return null;
    const k = from + '>' + to;
    if (!convCache[k]) {
      if (from !== 'cn') convCache[k] = OpenCC.Converter({ from, to });
      else {
        // cn → tw／twp 等於 cn → t（簡轉繁，字數不變）再 t → tw／twp（台灣字形、用語），所以可以在中間換掉例外字
        const toT = OpenCC.Converter({ from: 'cn', to: 't' }), toLocal = OpenCC.Converter({ from: 't', to });
        const c = s => {
          const pos = [];
          const raw = s.replace(PH, (ch, i) => { const f = fixBack[ch]; if (!f) return ch; pos.push([i, f[1]]); return f[0]; });
          let t = toT(raw);
          if (pos.length) {
            if (t.length === raw.length) { const a = t.split(''); pos.forEach(([i, ch]) => { a[i] = ch; }); t = a.join(''); }
            // 罕用字轉成擴充區字元、字數對不上時，退回直接轉佔位字
            else t = toT(s).replace(PH, ch => fixBack[ch] ? fixBack[ch][1] : ch);
          }
          return toLocal(t);
        };
        // 台灣繁體統一用「台」：OpenCC 轉出來的「臺」改成「台」，原文本來就寫的「臺」（正式名稱）先用佔位字保護、保留不動
        convCache[k] = to === 'tw' || to === 'twp'
          ? s => c(s.replace(/臺/g, '\uE000')).replace(/臺/g, '台').replace(/\uE000/g, '臺')
          : c;
      }
    }
    return convCache[k];
  }
  // 「行動電源、移動電源」取第一個；「交流道（高架橋）」去掉括號
  const firstAlt = s => (s || '').split(/[、，,／/]/)[0].replace(/[（(].*$/, '').trim();
  const usable = s => !!s && !/^(無|—|-$)/.test(s);
  // 點選用的全部說法：「電腦；資訊、資工（科系）」→ 電腦、資訊、資工
  const alts = s => [...new Set((s || '').split(/[、，,／/；;]/).map(x => x.replace(/[（(][^）)]*[）)]/g, '').trim()).filter(usable))];

  /* 詞彙索引：首字 → 候選詞（長詞優先），同時收簡體與繁體寫法 */
  function buildMatcher() {
    if (matcher && matcher.n === terms.length) return matcher;
    const idx = new Map();
    const add = (pat, t) => {
      if (!pat) return;
      if (!idx.has(pat[0])) idx.set(pat[0], []);
      idx.get(pat[0]).push({ pat, t });
    };
    const toS = getConv('tw', 'cn'), toT = getConv('cn', 'tw');
    for (const t of terms) {
      const forms = new Set([t.cn]);
      if (toS) forms.add(toS(t.cn));
      if (toT) forms.add(toT(t.cn));
      forms.forEach(f => add(f, t));
    }
    idx.forEach(list => list.sort((a, b) => b.pat.length - a.pat.length));
    matcher = { n: terms.length, idx };
    return matcher;
  }

  /* 逐字標示字形差異；長度不同時在小視窗內找回同步點 */
  function diffHtml(src, out) {
    const a = [...src], b = [...out];
    let html = '', changed = 0;
    if (a.length === b.length) {
      for (let i = 0; i < b.length; i++) {
        if (a[i] !== b[i]) { changed++; html += '<mark>' + esc(b[i]) + '</mark>'; } else html += esc(b[i]);
      }
      return { html, changed };
    }
    let i = 0, j = 0;
    while (j < b.length) {
      if (a[i] === b[j]) { html += esc(b[j]); i++; j++; continue; }
      let si = -1, sj = -1;
      search: for (let d = 1; d <= 8; d++) for (let x = 0; x <= d; x++) {
        const y = d - x;
        if (i + x < a.length && j + y < b.length && a[i + x] === b[j + y] && a[i + x + 1] === b[j + y + 1]) { si = i + x; sj = j + y; break search; }
      }
      if (sj < 0) { si = a.length; sj = b.length; }
      for (; j < sj; j++) { html += '<mark>' + esc(b[j]) + '</mark>'; changed++; }
      i = si;
    }
    return { html, changed };
  }

  /* 使用者點選的說法：「詞#第幾次出現」→ 文字；原文或模式改變就清空 */
  const picks = new Map(), pickOpts = new Map();
  let pickedFor = '';

  function render() {
    const src = input.value;
    $('inCount').textContent = [...src.replace(/\s/g, '')].length + ' 字';
    const M = MODES[mode], conv = getConv(M.from, M.to);
    if (!conv) { output.textContent = ''; $('found').hidden = true; return; }
    const { idx } = buildMatcher();
    if (pickedFor !== mode + '\n' + src) { picks.clear(); pickedFor = mode + '\n' + src; }
    pickOpts.clear();
    // 詞彙比對用原文；轉換用換過例外字的 text（字數和原文一樣），所以例外詞不會擋到詞彙比對
    let text = fixChars(src);
    if (text.length !== src.length) text = src;
    const occ = {};
    let html = '', changed = 0, plain = '', plainSrc = '';
    const hits = new Map();
    const flush = () => { if (!plain) return; const d = diffHtml(plainSrc, conv(plain)); html += d.html; changed += d.changed; plain = plainSrc = ''; };

    for (let i = 0; i < src.length;) {
      const cand = idx.get(src[i]);
      let hit = null;
      if (cand) for (const c of cand) { if (src.startsWith(c.pat, i)) { hit = c; break; } }
      if (!hit) { plain += text[i]; plainSrc += src[i]; i++; continue; }
      flush();
      const t = hit.t, raw = hit.pat, seg = text.slice(i, i + raw.length);
      // 只標示的詞（評價意涵、同字異義）只轉字形：twp 的詞典會自己把「數據」換成「資料」、「演算法」換成「演演算法」
      const orig = t.kind === 'vocab' ? conv(seg) : getConv('cn', 'tw')(seg);
      let shown, cls;
      if (t.kind === 'vocab' && mode === 'cn-twp' && usable(firstAlt(t.tw))) { shown = firstAlt(t.tw); cls = 't-vocab'; }
      else { shown = orig; cls = t.kind === 'loaded' ? 't-loaded' : t.kind === 'false' ? 't-false' : 't-hint'; }
      let tip = '中國用語「' + t.cn + '」' + (t.tw ? '，台灣：' + t.tw : '') + (t.note ? '。' + t.note : '');
      const key = t.cn + '#' + (occ[t.cn] = (occ[t.cn] || 0) + 1);
      const opts = alts(t.tw).filter(x => x !== orig);
      let attrs = '';
      if (opts.length) {
        pickOpts.set(key, { opts, orig, cn: t.cn, kind: t.kind });
        if (picks.has(key)) { shown = picks.get(key); cls = 't-picked ' + (shown === orig ? 't-hint' : 't-vocab'); }
        tip += '（點一下選擇其他說法）';
        attrs = ' data-k="' + esc(key) + '" tabindex="0" role="button" aria-haspopup="menu"';
        cls += ' pick';
      } else if (t.kind === 'loaded') {
        // 評價意涵（紅字）點一下捲到下方「這段文字裡的兩岸用語」的說明；有其他說法的改在選單裡放「看說明」
        tip += '（點一下看說明）';
        attrs = ' data-cn="' + esc(t.cn) + '" tabindex="0" role="button"';
        cls += ' jump';
      }
      html += '<span class="t ' + cls + '" title="' + esc(tip) + '"' + attrs + '>' + esc(shown) + '</span>';
      if (shown !== raw) changed += [...shown].length;
      hits.set(t.cat + '/' + t.cn, t);
      i += raw.length;
    }
    flush();
    output.innerHTML = html;
    $('outCount').textContent = changed + ' 字變更 · ' + hits.size + ' 個用語';
    renderFound([...hits.values()]);
  }

  function renderFound(list) {
    const box = $('found'), ul = $('foundList');
    if (!list.length) { box.hidden = true; ul.innerHTML = ''; return; }
    const order = { loaded: 0, false: 1, vocab: 2 };
    list.sort((a, b) => order[a.kind] - order[b.kind]);
    ul.innerHTML = list.map(t =>
      '<li class="' + t.kind + '" data-cn="' + esc(t.cn) + '" tabindex="-1"><span class="pair">' + esc(t.cn) + ' → ' + esc(t.tw || '無固定對應') +
      '</span><span class="note">' + esc(KIND_LABEL[t.kind]) + (t.note ? ' · ' + esc(t.note) : '') + '</span></li>').join('');
    box.hidden = false;
  }

  function setMode(m) {
    mode = m;
    const M = MODES[m];
    document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    $('hFrom').textContent = M.h[0]; $('hTo').textContent = M.h[1];
    $('inLabel').textContent = M.inL; $('outLabel').textContent = M.outL; $('modeDesc').textContent = M.desc;
    render();
  }

  /* ---------- 分頁 ---------- */
  // 切到詞彙庫：把原文與模式存進 sessionStorage，再隱藏轉換器（display: none，元件不會被移除）
  // 切回轉換器：從 sessionStorage 復原原文與模式，再顯示
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  function showTab(lib) {
    if (lib) { ss.set('s2t-draft', input.value); ss.set('s2t-mode', mode); }
    $('tabConv').setAttribute('aria-selected', !lib); $('tabLib').setAttribute('aria-selected', lib);
    // #viewConv 的 inline style 有 display:flex，hidden 屬性會被蓋掉，所以直接設 display
    $('viewConv').hidden = lib; $('viewConv').style.display = lib ? 'none' : 'flex';
    $('viewLib').hidden = !lib; $('viewLib').style.display = lib ? 'flex' : '';
    $('modes').style.visibility = lib ? 'hidden' : 'visible';
    if (!lib) {
      const d = ss.get('s2t-draft'), m = ss.get('s2t-mode');
      if (d != null) input.value = d;
      if (MODES[m]) setMode(m); else render();
    }
  }
  $('tabConv').addEventListener('click', () => showTab(false));
  $('tabLib').addEventListener('click', () => showTab(true));

  /* ---------- 詞彙庫（唯讀） ---------- */
  let fKind = '', fCat = '', fQ = '';
  function renderLib() {
    $('libCount').textContent = terms.length;
    const sel = $('catSel'), cur = sel.value;
    sel.innerHTML = '<option value="">全部分類</option>' + files.map(f => '<option>' + esc(f.category) + '</option>').join('');
    sel.value = cur;
    const fc = $('fCat'), fcur = fc.value;
    fc.innerHTML = files.map(f => '<option value="' + esc(f.file) + '">' + esc(f.category) + '</option>').join('');
    if (fcur) fc.value = fcur;

    const q = fQ.trim().toLowerCase();
    const list = terms.filter(t => (!fKind || t.kind === fKind) && (!fCat || t.cat === fCat) &&
      (!q || [t.cn, t.tw, t.note, t.cat].join(' ').toLowerCase().includes(q)));
    // 中國用語連到該詞的詞彙頁，另開分頁，詞彙庫的搜尋與篩選才不會不見；檔名跟 scripts/build-pages.mjs 的 slug 一樣是 encodeURIComponent(詞).html
    $('rows').innerHTML = list.map(t =>
      '<tr><td class="cn"><a href="terms/' + encodeURIComponent(t.cn) + '.html" target="_blank" rel="noopener">' + esc(t.cn) + '</a></td><td>' + esc(t.tw || '—') + '</td><td><span class="kind ' + t.kind + '">' +
      esc(KIND_LABEL[t.kind]) + '</span></td><td class="category">' + esc(t.cat) + '</td><td class="note">' + esc(t.note || '') + '</td></tr>').join('');
    const empty = $('libEmpty');
    empty.hidden = list.length > 0;
    if (!list.length && terms.length) empty.textContent = '沒有符合條件的詞。';
  }
  $('q').addEventListener('input', e => { fQ = e.target.value; renderLib(); });
  $('catSel').addEventListener('change', e => { fCat = e.target.value; renderLib(); });
  $('kindChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    fKind = b.dataset.kind;
    document.querySelectorAll('#kindChips .chip').forEach(c => c.setAttribute('aria-pressed', c === b));
    renderLib();
  });

  /* ---------- 提議新增：產生 JSON 片段與 GitHub 連結 ---------- */
  $('termForm').addEventListener('submit', e => {
    e.preventDefault();
    const entry = { cn: $('fCn').value.trim(), tw: $('fTw').value.trim(), kind: $('fKind').value };
    const note = $('fNote').value.trim();
    if (note) entry.note = note;
    if (!entry.cn) { flash('fMsg', '請填中國用語'); return; }
    const file = $('fCat').value;
    const cat = (files.find(f => f.file === file) || {}).category || '';
    const dup = terms.find(t => t.cn === entry.cn);
    const snippet = JSON.stringify(entry, null, 2).replace(/^/gm, '    ') + ',';
    $('snippet').textContent = snippet;
    $('copySnippet').disabled = false;
    if (hasRepo) {
      const edit = $('editLink'), issue = $('issueLink');
      edit.href = 'https://github.com/' + CFG.repo + '/edit/' + CFG.branch + '/data/' + file;
      edit.hidden = false;
      const body = '分類：' + cat + '\n\n```json\n' + JSON.stringify(entry, null, 2) + '\n```';
      issue.href = 'https://github.com/' + CFG.repo + '/issues/new?title=' + encodeURIComponent('新增詞彙：' + entry.cn) + '&body=' + encodeURIComponent(body);
      issue.hidden = false;
    }
    flash('fMsg', dup ? '「' + entry.cn + '」已在「' + dup.cat + '」，PR 請改成修改原條目' : '已產生，貼到 ' + file);
  });
  $('copySnippet').addEventListener('click', () => {
    const t = $('snippet').textContent;
    try { navigator.clipboard.writeText(t).then(() => flash('sMsg', '已複製'), () => flash('sMsg', '請手動選取複製')); }
    catch (e) { flash('sMsg', '請手動選取複製'); }
  });

  /* ---------- 點選其他說法 ---------- */
  const menu = document.createElement('div');
  menu.className = 'alt-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  document.body.appendChild(menu);
  let menuKey = null;
  const closeMenu = () => { if (!menu.hidden) { menu.hidden = true; menuKey = null; } };
  const findSpan = k => [...output.querySelectorAll('.pick')].find(s => s.dataset.k === k);

  function openMenu(span) {
    const k = span.dataset.k, o = pickOpts.get(k);
    if (!o) return;
    const cur = span.textContent;
    menu.innerHTML = '<div class="hd">選擇說法</div>' +
      o.opts.map(x => '<button type="button" role="menuitem" data-v="' + esc(x) + '"' + (x === cur ? ' class="cur"' : '') + '>' + esc(x) + '</button>').join('') +
      '<button type="button" role="menuitem" data-v="' + esc(o.orig) + '"' + (o.orig === cur ? ' class="cur"' : '') + '>保留「' + esc(o.orig) + '」</button>' +
      (o.kind === 'loaded' ? '<button type="button" role="menuitem" class="note-item" data-note="' + esc(o.cn) + '">看說明 ↓</button>' : '');
    menu.hidden = false; menuKey = k;
    const r = span.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    menu.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    (menu.querySelector('.cur') || menu.querySelector('button')).focus({ preventScroll: true });
  }

  // 捲到「這段文字裡的兩岸用語」裡這個詞的說明，並短暫標亮
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function showNote(cn) {
    const li = [...$('foundList').children].find(x => x.dataset.cn === cn);
    if (!li) return;
    li.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
    li.focus({ preventScroll: true });
    li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
    setTimeout(() => li.classList.remove('flash'), 1600);
  }

  output.addEventListener('click', e => {
    const s = e.target.closest('.pick');
    if (s) { if (menuKey === s.dataset.k) closeMenu(); else openMenu(s); return; }
    const j = e.target.closest('.jump');
    if (j) showNote(j.dataset.cn);
  });
  output.addEventListener('keydown', e => {
    const s = e.target.closest('.pick, .jump');
    if (!s || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (s.classList.contains('pick')) openMenu(s); else showNote(s.dataset.cn);
  });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !menuKey) return;
    if (b.dataset.note != null) { closeMenu(); showNote(b.dataset.note); return; }
    const k = menuKey;
    picks.set(k, b.dataset.v); closeMenu(); render();
    const s = findSpan(k); if (s) s.focus();
  });
  menu.addEventListener('keydown', e => {
    const bs = [...menu.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    else if (e.key === 'Escape') { const k = menuKey; closeMenu(); const s = findSpan(k); if (s) s.focus(); }
  });
  document.addEventListener('mousedown', e => { if (!menu.contains(e.target) && !e.target.closest('.pick')) closeMenu(); });
  addEventListener('resize', closeMenu);
  output.addEventListener('scroll', closeMenu);
  addEventListener('scroll', closeMenu, true);

  /* ---------- 轉換器事件 ---------- */
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  input.addEventListener('input', render);
  $('clear').addEventListener('click', () => { input.value = ''; render(); input.focus(); });
  $('sample').addEventListener('click', () => { input.value = SAMPLE; render(); });
  // 「貼上」用 Clipboard API 讀剪貼簿，取代輸入框的內容。只能在 HTTPS 或 localhost 使用，不支援的瀏覽器不顯示按鈕。
  // Chrome 第一次會詢問權限，Safari、Firefox 會先跳出「貼上」讓使用者確認；被拒絕時提示改用鍵盤貼上
  const pasteBtn = $('paste');
  if (!(navigator.clipboard && navigator.clipboard.readText)) pasteBtn.hidden = true;
  pasteBtn.addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) { flash('status', '剪貼簿裡沒有文字'); return; }
      input.value = t; render();
    } catch (e) {
      flash('status', '無法讀取剪貼簿，請在輸入框按 Ctrl+V（Mac 按 ⌘V）', 4000);
      input.focus();
    }
  });
  $('hl').addEventListener('change', e => output.classList.toggle('plain', !e.target.checked));
  $('copy').addEventListener('click', () => {
    const t = output.textContent, toast = $('toast');
    const done = () => { toast.textContent = '已複製'; setTimeout(() => toast.textContent = '', 1600); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(output); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast.textContent = '已選取，請按 Ctrl+C'; };
    try { navigator.clipboard.writeText(t).then(done, fallback); } catch (e) { fallback(); }
  });

  if (hasRepo) $('repoLine').innerHTML = ' 原始碼與詞彙：<a href="https://github.com/' + esc(CFG.repo) + '" target="_blank" rel="noopener">' + esc(CFG.repo) + '</a>';

  /* ---------- 啟動 ---------- */
  // 每次打開都從轉換器、「簡→繁＋台灣詞彙」與示範文字開始，不記錄上次的內容；詞彙頁的「用轉換器試試」會帶 ?q=詞
  const q = new URLSearchParams(location.search).get('q');
  // 清掉舊版留下的紀錄
  try { ['s2t-mode', 's2t-draft', 's2t-tab'].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  // 進入頁面一律從示範文字開始：清掉 sessionStorage 裡上次切換分頁留下的紀錄
  try { ['s2t-draft', 's2t-mode'].forEach(k => sessionStorage.removeItem(k)); } catch (e) {}
  input.value = q || SAMPLE;
  const status = $('status');
  if (!window.OpenCC) { status.textContent = '字典載入失敗，請檢查網路後重新整理'; status.classList.add('err'); }
  setMode(mode);
  showTab(false);

  /* ---------- 載入詞彙庫 data/*.json ---------- */
  (async () => {
    try {
      const index = await (await fetch('data/index.json', { cache: 'no-cache' })).json();
      // 例外詞載入失敗時只是少了修正，不影響詞彙庫
      const fixes = index.fixes ? fetch('data/' + index.fixes, { cache: 'no-cache' }).then(r => r.json()).catch(() => null) : null;
      const loaded = await Promise.all(index.files.map(async file => {
        const d = await (await fetch('data/' + file, { cache: 'no-cache' })).json();
        return { file, category: d.category, terms: d.terms || [] };
      }));
      files = loaded.map(({ file, category }) => ({ file, category }));
      terms = loaded.flatMap(f => f.terms.filter(t => t && t.cn).map(t => ({
        cn: String(t.cn), tw: String(t.tw || ''), kind: KIND_LABEL[t.kind] ? t.kind : 'vocab',
        note: String(t.note || ''), cat: f.category, file: f.file
      })));
      setFixes(await fixes);
      matcher = null;
      $('libEmpty').textContent = '沒有符合條件的詞。';
      renderLib(); render();
      if (index.version) $('libCount').title = '詞彙庫 v' + index.version;
      if (window.OpenCC) { status.textContent = '已載入詞彙庫 v' + (index.version || '') + '，共 ' + terms.length + ' 個詞'; setTimeout(() => { if (status.textContent.startsWith('已載入')) status.textContent = ''; }, 2000); }
    } catch (e) {
      const local = location.protocol === 'file:';
      status.textContent = local ? '直接開檔讀不到詞彙庫，請用本機伺服器開啟（見 README）' : '詞彙庫載入失敗，只做字形轉換';
      status.classList.add('err');
      $('libEmpty').textContent = status.textContent;
    }
  })();
})();
