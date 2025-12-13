// Post-build script to fix paths for extension
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const distPath = join(process.cwd(), 'dist');
const indexPath = join(distPath, 'index.html');

try {
  let html = readFileSync(indexPath, 'utf8');
  
  // Replace absolute paths with relative paths
  html = html.replace(/src="\/assets\//g, 'src="./assets/');
  html = html.replace(/href="\/assets\//g, 'href="./assets/');
  html = html.replace(/href="\/favicon\.ico"/g, 'href="./favicon.ico"');
  html = html.replace(/href="\/logo192\.png"/g, 'href="./logo192.png"');
  html = html.replace(/href="\/manifest\.json"/g, 'href="./manifest.json"');
  
  writeFileSync(indexPath, html, 'utf8');
  console.log('✓ Fixed extension paths in index.html');
} catch (error) {
  console.error('Error fixing paths:', error.message);
  process.exit(1);
}

