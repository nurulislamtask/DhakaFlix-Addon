// Build lib/catalog-index.json from the live DhakaFlix directory.
// Run this on a PC that can reach DhakaFlix (BDIX), then commit the file:
//   node scripts/build-index.mjs
// Env overrides: DFLIX_BASE (default http://cdn.dflix.live — or http://172.16.50.7),
// DFLIX_MAX_ITEMS (default 5000), DFLIX_BUDGET_MS (default 600000).
if (!process.env.DFLIX_MAX_ITEMS) process.env.DFLIX_MAX_ITEMS = '5000';
if (!process.env.DFLIX_BUDGET_MS) process.env.DFLIX_BUDGET_MS = '600000';
const { buildStaticIndex, CONFIG } = await import('../lib/dflix.js');
const { writeFile } = await import('node:fs/promises');

console.log('Crawling', CONFIG.base, '...');
const data = await buildStaticIndex();
const movies = data.items.filter((i) => i.type === 'movie').length;
const series = data.items.length - movies;
const files = data.items.reduce((n, i) => n + (i.files?.length || 0), 0);
await writeFile(new URL('../lib/catalog-index.json', import.meta.url), JSON.stringify(data, null, 1));
console.log(`Done: ${data.items.length} titles (${movies} movies, ${series} series), ${files} files -> lib/catalog-index.json`);
console.log('Next: commit + push this file (push-index.bat), Vercel redeploys and everyone sees the catalog.');
