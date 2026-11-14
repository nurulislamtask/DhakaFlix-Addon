// Local test: fake nginx-style directory server + addon handler (no internet needed).
import http from 'node:http';
const tree = {
  '/': ['Movies/', 'Series/'],
  '/Movies/': ['2010/', '2014/'],
  '/Movies/2010/': ['Inception (2010) 1080p BluRay/', 'Toy Story 3 (2010) 720p/'],
  '/Movies/2014/': ['Interstellar (2014) 1080p/'],
  '/Movies/2010/Inception (2010) 1080p BluRay/': ['Inception.2010.1080p.mkv'],
  '/Movies/2010/Toy Story 3 (2010) 720p/': ['Toy.Story.3.2010.720p.mp4'],
  '/Movies/2014/Interstellar (2014) 1080p/': ['Interstellar.2014.mkv'],
  '/Series/': ['Breaking Bad (2008) Season 1-2/'],
  '/Series/Breaking Bad (2008) Season 1-2/': ['Season 1/', 'Season 2/'],
  '/Series/Breaking Bad (2008) Season 1-2/Season 1/': ['Breaking.Bad.S01E01.mkv', 'Breaking.Bad.S01E02.mkv'],
  '/Series/Breaking Bad (2008) Season 1-2/Season 2/': ['Breaking.Bad.S02E01.mkv'],
};
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url);
  const e = tree[p];
  if (!e) { r.statusCode = 404; return r.end('nf'); }
  r.end('<html><body><h1>Index of ' + p + '</h1><pre><a href="../">../</a>\n' + e.map((x) => `<a href="${encodeURIComponent(x.replace(/\/$/, ''))}${x.endsWith('/') ? '/' : ''}">${x}</a>   01-Jan-2020 10:00   -`).join('\n') + '</pre></body></html>');
}).listen(0);
await new Promise((r) => srv.once('listening', r));
process.env.DFLIX_BASE = `http://127.0.0.1:${srv.address().port}`;
const { default: handler } = await import('../api/index.js');
const call = (url) => new Promise((resolve) => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ code: this.statusCode, body: b }); } };
  handler({ url, method: 'GET', headers: { host: 'addon.test', 'x-forwarded-proto': 'https' } }, res);
});
const j = async (u) => JSON.parse((await call(u)).body);
const cm = await j('/catalog/movie/dflix-movies.json');
console.log('movies:', cm.metas.map((m) => `${m.name} -> ${m.poster}`));
const cs = await j('/catalog/series/dflix-series.json');
console.log('series:', cs.metas.map((m) => `${m.name} -> ${m.poster}`));
const posters = new Set([...cm.metas, ...cs.metas].map((m) => m.poster));
console.log('unique posters:', posters.size, 'of', cm.metas.length + cs.metas.length);
if (posters.size !== cm.metas.length + cs.metas.length) throw new Error('duplicate posters!');
const s = await j('/catalog/movie/dflix-movies/search=toy.json'); console.log('search toy:', s.metas.map((m) => m.name));
const sm = await j(`/meta/series/${encodeURIComponent(cs.metas[0].id)}.json`); console.log('episodes:', sm.meta.videos.map((v) => `S${v.season}E${v.episode}`));
const st = await j(`/stream/series/${encodeURIComponent(sm.meta.videos[1].id)}.json`); console.log('stream:', st.streams);
const mm = await j(`/stream/movie/${encodeURIComponent(cm.metas[0].id)}.json`); console.log('movie stream:', mm.streams.map((x) => x.url));
console.log('manifest ok:', (await j('/manifest.json')).name);
console.log('svg ok:', (await call('/poster/Inception.svg')).body.startsWith('<svg'));
srv.close();
