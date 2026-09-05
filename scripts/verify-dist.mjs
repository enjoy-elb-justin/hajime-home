import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (item.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

const htmlFiles = walk(distDir);
console.log(`Found ${htmlFiles.length} HTML files in dist/`);

let missingAssets = [];
let externalResources = new Set();

const assetRegex = /(?:src|href|url)\s*=\s*["']([^"']+)["']|url\((?:["']?)([^"')]+)(?:["']?)\)/gi;

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = assetRegex.exec(content)) !== null) {
    const rawUrl = (match[1] || match[2] || '').trim();
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('#') || rawUrl.startsWith('tel:') || rawUrl.startsWith('mailto:')) {
      continue;
    }

    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      externalResources.add(rawUrl);
    } else if (rawUrl.startsWith('/')) {
      // Check if it's an asset or a route
      const cleanPath = rawUrl.split('?')[0].split('#')[0];
      // If it looks like a file asset (has extension)
      const ext = path.extname(cleanPath);
      if (ext) {
        const localFilePath = path.join(distDir, cleanPath);
        if (!fs.existsSync(localFilePath)) {
          missingAssets.push({ file: path.relative(distDir, file), asset: cleanPath });
        }
      }
    }
  }
}

console.log(`\n--- Verification Results ---`);
console.log(`Missing local assets: ${missingAssets.length}`);
if (missingAssets.length > 0) {
  console.log(missingAssets);
}

console.log(`\nExternal resources found: ${externalResources.size}`);
for (const ext of externalResources) {
  console.log(` - ${ext}`);
}
