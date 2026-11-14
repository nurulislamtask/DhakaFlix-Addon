import { CONFIG, buildIndex, fileUrl, lookup, makeId, parseEpisode, parseId, parseTitle, placeholderSvg, videosUnder, isVideo, listDir } from '../lib/dflix.js';

const MANIFEST = {
  id: 'community.dhakaflix.bdix',
  version: '2.0.0',
  name: 'DhakaFlix BDIX',
  description: 'Movies & series from the DhakaFlix open directory, with a real poster for every title.',
  logo: 'https://raw.githubusercontent.com/nurulislamtask/DhakaFlix-Addon/main/chrome-extension-legacy/public/logo512.png',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['dflix:'],
  catalogs: [
    { type: 'movie', id: 'dflix-movies', name: 'DhakaFlix Movies', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'series', id: 'dflix-series', name: 'DhakaFlix Series', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  ],
  behaviorHints: { configurable: false },
};

function send(res, code, body, type = 'application/json', cache = 'public, s-maxage=3600, stale-while-revalidate=86400') {
  res.statusCode = code;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', type + (type.startsWith('text') || type === 'application/json' ? '; charset=utf-8' : ''));
  res.setHeader('Cache-Control', cache);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function parseExtra(seg) {
  const o = {};
  if (!seg) return o;
  for (const kv of seg.split('&')) {
    const i = kv.indexOf('=');
    if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  return o;
}

const origin = (req) => `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

/** Poster rule: real art when found, otherwise a poster generated from THIS title (never a shared image). */
async function decorate(item, type, base) {
  const hit = await lookup(type, item.name, item.year);
  const fallback = `${base}/poster/${encodeURIComponent(item.name)}.svg`;
  return {
    id: makeId(item.path),
    type,
    name: hit?.name || item.name,
    poster: hit?.poster || fallback,
    background: hit?.background,
    releaseInfo: hit?.releaseInfo || item.year,
    imdbRating: hit?.imdbRating,
    genres: hit?.genres,
    description: hit?.description,
  };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function catalog(req, type, extraSeg) {
  const extra = parseExtra(extraSeg);
  let items = (await buildIndex()).filter((x) => x.type === type);
  if (extra.search) {
    const q = extra.search.toLowerCase();
    items = items.filter((x) => x.raw.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
  }
  const skip = parseInt(extra.skip || '0', 10) || 0;
  const page = items.slice(skip, skip + CONFIG.pageSize);
  const base = origin(req);
  return { metas: await pool(page, 10, (it) => decorate(it, type, base)) };
}

async function meta(req, type, id) {
  const path = parseId(id);
  if (!path) return { meta: null };
  const raw = path.split('/').pop();
  const { title, year } = parseTitle(raw);
  const hit = await lookup(type, title, year);
  const base = origin(req);
  const m = {
    id, type,
    name: hit?.name || title,
    poster: hit?.poster || `${base}/poster/${encodeURIComponent(title)}.svg`,
    background: hit?.background,
    logo: hit?.logo,
    description: hit?.description,
    releaseInfo: hit?.releaseInfo || year,
    imdbRating: hit?.imdbRating,
    genres: hit?.genres,
    runtime: hit?.runtime,
  };
  if (type === 'series') {
    const files = isVideo(raw) ? [{ name: raw, path }] : await videosUnder(path, 3);
    let n = 0;
    const vids = files.map((f) => {
      const ep = parseEpisode(f.name) || parseEpisode(f.path);
      n++;
      const seasonFromDir = (f.path.match(/(?:season|\bS)[ ._-]?(\d{1,2})\b/i) || [])[1];
      return { id: makeId(f.path), title: f.name.replace(/\.[^.]+$/, ''), season: ep?.season ?? (seasonFromDir ? +seasonFromDir : 1), episode: ep?.episode ?? n, released: new Date(2000, 0, 1).toISOString() };
    });
    // de-duplicate identical season/episode (keep first file)
    const seen = new Set();
    m.videos = vids.filter((v) => (seen.has(v.season + ':' + v.episode) ? false : seen.add(v.season + ':' + v.episode)));
  }
  return { meta: m };
}

async function stream(type, id) {
  const path = parseId(id);
  if (!path) return { streams: [] };
  const name = path.split('/').pop();
  let files;
  if (isVideo(name)) files = [{ name, path }];
  else files = await videosUnder(path, 2);
  return {
    streams: files.map((f) => ({
      name: 'DhakaFlix',
      title: f.name,
      url: fileUrl(f.path),
      behaviorHints: { notWebReady: !/\.(mp4|m4v|webm)$/i.test(f.name), filename: f.name },
    })),
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  try {
    const u = new URL(req.url, 'http://x');
    const p = (u.searchParams.get('p') ?? u.pathname).replace(/^\/+/, '').replace(/^api\/index\/?/, '');
    if (p === 'manifest.json') return send(res, 200, MANIFEST);
    const seg = p.split('/');
    const last = (s) => decodeURIComponent((s || '').replace(/\.(json|svg)$/, ''));
    if (seg[0] === 'poster') return send(res, 200, placeholderSvg(last(seg[1])), 'image/svg+xml', 'public, s-maxage=31536000, immutable');
    if (seg[0] === 'catalog') {
      const type = seg[1];
      const r = await catalog(req, type, seg[3] ? last(seg[3]) : '');
      return send(res, 200, r);
    }
    if (seg[0] === 'meta') return send(res, 200, await meta(req, seg[1], last(seg[2])));
    if (seg[0] === 'stream') return send(res, 200, await stream(seg[1], last(seg[2])), 'application/json', 'public, s-maxage=300');
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: String(e?.message || e), metas: [], streams: [] }, 'application/json', 'no-store');
  }
}
