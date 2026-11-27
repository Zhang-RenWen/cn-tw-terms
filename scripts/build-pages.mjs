// 從 data/ 產生 SEO 用的靜態頁：每個詞一頁（terms/<詞>.html）、總表（terms/index.html）、sitemap.xml。
// 用法：node scripts/build-pages.mjs（輸出不進 git，部署時由 GitHub Actions 產生）
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');

// 網址由 config.js 的 repo 推出：Owner/name → https://owner.github.io/name/
const repo = (read('config.js').match(/repo:\s*["']([^"']+)["']/) || [])[1] || '';
const [owner, name] = repo.split('/');
const SITE = `https://${owner.toLowerCase()}.github.io/${name}/`;
const GA = (read('index.html').match(/gtag\("config",\s*"(G-[A-Z0-9]+)"/) || [])[1];
// 深淺色切換：<head> 的 script 和右上角的按鈕都從 index.html 複製過來，只要改 index.html
const HOME_HTML = read('index.html');
const THEME_INIT = (HOME_HTML.match(/<script id="theme-init">[\s\S]*?<\/script>/) || [''])[0];
const THEME_BTN = (HOME_HTML.match(/<button class="theme-btn"[\s\S]*?<\/button>/) || [''])[0];
if (!THEME_INIT || !THEME_BTN) console.warn('提醒：index.html 找不到深淺色切換的 script 或按鈕，詞彙頁不會有切換按鈕');
// 詞彙庫的授權（見 data/LICENSE.md），放在頁尾與結構化資料
const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

const KIND = { vocab: '一般用語', loaded: '評價意涵', false: '同字異義' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const firstAlt = s => (s || '').split(/[、，,／/；]/)[0].replace(/[（(].*$/, '').trim();
const noMatch = tw => !tw || /^(無|—|-$)/.test(tw);
const slug = cn => encodeURIComponent(cn) + '.html';
const unesc = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const uniq = s => [...new Set(s.replace(/\s/g, ''))].sort().join('');

// 字型：標題字 Noto Serif TC 只用在 h1、h2，用 text= 只載入這頁標題用到的字（中文字型整套有上百個分割檔）；
// 字型 CSS 用 media="print" 先不擋畫面，載入後才套用
const FONT_SANS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap';
const serifUrl = text => 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;900&display=swap&text=' + encodeURIComponent(uniq(text));
const headings = html => [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)].map(m => unesc(m[1])).join('');
const fontLinks = serif => [serifUrl(serif), FONT_SANS].map(u => `    <link rel="stylesheet" href="${esc(u)}" media="print" onload="this.media='all'" />`).join('\n')
  + `\n    <noscript>${[serifUrl(serif), FONT_SANS].map(u => `<link rel="stylesheet" href="${esc(u)}" />`).join('')}</noscript>`;

const files = JSON.parse(read('data/index.json')).files;
const cats = files.map(f => {
  const d = JSON.parse(read('data/' + f));
  return { file: f, name: d.category, terms: d.terms };
});
const all = cats.flatMap(c => c.terms.map(t => ({ ...t, cat: c.name })));

const gaTag = GA ? `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag("js", new Date());
      gtag("config", "${GA}");
    </script>` : '';

const page = ({ title, desc, url, body, jsonld }) => `<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#1e2725" />
    ${THEME_INIT}
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="../favicon-32.png" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="../apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-title" content="簡繁轉換" />
    <meta name="application-name" content="簡繁轉換" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="兩岸用語對照・簡繁轉換器" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="zh_TW" />
    <meta property="og:image" content="${SITE}og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="兩岸用語對照・簡繁轉換器：簡體轉繁體，同時把中國用語轉成台灣用語" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>${gaTag}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${fontLinks(headings(body))}
    <link rel="stylesheet" href="../style.css" />
  </head>
  <body>
    <div class="wrap doc">
      ${THEME_BTN}
${body}
      <footer>
        <a href="../">簡繁轉換器</a>：簡體轉台灣正體，並套用兩岸用語詞彙庫。詞彙庫由社群維護，<a href="https://github.com/${repo}">歡迎在 GitHub 提議或修正</a>。詞彙內容採 <a href="${LICENSE_URL}deed.zh-hant" rel="license">CC BY-SA 4.0</a> 授權。
      </footer>
    </div>
  </body>
</html>
`;

// ---------- 每個詞一頁 ----------
function termPage(t) {
  const tw = t.tw || '', short = firstAlt(tw), none = noMatch(tw);
  const url = SITE + 'terms/' + slug(t.cn);
  const title = none
    ? `「${t.cn}」是什麼意思？台灣怎麼說｜兩岸用語對照`
    : t.kind === 'false'
      ? `「${t.cn}」兩岸意思不同，台灣說「${short}」｜兩岸用語對照`
      : `「${t.cn}」台灣怎麼說？→ ${short}｜兩岸用語對照`;
  const lead = none
    ? `「${t.cn}」是中國用語，台灣沒有固定對應的說法。`
    : t.kind === 'false'
      ? `「${t.cn}」兩岸都有這個詞，但意思或用法不同。台灣的對應說法是「${tw}」。`
      : t.kind === 'loaded'
        ? `「${t.cn}」是帶有評價意涵的中國用語，台灣較接近的說法是「${tw}」。`
        : `中國用語「${t.cn}」，台灣通常說「${tw}」。`;
  const desc = (lead + (t.note ? t.note.replace(/[；;，,。\s]+$/, '') + '。' : '') + '收錄於兩岸用語對照表，可直接用簡繁轉換器轉換。').slice(0, 150);
  const cat = cats.find(c => c.name === t.cat);
  const related = cat.terms.filter(x => x.cn !== t.cn).slice(0, 12);
  const body = `      <nav class="crumbs"><a href="../">簡繁轉換器</a> › <a href="./">兩岸用語對照表</a> › <a href="./#${esc(encodeURIComponent(t.cat))}">${esc(t.cat)}</a></nav>
      <article class="pane term">
        <h1>${esc(t.cn)}</h1>
        <p class="lead">${esc(lead)}</p>
        <dl>
          <dt>台灣說法</dt><dd>${esc(none ? '無固定對應' : tw)}</dd>
          <dt>類型</dt><dd><span class="kind ${t.kind}">${KIND[t.kind]}</span></dd>
          <dt>分類</dt><dd>${esc(t.cat)}</dd>
          ${t.note ? `<dt>說明</dt><dd>${esc(t.note)}</dd>` : ''}
        </dl>
        <p><a class="btn primary" href="../?q=${esc(encodeURIComponent(t.cn))}">用轉換器試試「${esc(t.cn)}」</a></p>
      </article>
      ${related.length ? `<section>
        <h2>同分類的其他用語</h2>
        <ul class="rel">${related.map(x => `<li><a href="${slug(x.cn)}">${esc(x.cn)}</a><span>${esc(noMatch(x.tw) ? '無固定對應' : firstAlt(x.tw))}</span></li>`).join('')}</ul>
      </section>` : ''}`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'DefinedTerm',
    name: t.cn, description: desc, url,
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: '兩岸用語對照表', url: SITE + 'terms/', license: LICENSE_URL }
  };
  return page({ title, desc, url, body, jsonld });
}

