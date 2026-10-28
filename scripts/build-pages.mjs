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

const KIND = { vocab: '一般用語', loaded: '評價意涵', false: '同字異義' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const firstAlt = s => (s || '').split(/[、，,／/；]/)[0].replace(/[（(].*$/, '').trim();
const noMatch = tw => !tw || /^(無|—|-$)/.test(tw);
const slug = cn => encodeURIComponent(cn) + '.html';

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
    <script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>${gaTag}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;900&family=Noto+Sans+TC:wght@400;500;700&display=swap" />
    <link rel="stylesheet" href="../style.css" />
  </head>
  <body>
    <div class="wrap doc">
${body}
      <footer>
        <a href="../">簡繁轉換器</a>：簡體轉臺灣正體，並套用兩岸用語詞彙庫。詞彙庫由社群維護，<a href="https://github.com/${repo}">歡迎在 GitHub 提議或修正</a>。
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
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: '兩岸用語對照表', url: SITE + 'terms/' }
  };
  return page({ title, desc, url, body, jsonld });
}

// ---------- 總表 ----------
function indexPage() {
  const url = SITE + 'terms/';
  const title = `兩岸用語對照表：中國用語 vs 台灣用語（${all.length} 詞）`;
  const desc = `整理 ${all.length} 個中國與台灣的用語差異，分成 ${cats.length} 類：一般用語、評價意涵、同字異義，附說明與簡繁轉換器。`;
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
