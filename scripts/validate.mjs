// 檢查 data/ 裡的詞彙檔：格式、必填欄位、類型、重複詞。
// 用法：node scripts/validate.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const KINDS = new Set(['vocab', 'loaded', 'false']);
const FIELDS = new Set(['cn', 'tw', 'kind', 'note']);
const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);

function readJson(file) {
  try { return JSON.parse(readFileSync(join(DATA, file), 'utf8')); }
  catch (e) { err(file, `不是合法的 JSON（${e.message}）`); return null; }
}

const index = readJson('index.json');
const listed = new Set(index?.files || []);
if (index && !Array.isArray(index.files)) err('index.json', '需要有 "files" 陣列');

const onDisk = readdirSync(DATA).filter(f => f.endsWith('.json') && f !== 'index.json');
for (const f of onDisk) if (!listed.has(f)) err('index.json', `沒有列出 ${f}`);
for (const f of listed) if (!onDisk.includes(f)) err('index.json', `列出的 ${f} 不存在`);

const seen = new Map();
const categories = new Set();
let total = 0;

for (const file of listed) {
  if (!onDisk.includes(file)) continue;
  const d = readJson(file);
  if (!d) continue;
  if (typeof d.category !== 'string' || !d.category.trim()) err(file, '缺少 "category"');
  else if (categories.has(d.category)) err(file, `分類「${d.category}」和其他檔案重複`);
  else categories.add(d.category);
  if (!Array.isArray(d.terms)) { err(file, '缺少 "terms" 陣列'); continue; }

  d.terms.forEach((t, i) => {
    const at = `第 ${i + 1} 筆${t && t.cn ? `「${t.cn}」` : ''}`;
    if (!t || typeof t !== 'object') return err(file, `${at} 不是物件`);
    for (const k of Object.keys(t)) if (!FIELDS.has(k)) err(file, `${at} 有未知欄位 "${k}"`);
    if (typeof t.cn !== 'string' || !t.cn.trim()) err(file, `${at} 缺少 "cn"`);
    else if (t.cn !== t.cn.trim()) err(file, `${at} 的 "cn" 前後有空白`);
    if (!KINDS.has(t.kind)) err(file, `${at} 的 "kind" 必須是 vocab、loaded 或 false`);
    if (t.tw != null && typeof t.tw !== 'string') err(file, `${at} 的 "tw" 必須是文字`);
    if (t.note != null && typeof t.note !== 'string') err(file, `${at} 的 "note" 必須是文字`);
    if (t.kind === 'vocab' && !(t.tw || '').trim()) err(file, `${at} 是一般用語，必須填 "tw"`);
    if (typeof t.cn === 'string') {
      if (seen.has(t.cn)) err(file, `${at} 和 ${seen.get(t.cn)} 重複`);
      else seen.set(t.cn, file);
    }
    total++;
  });
}

if (errors.length) {
  console.error(`發現 ${errors.length} 個問題：\n` + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`通過：${listed.size} 個分類、${total} 個詞。`);