// ---------- 總表 ----------
function indexPage() {
  const url = SITE + 'terms/';
  const title = `兩岸用語對照表：中國用語 vs 台灣用語（${all.length} 詞）`;
  const desc = `整理 ${all.length} 個中國用語與台灣用語的差異，分成 ${cats.length} 類：一般用語、評價意涵、同字異義，附說明與簡繁轉換器。`;
  const body = `      <nav class="crumbs"><a href="../">簡繁轉換器</a> › 兩岸用語對照表</nav>
      <header><div>
        <h1>兩岸用語對照表</h1>
        <p class="sub">${esc(desc)}</p>
      </div></header>
${cats.map(c => `      <section class="pane cat" id="${esc(encodeURIComponent(c.name))}">
        <h2>${esc(c.name)} <span class="count">${c.terms.length}</span></h2>
        <ul class="rel">${c.terms.map(t => `<li><a href="${slug(t.cn)}">${esc(t.cn)}</a><span>${esc(noMatch(t.tw) ? '無固定對應' : firstAlt(t.tw))}</span></li>`).join('')}</ul>
      </section>`).join('\n')}`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: '兩岸用語對照表', description: desc, url,
    license: LICENSE_URL,
    hasDefinedTerm: all.map(t => ({ '@type': 'DefinedTerm', name: t.cn, url: SITE + 'terms/' + slug(t.cn) }))
  };
  return page({ title, desc, url, body, jsonld });
}

rmSync(join(ROOT, 'terms'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'terms'));
for (const t of all) writeFileSync(join(ROOT, 'terms', t.cn + '.html'), termPage(t));
writeFileSync(join(ROOT, 'terms', 'index.html'), indexPage());

const urls = [SITE, SITE + 'terms/', ...all.map(t => SITE + 'terms/' + slug(t.cn))];
writeFileSync(join(ROOT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>\n');

console.log(`產生 ${all.length} 個詞彙頁、1 個總表、sitemap.xml（${urls.length} 個網址），網址前綴 ${SITE}`);

// 首頁標題字型的 text= 是手寫的：.brand 與 h2 用到的字少了就提醒
const home = read('index.html');
const homeNeed = uniq(unesc((home.match(/<p class="brand">([\s\S]*?)<\/p>/) || [, ''])[1]) + headings(home.replace(/<h1[\s\S]*?<\/h1>/g, '')));
const homeHave = decodeURIComponent((home.match(/Noto\+Serif\+TC[^"]*?text=([^"&]+)/) || [, ''])[1]);
const missing = [...homeNeed].filter(c => !homeHave.includes(c)).join('');
if (missing) console.warn(`提醒：index.html 標題字型的 text= 少了「${missing}」，請補上，不然這些字會用備用字型`);
