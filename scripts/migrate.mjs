import fs from 'fs';
import path from 'path';

const legacyDir = path.resolve('legacy');
const srcPagesDir = path.resolve('src/pages');
const srcStylesDir = path.resolve('src/styles');

fs.mkdirSync(srcStylesDir, { recursive: true });

// 1. Extract base styles from legacy/index.html
const indexHtml = fs.readFileSync(path.join(legacyDir, 'index.html'), 'utf-8');

const routesCssMatch = indexHtml.match(/<style\s+data-inlined-from="[^"]*routes\.[^"]*">([\s\S]*?)<\/style>/i);
const faMatch = indexHtml.match(/<style\s+id="fontawesome-styles">([\s\S]*?)<\/style>/i);

let baseCss = '';
if (faMatch) {
  baseCss += faMatch[1] + '\n';
}
if (routesCssMatch) {
  baseCss += routesCssMatch[1] + '\n';
}

fs.writeFileSync(path.join(srcStylesDir, 'studio-base.css'), baseCss, 'utf-8');
console.log('Created src/styles/studio-base.css');

// Balanced div extractor for <div class="container">
function extractContainer(html) {
  const marker = '<div class="container">';
  const startIndex = html.indexOf(marker);
  if (startIndex === -1) {
    const regex = /<div\s+class="container(?:\s+[^"]*)?">/i;
    const match = regex.exec(html);
    if (!match) return null;
    return extractFromIndex(html, match.index);
  }
  return extractFromIndex(html, startIndex);
}

function extractFromIndex(html, startIndex) {
  let depth = 0;
  let pos = startIndex;
  
  const openTagEnd = html.indexOf('>', startIndex);
  depth = 1;
  pos = openTagEnd + 1;

  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = html.indexOf('>', nextOpen) + 1;
    } else {
      depth--;
      if (depth === 0) {
        return html.substring(startIndex, nextClose + 6);
      }
      pos = nextClose + 6;
    }
  }
  return null;
}

// URL normalizer
function normalizeHref(href, baseDir) {
  if (!href) return href;
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('studio-action:') || href.startsWith('#') || href.startsWith('javascript:')) {
    return href;
  }

  try {
    const resolved = new URL(href, 'https://hajime-jp.co.jp' + baseDir);
    let pathname = resolved.pathname;
    
    // Normalize /index.html
    pathname = pathname.replace(/\/index\.html$/, '');
    if (!pathname) pathname = '/';
    
    // Normalize /xxx/index.html
    pathname = pathname.replace(/\/index\.html$/, '');
    
    return pathname + resolved.hash;
  } catch (e) {
    return href;
  }
}

// Process page list from render-report.json
const report = JSON.parse(fs.readFileSync(path.join(legacyDir, 'render-report.json'), 'utf-8'));

for (const p of report.pages) {
  const srcFile = path.join(legacyDir, p.file);
  if (!fs.existsSync(srcFile)) {
    console.warn(`File not found: ${srcFile}`);
    continue;
  }

  const html = fs.readFileSync(srcFile, 'utf-8');

  // Title
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/&nbsp;/g, ' ').trim() : 'HAJIMEコンサルティング株式会社｜外国人経営者向けコンサルティング';

  // Description
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ||
                    html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i);
  const description = descMatch ? descMatch[1].replace(/&nbsp;/g, ' ').trim() : '';

  // og:image
  const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i);
  const ogImage = ogMatch ? ogMatch[1].trim() : '/assets/storage.googleapis.com/production-os-assets/assets/668d48e0-14a7-4194-ad1c-2a10b28450cb';

  // Extract container
  let container = extractContainer(html);
  if (!container) {
    console.error(`Could not extract container for ${p.path}`);
    continue;
  }

  // Base directory for link resolution
  let baseDir = p.path;
  if (!baseDir.endsWith('/')) baseDir += '/';

  // Normalize links
  container = container.replace(/href=(["'])(.*?)\1/gi, (match, quote, href) => {
    const normalized = normalizeHref(href, baseDir);
    return `href="${normalized}"`;
  });

  // Remove Nuxt comments
  container = container.replace(/<!--\[-->|<!--\]-->|<!---->/g, '');

  // Remove Vue click-outside attributes
  container = container.replace(/\s*click-outside="[^"]*"/g, '');

  // Convert <style> to <style is:global>
  container = container.replace(/<style(?:\s+[^>]*)?>/gi, '<style is:global>');

  // Replace remote asset URLs with local paths
  container = container.replace(/https:\/\/(?:storage\.googleapis\.com|storage\.stock\.studio\.design|images\.unsplash\.com)[^\s"'\)\`]+/g, (match) => {
    try {
      const parsed = new URL(match);
      return `/assets/${parsed.hostname}${parsed.pathname}`;
    } catch (e) {
      return match;
    }
  });

  // If this is contact page, add action="/contact/thanks" method="GET"
  if (p.path === '/contact') {
    container = container.replace(/<form\s+name="お問い合わせ"/i, '<form name="お問い合わせ" action="/contact/thanks" method="GET"');
  }

  // Determine Astro file path
  let relDest;
  if (p.path === '/') {
    relDest = 'index.astro';
  } else {
    const parts = p.path.slice(1).split('/');
    if (parts.length === 1) {
      relDest = `${parts[0]}/index.astro`;
    } else {
      relDest = `${parts.slice(0, -1).join('/')}/${parts[parts.length - 1]}.astro`;
    }
  }

  const fullDest = path.join(srcPagesDir, relDest);
  fs.mkdirSync(path.dirname(fullDest), { recursive: true });

  // Calculate layout relative import
  const depth = relDest.split('/').length;
  const layoutRelPath = depth === 1 ? '../layouts/Layout.astro' : '../'.repeat(depth) + 'layouts/Layout.astro';

  const astroContent = `---
import Layout from '${layoutRelPath}';

const title = ${JSON.stringify(title)};
const description = ${JSON.stringify(description)};
const ogImage = ${JSON.stringify(ogImage)};
---

<Layout title={title} description={description} ogImage={ogImage}>
${container}
</Layout>
`;

  fs.writeFileSync(fullDest, astroContent, 'utf-8');
  console.log(`Generated: ${relDest}`);
}

