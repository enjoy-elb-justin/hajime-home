---
name: astro-cloudflare
description: >-
  Use this skill when developing, building, optimizing, or deploying an Astro project
  on Cloudflare Workers (using Workers Static Assets) or Cloudflare Pages, particularly
  when using pnpm and handling legacy website migrations.
---

# Astro + Cloudflare 最佳实践与维护技巧

本技能总结了在本项目（`hajime-home`）中使用 Astro 与 Cloudflare 进行高性能建站与平滑迁移的关键技巧与规范。

## 1. 为什么选择 Astro + Cloudflare Worker (Static Assets)

- **极致性能（TTFB < 50ms）**：全站静态预渲染输出至 `dist/`，通过 Cloudflare 遍布全球的数据中心边缘静态分发，免除了冷启动延迟。
- **Workers 统一配置**：Cloudflare 推出了现代化的 Workers Static Assets（通过 `wrangler.jsonc` 配置 `"assets": { "directory": "./dist" }`），既具备 Pages 的静态资产托管速度，又随时可在需要时引入 Worker Edge API。
- **成本效益**：静态资源请求消耗极少，在 Cloudflare 免费/标准层级下即可支撑极高并发。

## 2. 核心配置参考

### `astro.config.mjs`
```javascript
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hajime-jp.co.jp',
  output: 'static',
  build: {
    format: 'directory' // 生成 /page/index.html 形式，SEO 与 clean URLs 友好
  }
});
```

### `wrangler.jsonc`
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "hajime-home",
  "compatibility_date": "2026-09-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
    "html_handling": "auto-trailing-slash"
  },
  "build": {
    "command": "pnpm run build"
  }
}
```

## 3. 从 Studio Design / Playwright 归档迁移的最佳实践

1. **提取公共布局与原子组件**：
   - 提取全局 Header、Footer、抽屉菜单（Hamburger Modal）。
   - 将公共的 `:root` CSS 变量（色彩 `--s-color-*` 与字体 `--s-font-*`）统一放置在基础样式中，便于全局维护。
2. **外链资源彻底本地化与字体自托管（100% Self-hosted Assets）**：
   - 为避免第三方 CDN 或外部存储（Google Cloud Storage, Studio Stock, Unsplash, Google Fonts, Typesquare）因地域网络、跨域拦截或外链失效产生破损，所有媒体资源（图片、SVG、WebP）统一下载至 `public/assets/`。
   - 日文字体（如こぶりなゴシック、Open Sans、Inter、FontAwesome、Material Icons）完整解析 Unicode range 分卷，将 256 个 `.woff2` 字体包全部下载至 `public/fonts/`，在 `src/styles/fonts.css` 中本地加载。
   - 彻底摆脱外部第三方 CDN 依赖，除了交互式地图 iframe（Google Maps）外，全站 0 外部资源引用，隐私与合规性最强，首屏加载速度极快。
3. **动态内容（News / Voice）数据驱动**：
   - 将文章内容（标题、发布时间、正文、分类）抽离到 `src/data/`。
   - 借助 Astro 的 `getStaticPaths()` 自动生成所有详情页与列表页，实现增删文章仅需改动 JSON 或 Markdown。
4. **验证与完整性自检机制**：
   - 提供 `scripts/verify-dist.mjs`，构建后自动扫描 `dist/` 下全部 HTML，检测是否有失效的本地资源引用或漏处理的外部资源。
5. **包管理约束**：
   - 全程使用 `pnpm` 安装与运行任务。

---

## 4. Cloudflare Dashboard (GitHub Connect) 推荐配置

本项目采用 Cloudflare 现代化的 **Workers Static Assets** 架构部署，也可以直接通过 **Pages** 托管。

### 方式 A：Cloudflare Workers (Builds / Connected to Git) - 推荐
在 Cloudflare 控制台导航至 **Compute (Workers & Pages)** -> **Create application** -> **Workers** -> **Connect to Git**：
1. **Repository**: 选择本项目的 GitHub 仓库。
2. **Build Settings**:
   - **Framework preset**: `None` 或 `Astro`
   - **Build command**: `pnpm run build`
   - **Deploy command**: `npx wrangler deploy`
3. **Environment Variables**:
   - `NODE_VERSION`: `22`（项目已内置 `.nvmrc`，自动读取）
4. **Wrangler 配置文件**:
   - 自动检测并读取根目录下的 `wrangler.jsonc`，识别静态产物路径 `assets.directory: "./dist"`。

### 方式 B：Cloudflare Pages (Git Integration)
如果选择通过 Pages 界面连接：
1. **Framework preset**: `Astro`
2. **Build command**: `pnpm run build`
3. **Build output directory**: `dist`
4. **Environment Variables**:
   - `NODE_VERSION`: `22`
