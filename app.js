(function () {
  'use strict';

  const CFG = Object.assign({ repo: '', branch: 'main' }, window.SITE_CONFIG || {});
  const hasRepo = CFG.repo && !CFG.repo.startsWith('YOUR-');

  const MODES = {
    'cn-twp': { from: 'cn', to: 'twp', h: ['简', '繁'], inL: '原文 · 简体', outL: '結果 · 繁體', desc: '簡體轉臺灣正體，並套用兩岸用語詞彙庫' },
    'cn-tw': { from: 'cn', to: 'tw', h: ['简', '繁'], inL: '原文 · 简体', outL: '結果 · 繁體', desc: '只轉臺灣正體字形，用語只標示建議' },
    'cn-hk': { from: 'cn', to: 'hk', h: ['简', '繁'], inL: '原文 · 简体', outL: '結果 · 香港繁體', desc: '簡體轉香港繁體字形' },
    'tw-cn': { from: 'tw', to: 'cn', h: ['繁', '简'], inL: '原文 · 繁體', outL: '結果 · 简体', desc: '臺灣繁體轉簡體，並把台灣用語換回大陸用語' }
  };
  const KIND_LABEL = { vocab: '一般用語', loaded: '評價意涵', false: '同字異義' };
  const SAMPLE = '我们的软件团队正在开发一个新的网络应用程序，默认使用充电宝供电的摄像头。\n这个项目的含金量很高，领导说要给用户提供情绪价值，下沉市场也要覆盖。\n请把文件发到我的邮箱，视频的质量也没有问题。';

  const $ = id => document.getElementById(id);
  const input = $('input'), output = $('output');
  let mode = 'cn-twp', terms = [], files = [], matcher = null;
  const convCache = {};

  const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const load = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const flash = (id, msg) => { const el = $(id); el.textContent = msg; setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2400); };

  function getConv(from, to) {
    if (!window.OpenCC) return null;
    const k = from + '>' + to;
    if (!convCache[k]) convCache[k] = OpenCC.Converter({ from, to });
    return convCache[k];
  }
  // 「行動電源、移動電源」取第一個；「交流道（高架橋）」去掉括號
  const firstAlt = s => (s || '').split(/[、，,／/]/)[0].replace(/[（(].*$/, '').trim();
  const usable = s => !!s && !/^(無|—|-$)/.test(s);

  /* 詞彙索引：首字 → 候選詞（長詞優先），同時收簡體與繁體寫法 */
  function buildMatcher(m) {
    if (matcher && matcher.mode === m && matcher.n === terms.length) return matcher;
    const idx = new Map();
    const add = (pat, t, role) => {
      if (!pat) return;
      if (!idx.has(pat[0])) idx.set(pat[0], []);
      idx.get(pat[0]).push({ pat, t, role });
    };
    const toS = getConv('tw', 'cn'), toT = getConv('cn', 'tw');
    for (const t of terms) {
      if (m === 'tw-cn') {
        if (t.kind !== 'vocab' || t.oneway) continue;
        const tw = firstAlt(t.tw);
        if (usable(tw)) add(tw, t, 'rev');
      } else {
        const forms = new Set([t.cn]);
        if (toS) forms.add(toS(t.cn));
        if (toT) forms.add(toT(t.cn));
        forms.forEach(f => add(f, t, 'fwd'));
      }
    }
    idx.forEach(list => list.sort((a, b) => b.pat.length - a.pat.length));
    matcher = { mode: m, n: terms.length, idx };
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

  function render() {
    const src = input.value;
    $('inCount').textContent = [...src.replace(/\s/g, '')].length + ' 字';
    const M = MODES[mode], conv = getConv(M.from, M.to);
    if (!conv) { output.textContent = ''; $('found').hidden = true; return; }
    const { idx } = buildMatcher(mode);
    let html = '', changed = 0, plain = '';
    const hits = new Map();
    const flush = () => { if (!plain) return; const d = diffHtml(plain, conv(plain)); html += d.html; changed += d.changed; plain = ''; };

    for (let i = 0; i < src.length;) {
      const cand = idx.get(src[i]);
      let hit = null;
      if (cand) for (const c of cand) { if (src.startsWith(c.pat, i)) { hit = c; break; } }
      if (!hit) { plain += src[i]; i++; continue; }
      flush();
      const t = hit.t, raw = hit.pat;
      let shown, cls;
      if (hit.role === 'rev') { shown = conv(t.cn); cls = 't-vocab'; }
      else if (t.kind === 'vocab' && mode === 'cn-twp' && usable(firstAlt(t.tw))) { shown = firstAlt(t.tw); cls = 't-vocab'; }
      else { shown = conv(raw); cls = t.kind === 'loaded' ? 't-loaded' : t.kind === 'false' ? 't-false' : 't-hint'; }
      const tip = hit.role === 'rev'
        ? '台灣「' + raw + '」→ 大陸「' + t.cn + '」'
        : '中國用語「' + t.cn + '」' + (t.tw ? '，台灣：' + t.tw : '') + (t.note ? '。' + t.note : '');
      html += '<span class="t ' + cls + '" title="' + esc(tip) + '">' + esc(shown) + '</span>';
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
    if (!list.length || mode === 'tw-cn') { box.hidden = true; ul.innerHTML = ''; return; }
    const order = { loaded: 0, false: 1, vocab: 2 };
    list.sort((a, b) => order[a.kind] - order[b.kind]);
    ul.innerHTML = list.map(t =>
      '<li class="' + t.kind + '"><span class="pair">' + esc(t.cn) + ' → ' + esc(t.tw || '無固定對應') +
      '</span><span class="note">' + esc(KIND_LABEL[t.kind]) + (t.note ? ' · ' + esc(t.note) : '') + '</span></li>').join('');
    box.hidden = false;
  }

  function setMode(m) {
    mode = m; store('s2t-mode', m);
    const M = MODES[m];
    document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    $('hFrom').textContent = M.h[0]; $('hTo').textContent = M.h[1];
    $('inLabel').textContent = M.inL; $('outLabel').textContent = M.outL; $('modeDesc').textContent = M.desc;
    render();
  }

  /* ---------- 分頁 ---------- */
  function showTab(lib) {
    $('tabConv').setAttribute('aria-selected', !lib); $('tabLib').setAttribute('aria-selected', lib);
    $('viewConv').hidden = lib; $('viewLib').hidden = !lib;
    $('viewLib').style.display = lib ? 'flex' : '';
    $('modes').style.visibility = lib ? 'hidden' : 'visible';
    store('s2t-tab', lib ? 'lib' : 'conv');
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
    $('rows').innerHTML = list.map(t =>
      '<tr><td class="cn">' + esc(t.cn) + '</td><td>' + esc(t.tw || '—') + '</td><td><span class="kind ' + t.kind + '">' +
      esc(KIND_LABEL[t.kind]) + '</span></td><td>' + esc(t.cat) + '</td><td class="note">' + esc(t.note || '') + '</td></tr>').join('');
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

  /* ---------- 轉換器事件 ---------- */
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  input.addEventListener('input', () => { render(); store('s2t-draft', input.value.slice(0, 20000)); });
  $('clear').addEventListener('click', () => { input.value = ''; render(); store('s2t-draft', ''); input.focus(); });
  $('paste').addEventListener('click', () => { input.value = SAMPLE; if (mode === 'tw-cn') setMode('cn-twp'); else render(); });
  $('hl').addEventListener('change', e => output.classList.toggle('plain', !e.target.checked));
  $('swap').addEventListener('click', () => { input.value = output.textContent; setMode(mode === 'tw-cn' ? 'cn-twp' : 'tw-cn'); });
  $('copy').addEventListener('click', () => {
    const t = output.textContent, toast = $('toast');
    const done = () => { toast.textContent = '已複製'; setTimeout(() => toast.textContent = '', 1600); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(output); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast.textContent = '已選取，請按 Ctrl+C'; };
    try { navigator.clipboard.writeText(t).then(done, fallback); } catch (e) { fallback(); }
  });

  if (hasRepo) $('repoLine').innerHTML = ' 原始碼與詞彙：<a href="https://github.com/' + esc(CFG.repo) + '" target="_blank" rel="noopener">' + esc(CFG.repo) + '</a>';

  /* ---------- 啟動 ---------- */
  const saved = load('s2t-mode'); if (saved && MODES[saved]) mode = saved;
  input.value = load('s2t-draft') || SAMPLE;
  const status = $('status');
  if (!window.OpenCC) { status.textContent = '字典載入失敗，請檢查網路後重新整理'; status.classList.add('err'); }
  setMode(mode);
  showTab(load('s2t-tab') === 'lib');

  /* ---------- 載入詞彙庫 data/*.json ---------- */
  (async () => {
    try {
      const index = await (await fetch('data/index.json', { cache: 'no-cache' })).json();
      const loaded = await Promise.all(index.files.map(async file => {
        const d = await (await fetch('data/' + file, { cache: 'no-cache' })).json();
        return { file, category: d.category, terms: d.terms || [] };
      }));
      files = loaded.map(({ file, category }) => ({ file, category }));
      terms = loaded.flatMap(f => f.terms.filter(t => t && t.cn).map(t => ({
        cn: String(t.cn), tw: String(t.tw || ''), kind: KIND_LABEL[t.kind] ? t.kind : 'vocab',
        note: String(t.note || ''), oneway: t.oneway === true, cat: f.category, file: f.file
      })));
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