// 2. Generate 404.astro
const indexContainer = extractContainer(indexHtml);
let headerHtml = '';
let footerHtml = '';
let indexStyles = '';

const styleMatches = indexContainer.match(/<style[\s\S]*?<\/style>/gi) || [];
indexStyles = styleMatches.join('\n').replace(/<style(?:\s+[^>]*)?>/gi, '<style is:global>');

const headerMatch = indexContainer.match(/<header[\s\S]*?<\/header>/i);
if (headerMatch) headerHtml = headerMatch[0];

const footerMatch = indexContainer.match(/<footer[\s\S]*?<\/footer>/i);
if (footerMatch) footerHtml = footerMatch[0];

headerHtml = headerHtml.replace(/href=(["'])(.*?)\1/gi, (m, q, href) => `href="${normalizeHref(href, '/')}"`);
footerHtml = footerHtml.replace(/href=(["'])(.*?)\1/gi, (m, q, href) => `href="${normalizeHref(href, '/')}"`);

const assetUrlReplacer = (str) => str.replace(/https:\/\/(?:storage\.googleapis\.com|storage\.stock\.studio\.design|images\.unsplash\.com)[^\s"'\)\`]+/g, (match) => {
  try {
    const parsed = new URL(match);
    return `/assets/${parsed.hostname}${parsed.pathname}`;
  } catch (e) {
    return match;
  }
});
headerHtml = assetUrlReplacer(headerHtml);
footerHtml = assetUrlReplacer(footerHtml);
indexStyles = assetUrlReplacer(indexStyles);

const page404Content = `---
import Layout from '../layouts/Layout.astro';

const title = "ページが見つかりません (404) ｜ HAJIMEコンサルティング株式会社";
const description = "お探しのページは見当たりませんでした。";
---

<Layout title={title} description={description}>
  <div class="container">
    ${indexStyles}
    <style is:global>
      .error-404-section {
        min-height: 60vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 160px 24px 100px;
        font-family: var(--s-font-3c90ade0);
      }
      .error-404-badge {
        font-size: 28px;
        font-weight: 700;
        color: var(--s-color-90ba6ad1);
        letter-spacing: 0.05em;
        margin-bottom: 16px;
        border-bottom: 2px solid var(--s-color-90ba6ad1);
        padding-bottom: 4px;
        display: inline-block;
      }
      .error-404-title {
        font-size: 32px;
        font-weight: 300;
        color: var(--s-color-9a938a70);
        margin: 0 0 24px 0;
        line-height: 1.4;
      }
      .error-404-desc {
        font-size: 16px;
        font-weight: 300;
        color: var(--s-color-2a9c7810);
        line-height: 1.8;
        max-width: 600px;
        margin: 0 0 40px 0;
      }
      .error-404-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--s-color-90ba6ad1);
        color: #ffffff !important;
        font-size: 16px;
        font-weight: 600;
        padding: 16px 36px;
        border-radius: 9999px;
        text-decoration: none;
        transition: opacity 0.3s ease;
      }
      .error-404-btn:hover {
        opacity: 0.85;
      }
      @media screen and (max-width: 540px) {
        .error-404-section {
          padding: 120px 20px 60px;
        }
        .error-404-title {
          font-size: 24px;
        }
        .error-404-desc {
          font-size: 14px;
        }
      }
    </style>
    <div class="render-canvas">
      <div class="modals"></div>
      <div class="StudioCanvas" aria-hidden="false">
        <div class="sd appear" style="width: 100%;">
          ${headerHtml}
          <main class="sd appear">
            <section class="error-404-section">
              <div class="error-404-badge">404</div>
              <h1 class="error-404-title">お探しのページは見当たりませんでした。</h1>
              <p class="error-404-desc">
                申し訳ございませんが、お探しのページは見つかりませんでした。<br>
                こちらのページは削除・移動されたか、もしくはURLが異なる可能性がございます。<br>
                トップページへお戻りいただき、改めてご希望のページをお探しください。
              </p>
              <a href="/" class="error-404-btn">トップページへ戻る →</a>
            </section>
          </main>
          ${footerHtml}
        </div>
      </div>
    </div>
  </div>
</Layout>
`;

fs.writeFileSync(path.join(srcPagesDir, '404.astro'), page404Content, 'utf-8');
console.log('Generated: 404.astro');

console.log('Migration completed successfully!');
