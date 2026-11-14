// Directory-listing crawler + title/poster helpers for an open HTTP directory (DhakaFlix style).
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

export const CONFIG = {
  base: env('DFLIX_BASE', 'http://cdn.dflix.live').replace(/\/+$/, ''),
  roots: env('DFLIX_ROOTS', '/').split(',').map((s) => s.trim()).filter(Boolean),
  depth: parseInt(env('DFLIX_DEPTH', '3'), 10),
  maxItems: parseInt(env('DFLIX_MAX_ITEMS', '600'), 10),
  budgetMs: parseInt(env('DFLIX_BUDGET_MS', '40000'), 10),
  pageSize: 60,
};

const VIDEO = /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg)$/i;
export const isVideo = (n) => VIDEO.test(n);
const YEAR = /(?:^|[\s.(\[_-])((?:19|20)\d{2})(?:$|[\s.)\]_-])/;
const SERIES_HINT = /(\bS\d{1,2}\b|\bS\d{1,2}E\d{1,3}\b|season|series|complete|episodes?|\btv\b)/i;

const enc = (s) => Buffer.from(s, 'utf8').toString('base64url');
const dec = (s) => Buffer.from(s, 'base64url').toString('utf8');
export const makeId = (p) => 'dflix:' + enc(p);
export const parseId = (id) => (id && id.startsWith('dflix:') ? dec(id.slice(6)) : null);
export const fileUrl = (p) => CONFIG.base + p.split('/').map(encodeURIComponent).join('/');

async function http(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 DhakaFlix-Addon', Accept: 'text/html,application/json,*/*' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r;
  } finally {
    clearTimeout(t);
  }
}

const dirCache = new Map();
/** List one directory -> [{name, dir, path}] */
export async function listDir(path) {
  const p = path.endsWith('/') ? path : path + '/';
  if (dirCache.has(p)) return dirCache.get(p);
  const html = await (await http(CONFIG.base + p.split('/').map(encodeURIComponent).join('/'))).text();
  const out = [];
  const seen = new Set();
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1].split('#')[0].split('?')[0];
    if (!href || href.startsWith('..') || href === './' || href === '/' || href.startsWith('?') || /^(mailto|javascript):/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      if (!href.startsWith(CONFIG.base)) continue;
      href = href.slice(CONFIG.base.length);
    }
    let dec1 = href;
    try { dec1 = decodeURIComponent(href); } catch { /* keep raw */ }
    const dir = dec1.endsWith('/');
    const abs = dec1.startsWith('/') ? dec1 : p + dec1;
    const clean = abs.replace(/\/+$/, '');
    const name = clean.split('/').pop();
    if (!name || seen.has(clean)) continue;
    // ignore links that go up or sideways (sort links etc.)
    if (!(clean + '/').startsWith(p) || clean + '/' === p) continue;
    seen.add(clean);
    out.push({ name, dir, path: clean });
  }
  dirCache.set(p, out);
  return out;
}

