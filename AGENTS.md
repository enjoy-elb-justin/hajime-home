# HAJIME 官网项目 (hajime-home) 指南

本项目是 **HAJIMEコンサルティング株式会社**（HAJIME Consulting Co., Ltd.）的企业官方网站。
基于 **Astro** 搭建，采用静态生成（SSG）并在 Cloudflare Workers / Cloudflare Pages 上运行与部署。

---

## 1. 技术栈与架构

- **Framework**: [Astro 5+](https://astro.build/) (采用最精简的高性能静态架构)
- **Deployment Platform**: Cloudflare Workers (Static Assets) / Cloudflare Pages
- **Package Manager**: `pnpm` (Node 环境由 nvm 管理，请勿使用 npm / yarn 直接安装包)
- **CSS / Styling**: 继承并保留原有高保真现代化设计与视觉排版（Studio Design 提取），支持全端响应式适配（Desktop / Tablet / Mobile）
- **CMS / Data**: 新闻动态（News）与客户案例（Voice / Testimonials）基于结构化 JSON 数据集合进行静态渲染与类型驱动生成

---

## 2. 常用命令

开发与维护时，请始终在项目根目录下使用 `pnpm`：

```bash
# 安装依赖
pnpm install

# 本地开发服务器 (热重载)
pnpm dev

# 构建静态产物 (输出至 dist/)
pnpm build

# 本地预览构建产物
pnpm preview

# Cloudflare 本地模拟 / Wrangler 部署预览
pnpm wrangler pages dev ./dist  # 或使用 wrangler 对应预览命令
```

---

## 3. 项目目录结构规范

```text
hajime-home/
├── AGENTS.md                 # Agent 规范与项目核心约定
├── skills/                   # Antigravity / Agent 技能库与最佳实践沉淀
│   └── astro-cloudflare/    # Astro + Cloudflare 部署与维护技能
├── public/                   # 静态公开资源 (robots.txt, sitemap.xml, 图标, 媒体资产等)
├── src/
│   ├── components/           # 可复用组件 (Header, Footer, MobileNav, Carousel 等)
│   ├── layouts/              # 基础页面布局 (Layout.astro)
│   ├── pages/                # 文件系统路由页面
│   │   ├── index.astro       # 首页
│   │   ├── company/          # 事务所介绍
│   │   ├── service/          # 业务领域及子服务
│   │   ├── news/             # 最新消息列表与详情动态路由
│   │   ├── voice/            # 客户心声列表与详情动态路由
│   │   ├── faq/              # 常见问题
│   │   ├── contact/          # 在线咨询与完成页
│   │   ├── privacy/          # 隐私协议
│   │   └── 404.astro         # 404 页面
│   ├── data/                 # 动态数据源 (news.json, voice.json, faq.json 等)
│   └── styles/               # 全局样式与变量
├── legacy/                   # 原版抓取与备份存档 (只读参考)
├── astro.config.mjs          # Astro 配置文件
└── wrangler.jsonc            # Cloudflare Worker / Assets 配置文件
```

---

## 4. 开发与迁移准则

1. **外观原样还原**：
   - 保持原先由 Playwright / Studio 渲染的高保真视觉设计、字体（Open Sans, こぶりなゴシック, Inter）、颜色变量与排版间距一致。
2. **零 JS 优先与优雅降级**：
   - 原版很多是纯静态展示（脚本已被 stripped）。在 Astro 中除交互逻辑（如移动端抽屉导航、FAQ 展开收起手风琴、Carousel 轮播等）外，其余页面尽量保持 0 客户端 JS 注入，以获得极高 Lighthouse 分数。
3. **路径与路由对齐**：
   - 保证所有链接（如 `/service/startup`、`/company#message`、`/news/cQWrIPXm`、`/voice/A`、`/contact`）与原网站完全一致，保留规范的 SEO URL 结构。
4. **包管理器规范**：
   - 严格使用 `pnpm`。新建依赖时使用 `pnpm add`，避免产生 `package-lock.json` 或 `yarn.lock`。
5. **本地自托管优先（100% Self-Hosted Assets）**：
   - 所有外部图片、日文字体（CJK Unicode Range 切卷）、样式文件均完整下载至 `public/` 本地托管，禁止依赖易失效的第三方 CDN 或外部云存储。除必要的外嵌地图 iframe 外，全站无第三方外部资源依赖。

