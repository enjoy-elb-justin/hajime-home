import fs from 'fs';
import path from 'path';

const publicDir = path.resolve('public');
const publicAssetsDir = path.join(publicDir, 'assets');
const publicFontsDir = path.join(publicDir, 'fonts');
const srcDir = path.resolve('src');
const srcStylesDir = path.resolve('src/styles');

fs.mkdirSync(publicAssetsDir, { recursive: true });
fs.mkdirSync(publicFontsDir, { recursive: true });
fs.mkdirSync(srcStylesDir, { recursive: true });

// Modern UA to get woff2 from Google Fonts
const MODERN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function downloadFile(url, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
    return true;
  }
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    console.log(`Downloading: ${url} -> ${destPath}`);
    const res = await fetch(url, {
      headers: { 'User-Agent': MODERN_UA }
    });
    if (!res.ok) {
      console.warn(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch (err) {
    console.error(`Error downloading ${url}:`, err.message);
    return false;
  }
}

// 1. Download and localize external web fonts (Google Fonts & Studio Fonts)
async function localizeFonts() {
  console.log('--- Localizing Fonts ---');
  let combinedFontsCss = '';

  const fontUrls = [
    {
      name: 'Open Sans',
      url: 'https://fonts.googleapis.com/css?display=swap&family=Open+Sans:300,400,600,700'
    },
    {
      name: 'Inter',
      url: 'https://fonts.googleapis.com/css?display=swap&family=Inter:400,500,600,700'
    },
    {
      name: 'Koburina W3',
      url: 'https://fonts.studio.design/ts/ot-koburinagostdn-w3/fonts.css'
    },
    {
      name: 'Koburina W6',
      url: 'https://fonts.studio.design/ts/ot-koburinagostdn-w6/fonts.css'
    }
  ];

  for (const font of fontUrls) {
    console.log(`Fetching font CSS for ${font.name} from ${font.url}...`);
    try {
      const res = await fetch(font.url, { headers: { 'User-Agent': MODERN_UA } });
      if (!res.ok) {
        console.warn(`Could not load font CSS: ${font.url}`);
        continue;
      }
      let css = await res.text();

      // Find all url(...) in font CSS
      const urlMatches = [...css.matchAll(/url\((['"]?)([^'"\)]+)\1\)/g)];
      for (const match of urlMatches) {
        const fontRef = match[2];
        if (fontRef.startsWith('/fonts/')) continue;
        let remoteFontUrl;
        if (fontRef.startsWith('http://') || fontRef.startsWith('https://')) {
          remoteFontUrl = fontRef;
        } else {
          remoteFontUrl = new URL(fontRef, font.url).toString();
        }

        const parsed = new URL(remoteFontUrl);
        const ext = path.extname(parsed.pathname) || '.woff2';
        const base = path.basename(parsed.pathname, ext);
        const localFileName = `${parsed.hostname.replace(/[^a-zA-Z0-9]/g, '_')}_${base}${ext}`;
        const localFilePath = path.join(publicFontsDir, localFileName);
        const localWebPath = `/fonts/${localFileName}`;

        await downloadFile(remoteFontUrl, localFilePath);
        css = css.replaceAll(fontRef, localWebPath);
      }

      combinedFontsCss += `/* --- ${font.name} --- */\n` + css + '\n\n';
    } catch (e) {
      console.error(`Error processing font ${font.name}:`, e.message);
    }
  }

  fs.writeFileSync(path.join(srcStylesDir, 'fonts.css'), combinedFontsCss, 'utf-8');
  console.log('Generated src/styles/fonts.css with all self-hosted fonts.');
}

// 2. Localize fonts in studio-base.css
async function localizeStudioBaseCss() {
  console.log('--- Localizing Fonts in studio-base.css ---');
  const baseCssPath = path.join(srcStylesDir, 'studio-base.css');
  if (!fs.existsSync(baseCssPath)) return;

  let baseCss = fs.readFileSync(baseCssPath, 'utf-8');
  const urlMatches = [...baseCss.matchAll(/url\((['"]?)(https?:\/\/[^'"\)]+)\1\)/g)];

  for (const match of urlMatches) {
    const remoteUrl = match[2];
    try {
      const parsed = new URL(remoteUrl);
      const ext = path.extname(parsed.pathname) || '';
      const base = path.basename(parsed.pathname, ext);
      const localFileName = `${parsed.hostname.replace(/[^a-zA-Z0-9]/g, '_')}_${base}${ext}`;
      const localFilePath = path.join(publicFontsDir, localFileName);
      const localWebPath = `/fonts/${localFileName}`;

      await downloadFile(remoteUrl, localFilePath);
      baseCss = baseCss.replaceAll(remoteUrl, localWebPath);
    } catch (e) {
      console.error(`Error processing ${remoteUrl}:`, e.message);
    }
  }

  fs.writeFileSync(baseCssPath, baseCss, 'utf-8');
  console.log('Updated src/styles/studio-base.css with localized fonts.');
}

// 3. Scan all files for remote asset URLs (images, og-images, icons)
async function localizeAllAssets() {
  console.log('--- Localizing All Images and Media Assets ---');
  
  // Collect all files to scan
  const filesToScan = [];
  function walkDir(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (f !== 'node_modules' && f !== '.git' && f !== 'dist' && f !== 'legacy' && f !== 'scripts') {
          walkDir(full);
        }
      } else if (/\.(astro|html|css|js|mjs|json)$/.test(f)) {
        filesToScan.push(full);
      }
    }
  }
  walkDir(path.resolve('.'));

  // Also include scripts/migrate.mjs
  const uniqueUrls = new Set();
  const urlRegex = /https?:\/\/(?:storage\.googleapis\.com|storage\.stock\.studio\.design|images\.unsplash\.com)[^\s"'\)\`]+/g;

  for (const file of filesToScan) {
    const content = fs.readFileSync(file, 'utf-8');
    const matches = content.match(urlRegex);
    if (matches) {
      for (const m of matches) {
        const clean = m.replace(/[\)\]\'\"\`\\]+$/, '');
        uniqueUrls.add(clean);
      }
    }
  }

  console.log(`Found ${uniqueUrls.size} unique remote storage URLs.`);

  const urlMap = new Map();

  for (const remoteUrl of uniqueUrls) {
    try {
      const parsed = new URL(remoteUrl);
      const relPath = path.join('assets', parsed.hostname, parsed.pathname.replace(/^\//, ''));
      const destPath = path.join(publicDir, relPath);
      const webPath = '/' + relPath.split(path.sep).join('/');

      await downloadFile(remoteUrl, destPath);
      urlMap.set(remoteUrl, webPath);
    } catch (e) {
      console.error(`Failed to localize ${remoteUrl}:`, e.message);
    }
  }

  // Also check legacy favicon & og:image
  const faviconRemote = 'https://storage.googleapis.com/production-os-assets/assets/83e6b6fd-d753-43c0-a7fd-87d82910d263';
  const ogRemote = 'https://storage.googleapis.com/production-os-assets/assets/668d48e0-14a7-4194-ad1c-2a10b28450cb';
  
  for (const item of [faviconRemote, ogRemote]) {
    if (!urlMap.has(item)) {
      try {
        const parsed = new URL(item);
        const relPath = path.join('assets', parsed.hostname, parsed.pathname.replace(/^\//, ''));
        const destPath = path.join(publicDir, relPath);
        await downloadFile(item, destPath);
        urlMap.set(item, '/' + relPath.split(path.sep).join('/'));
      } catch (e) {}
    }
  }

  console.log(`Rewriting ${urlMap.size} URLs across project files...`);

  // Replace in files
  for (const file of filesToScan) {
    let content = fs.readFileSync(file, 'utf-8');
    let changed = false;

    for (const [remoteUrl, localWebPath] of urlMap.entries()) {
      if (content.includes(remoteUrl)) {
        content = content.replaceAll(remoteUrl, localWebPath);
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(file, content, 'utf-8');
      console.log(`Updated assets in: ${path.relative(process.cwd(), file)}`);
    }
  }
}

// 4. Update Layout.astro to use local fonts.css instead of CDN links
function updateLayout() {
  console.log('--- Updating Layout.astro head links ---');
  const layoutPath = path.join(srcDir, 'layouts/Layout.astro');
  let content = fs.readFileSync(layoutPath, 'utf-8');

  // Import fonts.css in frontmatter if not present
  if (!content.includes("import '../styles/fonts.css';")) {
    content = content.replace("import '../styles/studio-base.css';", "import '../styles/fonts.css';\nimport '../styles/studio-base.css';");
  }

  // Remove remote Google Fonts and Studio Design link tags
  content = content.replace(/<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin\s*\/>\s*/gi, '');
  content = content.replace(/<link\s+href="https:\/\/fonts\.googleapis\.com\/[^"]*"\s+rel="stylesheet"\s*\/>\s*/gi, '');
  content = content.replace(/<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.studio\.design\/[^"]*"\s*\/>\s*/gi, '');

  fs.writeFileSync(layoutPath, content, 'utf-8');
  console.log('Updated Layout.astro.');
}

async function main() {
  await localizeFonts();
  await localizeStudioBaseCss();
  await localizeAllAssets();
  updateLayout();
  console.log('Asset localization completed successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