export function parseTitle(raw) {
  let s = raw.replace(/\.(mkv|mp4|avi|mov|wmv|webm|m4v|ts)$/i, '');
  const ym = s.match(YEAR);
  const year = ym ? ym[1] : undefined;
  let t = ym ? s.slice(0, ym.index) : s;
  t = t
    .replace(/\b(2160p|1080p|720p|480p|4k|uhd|bluray|blu-ray|brrip|bdrip|web-?dl|webrip|hdrip|hdtv|dvdrip|x26[45]|h\.?26[45]|hevc|aac|dd5\.1|dual audio|hindi|bangla|bengali|english|dubbed|esub|s\d{1,2}(e\d{1,3})?|season\s*\d+.*)\b.*$/i, '')
    .replace(/[\[(].*$/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: t || raw, year };
}

export function guessType(path, name) {
  return SERIES_HINT.test(name) || /\/(series|tv[ -]?series|tv[ -]?shows?|web[ -]?series|anime)\b/i.test(path) ? 'series' : 'movie';
}

/** "Inception (2010) 1080p" is a title folder; "2010", "Movies", "Series" are just categories. */
function isTitleFolder(name) {
  const letters = name.replace(YEAR, ' ').replace(/[^A-Za-z\u0980-\u09FF]/g, '');
  if (letters.length < 3) return false;
  return YEAR.test(name) || /\bS\d{1,2}\b|season\s*\d/i.test(name);
}

/** Walk the roots and collect "title folders" / loose video files. */
let indexCache = null;
export async function buildIndex() {
  if (indexCache && Date.now() - indexCache.at < 10 * 60 * 1000) return indexCache.items;
  const started = Date.now();
  const items = new Map();
  let queue = CONFIG.roots.map((r) => ({ path: r, depth: CONFIG.depth }));
  const work = async (job) => {
    if (items.size >= CONFIG.maxItems || Date.now() - started > CONFIG.budgetMs) return [];
    let entries;
    try { entries = await listDir(job.path); } catch { return []; }
    const next = [];
    for (const e of entries) {
      if (e.dir) {
        const looksLikeTitle = isTitleFolder(e.name);
        if (looksLikeTitle || job.depth <= 0) addItem(items, e.path, e.name);
        else next.push({ path: e.path, depth: job.depth - 1 });
      } else if (isVideo(e.name)) addItem(items, e.path, e.name);
    }
    return next;
  };
  while (queue.length && items.size < CONFIG.maxItems && Date.now() - started < CONFIG.budgetMs) {
    const batch = queue.splice(0, 8);
    const res = await Promise.all(batch.map(work));
    queue.push(...res.flat());
  }
  const list = [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
  indexCache = { at: Date.now(), items: list };
  return list;
}
function addItem(map, path, rawName) {
  if (map.has(path)) return;
  const { title, year } = parseTitle(rawName);
  map.set(path, { path, name: title, year, raw: rawName, type: guessType(path, rawName) });
}

// ---- posters / metadata (Cinemeta, no API key) -------------------------------------------------
const metaCache = new Map();
export async function lookup(type, title, year) {
  const key = `${type}|${title.toLowerCase()}|${year || ''}`;
  if (metaCache.has(key)) return metaCache.get(key);
  const p = (async () => {
    try {
      const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(title)}.json`;
      const { metas = [] } = await (await http(url, 6000)).json();
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const exact = metas.filter((m) => norm(m.name) === norm(title));
      const pool = exact.length ? exact : [];
      const best = (year && pool.find((m) => String(m.releaseInfo || m.year || '').startsWith(year))) || pool[0];
      return best || null;
    } catch { return null; }
  })();
  metaCache.set(key, p);
  return p;
}

export function placeholderSvg(title) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const words = title.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 14 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 5);
  const y0 = 300 - (shown.length - 1) * 24;
  const text = shown.map((l, i) => `<text x="150" y="${y0 + i * 48}" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#fff">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,32%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},60%,14%)"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/>${text}<text x="150" y="425" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#ffffff99">DhakaFlix</text></svg>`;
}

export function parseEpisode(name) {
  let m = name.match(/S(\d{1,2})[ ._-]?E(\d{1,3})/i) || name.match(/(\d{1,2})x(\d{2,3})/i);
  if (m) return { season: +m[1], episode: +m[2] };
  m = name.match(/(?:^|[^a-z0-9])(?:E|EP|Episode)[ ._-]?(\d{1,3})(?![0-9a-z])/i);
  if (m) return { season: undefined, episode: +m[1] };
  return null;
}

/** All video files under a folder (depth-limited). */
export async function videosUnder(path, depth = 3) {
  const out = [];
  const walk = async (p, d) => {
    let entries;
    try { entries = await listDir(p); } catch { return; }
    const dirs = [];
    for (const e of entries) {
      if (!e.dir && isVideo(e.name)) out.push(e);
      else if (e.dir && d > 0) dirs.push(e);
    }
    await Promise.all(dirs.map((e) => walk(e.path, d - 1)));
  };
  await walk(path, depth);
  return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}
