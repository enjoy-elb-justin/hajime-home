# HAJIME 官网交互与动画迁移审计

> 审计日期：2026-09-05  
> 线上基准：<https://hajime-jp.co.jp/>  
> 本地基准：Git `ffdcb60`，Astro 开发服务器  
> 本文记录问题、原站机制、迁移方案与实施状态。文中列出的交互、动画、联系表单与 Cloudflare bindings 已在 2026-09-05 的后续实施中完成；尚未执行生产部署或真实邮件投递。

## 1. 结论与实施顺序

迁移前版本保留了大部分 STUDIO 导出的 DOM、`data-s-*` 属性和动画 CSS，但只带少量自写交互脚本。原站真正负责状态切换的 Nuxt/STUDIO runtime 没有迁移，因此出现了“样式还在，驱动样式的状态机不在”的情况；本次以小型原生 TypeScript 状态机补齐这些行为。

已按以下顺序完成实施：

1. **P0：所有 accordion（已完成）**：`/faq` 的 10 项与三个服务详情页的 8 项共用同一控制器。
2. **P0：联系表单提交链路（已完成）**：已改为 Worker API + Brevo 邮件投递，不再把内容放进 URL。
3. **P1：全站滚动显现（已完成）**：复用原有 `.appear` CSS，由共享 `IntersectionObserver` 驱动。
4. **P1：首页 logo splash（已完成）**：恢复原站 1600ms 延迟与 600/800ms 交叉淡入淡出。
5. **P1：首页客户声轮播（已完成）**：恢复自动播放、边界归一和可访问状态。
6. **P1：移动菜单（已完成）**：补齐动画、Escape、焦点陷阱/归还和背景 inert。
7. **P2：链接与文案（已完成）**：footer 地址、FAQ CTA、已知死链、FAQ 分类标签及品牌残留均已处理。

不建议把线上整套 Nuxt/STUDIO runtime 打包进 Astro。它体积大、耦合页面模型，而且违背本项目“仅为真实交互注入少量 JS”的目标。应迁移原站的行为和时序，以小型原生 TypeScript 模块实现。

## 2. P0：FAQ 与服务页 accordion 全部失效

### 影响范围

| 页面 | 数量 | 当前状态 |
| --- | ---: | --- |
| `/faq` | 10 | 已修复 |
| `/service/startup` | 4 | 已修复 |
| `/service/accounting` | 2 | 已修复 |
| `/service/inheritance` | 2 | 已修复 |

对应文件：

- `src/pages/faq/index.astro`
- `src/pages/service/startup.astro`
- `src/pages/service/accounting.astro`
- `src/pages/service/inheritance.astro`
- 公共脚本：`src/layouts/Layout.astro`

### 实施状态

已新增 `src/scripts/accordion.ts`，按 `aria-controls` 精确关联 panel，以最近的 `<ul>` 分组，并复刻原站约 `300ms cubic-bezier(0.4, 0.4, 0, 1)` 的动态高度过渡。控制器同步 `_isClose`、`aria-expanded`、`aria-hidden` 与 `inert`，清理快速反向点击留下的监听器/内联高度；reduced motion 下即时切换。

### 已确认的根因

迁移前的 `Layout.astro` 使用：

```ts
const parentItem = btn.closest('.sd');
```

按钮自身就有 `.sd`，因此 `closest()` 返回按钮，而不是包裹按钮和答案的父节点。随后在按钮内部查询同级的 `studio-toggle-content-*` 必然失败，监听器提前 `return`。

即使只把这一行改为 `btn.parentElement`，仍然没有完整复刻原站：

- 旧脚本只切换父节点、按钮和答案容器三个节点；原站会把 `_isClose` 状态传给该 toggle 下的后代，问号、答案正文和加号竖线的状态也会一起更新。
- 旧脚本直接切 class，没有高度测量，无法得到原站的平滑自适应高度动画。
- 旧脚本允许多项同时打开；线上实测为同一列表中只保持一项打开，打开下一项会关闭上一项。

### 原站机制（已从线上行为和 runtime 确认）

线上由 STUDIO 的 `ToggleRenderer` 管理。相关 runtime 位于审计当日的 `/_nuxt/M1C8hKFo2.js`。

- 关闭状态：wrapper、button、answer 及相关后代带 `_isClose`。
- button 使用 `aria-expanded="false"` 和 `aria-controls="studio-toggle-content-*"`。
- answer 使用匹配的 `id`、`aria-hidden="true"` 和 `aria-labelledby`。
- 展开时移除 `_isClose`，同步改为 `aria-expanded="true"` / `aria-hidden="false"`。
- 答案从 `height: 0` 过渡到内容真实高度，线上过渡约 `300ms cubic-bezier(0.4, 0.4, 0, 1)`。
- 加号的竖线在展开后淡出，形成减号。
- 快速连续点击时会清理上一轮 `transitionend` 和超时回调，避免高度卡死。

原站高度动画的核心步骤是：

1. 读取切换前的 computed height。
2. 暂时设置 `transition-duration: 0s`，切到目标 class 并读取目标高度。
3. 恢复起始高度，强制一次 reflow。
4. 恢复 transition 并设置目标高度。
5. 在 `transitionend` 或按 duration + delay 计算的兜底 timeout 后清除内联 `height`。

### 推荐迁移方案

建立独立模块，例如 `src/scripts/accordion.ts`，由 `Layout.astro` 一次加载：

- 用 button 的 `aria-controls` 精确获取答案节点，不依赖脆弱的 `closest('.sd')`。
- wrapper 使用 `button.parentElement`，并在初始化时校验 button、answer 和 ARIA id 的一一对应。
- 以最靠近的 FAQ 列表作为 group；打开一项前关闭该 group 中其他已打开项。
- 对 wrapper 内参与 `_isClose` 条件样式的节点统一切换状态。最稳妥的过渡方案是给结构补充自有的 `data-accordion-*` 属性，逐步摆脱随机 `data-s-*` 选择器。
- 保留原生 `<button>`，支持 Enter/Space；不要用 click-only 的 `<div>`。
- 动画期间处理反向点击并清理旧监听器。
- `prefers-reduced-motion: reduce` 时立即切换，不做高度动画。

### 验收标准

- 18 个问题都可由鼠标、Enter 和 Space 展开/收起。
- 同一组始终最多一项打开。
- 文本换行、移动端宽度变化和字体加载后不会截断答案。
- 快速点击不同问题不会留下内联固定高度。
- `aria-expanded`、`aria-hidden`、`aria-controls`、`aria-labelledby` 始终一致。
- JS 失败时问题文本仍可见；如需要完整无 JS 降级，可改为 `<details>/<summary>`，但这会增加对现有 STUDIO 样式的改造量。

## 3. P0：联系表单邮件链路（已实现）

### 原问题

线上 `/contact` 的 `<form>` 没有 HTML `action`，由 STUDIO runtime 接管校验和提交。迁移前的 Astro 版本改成：

```html
<form action="/contact/thanks" method="GET" novalidate>
```

但本地没有相应表单控制器，因此：

- `novalidate` 关闭了浏览器原生必填校验。
- 空表单也可能直接进入感谢页。
- 并没有把咨询发送给任何后端或收件人。
- GET 会把姓名、电话、邮箱和咨询内容放入 URL、历史记录、访问日志和可能的分析系统，存在明显隐私风险。

### 已实施方案

没有复制 STUDIO 私有提交 API，而是参考 `~/clients/elb-re` 的 Brevo 事务邮件流程，落地为 Astro 按需渲染端点：

- 表单现在 `POST /api/contact`，API 文件为 `src/pages/api/contact.ts`，并通过 `export const prerender = false` 让静态站只为该路由生成 Worker 代码。
- `wrangler.json` 已设置 `main: "@astrojs/cloudflare/entrypoints/server"` 与 `assets.binding: "ASSETS"`。部署形态因此是“Worker 代码 + 静态资产”，不再是无法添加 vars/secrets 的纯静态资产 Worker。
- 后端重新校验全部必填字段、长度、email、tel、咨询类型和隐私同意；浏览器原生校验与客户端错误提示只负责体验。
- 管理员通知发送到 `info@hajime-jp.co.jp`，其 Reply-To 为咨询者邮箱；管理员邮件成功后，再给咨询者发送受理确认。
- 发件人按当前约定设为 `HAJIMEコンサルティング株式会社 <notify@hajime-jp.co.jp>`。
- 成功后才 303/客户端跳转 `/contact/thanks`；失败会停留原页并恢复提交按钮。
- 已增加 honeypot、同源检查、32 KiB 请求体上限、10 秒上游超时和重复点击锁；日志只记录随机 request id 与邮件 message id，不记录表单个人信息。
- `BREVO_API_KEY` 只从 Worker secret 读取；`.dev.vars.example` 只提供占位配置，真实密钥不进入 Git。

部署前需要先确保 `notify@hajime-jp.co.jp` 已在 Brevo 验证，并在首次包含 Worker 代码的版本部署成功后执行：

```bash
pnpm wrangler secret put BREVO_API_KEY
```

如果 Cloudflare 仍提示“Variables cannot be added to a Worker that only has static assets”，说明控制台正在部署旧的纯静态产物或旧构建命令；应确认新版本包含 `/api/contact`、使用仓库根目录的 `wrangler.json`，并通过 `pnpm run deploy` / `pnpm run cf:upload` 构建 Astro Worker。

### 仍建议追加

- 当前仅有 honeypot 和同源检查；上线后应观察滥用情况，再决定是否增加 Cloudflare Rate Limiting binding 或 Turnstile。
- 若需要保证用户确认邮件最终送达，可再用 Queue 将第二封邮件改为可重试的异步任务；当前以管理员通知成功作为提交成功条件。

### 验收标准

- 缺少任何必填项时不会发请求或进入感谢页。
- 服务端会拒绝绕过前端校验的非法请求。
- 成功提交会先把管理员通知投递到 `info@hajime-jp.co.jp`，再发送用户确认邮件。
- URL 和常规日志不包含用户填写内容。
- 网络失败、超时和重复点击均有可恢复反馈。

## 4. P1：全站逐步显现动画未迁移

### 实施状态

已新增 `src/scripts/appear.ts`。共享 observer 为每个节点维护 `pending / running / done` 状态，首次进入视口后解除观察并按原站的双 `requestAnimationFrame` 顺序显现；不支持 observer、无 JS 与 reduced motion 时均直接显示内容。首页 splash 的两个专用节点从通用 observer 中排除，避免两套状态机竞争。

### 迁移前状态

页面 CSS 已保留 STUDIO 生成的两类规则：

```css
.sd[data-s-...].appear { /* opacity / translate / scale 的起始状态 */ }
.sd[data-s-...].appear-active { /* 原始 transition 参数 */ }
```

但迁移前的 `Layout.astro` 没有负责观察元素并切换 `appear` / `appear-active` 的逻辑。静态 HTML 又是从某一个运行完成或运行中的 DOM 状态抓取的，所以不同节点处于不一致的快照状态：有些保留 `appear`，有些已经没有。结果不是简单的“统一关闭动画”，而是无法可靠重放原始时序。

审计到以下页面模板仍含 `.appear` 规则：

- `/`
- `/company`
- `/service` 及三个服务详情页
- `/faq`
- `/news`
- `/voice` 及 voice 详情页
- `/contact`、`/contact/thanks`
- `/privacy`
- `/404`

合计 161 条 `.appear` 规则，其中 97 条明确包含 opacity、translate、scale 或 transform 起始值。

### 原站机制

线上 runtime 为带 motion style 的节点建立 `IntersectionObserver`：

1. 初始 class 包含 `appear`。
2. 元素第一次进入视口时立即 `unobserve`，动画只运行一次。
3. 下一帧移除 `appear` 并加入 `appear-active`。
4. 再下一帧移除 `appear-active`；元素回到普通规则定义的最终状态。

这个双 `requestAnimationFrame` 顺序很重要，它让浏览器先提交起始样式，再按原 CSS 的 delay、duration 和 easing 过渡到最终样式。

### 推荐迁移方案

建立 `src/scripts/appear.ts`，用一个共享 `IntersectionObserver` 管理全页元素，行为保持与原站一致：

- 不要仅对当前残留的 `.appear` 做观察。先按现有 `.appear` CSS 对应的 `data-s-*` 选择器建立一份明确目标清单，并保证目标元素在服务端 HTML 中带起始状态。否则首屏会先闪现最终状态，再被 JS 拉回起点。
- 进入视口时 `unobserve`，用两帧完成 `appear → appear-active → final`。
- 不支持 `IntersectionObserver` 或脚本异常时，立即清除起始状态，不能让内容永久透明。
- `prefers-reduced-motion: reduce` 时直接显示最终状态。
- accordion 内部隐藏元素可以继续被 observer 管理；展开后进入视口再触发即可。
- 为自动化测试提供稳定标记，例如 `data-appear-state="pending|running|done"`，不要再让测试依赖随机的 STUDIO hash。

建议先复用现有 161 条 CSS 以获得最高视觉还原度，验证完成后再逐步把真正使用的动画整理进公共样式。不要第一步就重写所有动画参数。

### 验收标准

- 每个路由硬刷新时，首屏元素按现有 delay/duration 显现。
- 向下滚动时，每组内容只在首次进入视口时出现一次。
- 返回已滚过区域不会重复播放。
- 禁用 JS、浏览器不支持 observer、开启 reduced motion 时，所有内容仍可读。
- 页面加载过程中没有一帧“最终内容先闪现、随后消失”的 FOUC。

## 5. P1：首页 logo splash 与页面交叉淡入缺失

### 实施状态

已新增 `src/scripts/home-splash.ts`，并在 `<head>` 的最早阶段给首页根节点建立 pending 状态，防止页面终态先闪现。动画完成后 loader 同时设置 `hidden` 与强制 `display: none`，页面解除 `inert`；2500ms 正常结束，3200ms 兜底释放，reduced motion 与 `<noscript>` 均直接进入可用终态。

### 线上实测时序

首页已有两个专用节点和完整 CSS：

- loader：`[data-s-781552d3-2b09-48aa-8fa4-d3c79fa027fd]`
- 页面 wrapper：`[data-s-fc4fdcb9-b360-481b-af55-a37f302dadf0]`

线上硬刷新时观测到：

- 约 700ms：白底中央 logo 完全可见，页面 wrapper 为 `opacity: 0`。
- 约 1800ms：仍保持 logo 阶段。
- 约 2600ms：logo 基本淡出，页面基本淡入完成。

现有 CSS 也给出了精确参数：两者都是 `1600ms` delay；logo 淡出 `600ms`，页面淡入 `800ms`。loader 图片宽度桌面约 `320px`，移动端为容器的 `70%`/`80%`，这些现有规则可直接保留。

迁移前的 Astro HTML 抓取的是终态：loader 没有 `appear` 且基础样式为 `opacity: 0; z-index: -1`，页面 wrapper 也没有 `appear`，所以刷新时直接显示页面。

### 推荐迁移方案

首页单独实现 splash 控制器，不要把它完全寄托在滚动 observer 上：

- 服务端输出确定的“加载起始态”，确保首次绘制就是白底 logo，而不是页面闪一下再遮住。
- 下一帧启动现有 `1600ms + 600/800ms` 交叉淡入淡出。
- 动画完成后把 loader 设为 `hidden` 或 `display: none`，并确保不拦截点击。
- 设置约 3 秒兜底定时器；任何脚本、字体或图片异常都必须释放页面。
- 原站在每次首页硬刷新都会播放，当前没有证据表明应使用 session/localStorage 跳过，因此第一版也应每次首页完整加载播放。
- reduced motion 下跳过或极短淡入；`<noscript>` 下直接显示页面、隐藏 loader。

### 验收标准

- 冷缓存和热缓存刷新都先显示中央 logo，再显示页面。
- 动画时页面不可误点，完成后 loader 不占可访问树也不捕获指针。
- logo 资源失败或 JS 异常时，页面最多约 3 秒后可用。
- 内页不出现首页 splash。

## 6. P1：首页客户声轮播只迁移了一部分

### 实施状态

已新增 `src/scripts/carousel.ts`，沿用抓取结果中已存在的 7 张循环 slide，恢复 5200ms 自动前进、1600ms transform 过渡、首尾无动画归一、Prev/Next、hover/focus/页面隐藏暂停，以及当前 slide 的 `aria-hidden`/`inert` 状态。reduced motion 下停用自动播放并即时切换。

### 迁移前差异

迁移前的 `Layout.astro` 把 `[data-type="carousel"]` 设置为横向 `overflow-x: auto`，Prev/Next 按一张卡片宽度调用 `scrollBy()`。当时实测 Next 的确能让 `scrollLeft` 从 0 移到约一张卡片宽度，因此手动按钮不是完全失效。

但线上原站还有以下行为，本地没有：

- 自动播放。
- 三条真实数据的无限循环；线上运行时维护 7 个前后克隆项。
- 切换时的 track transform；线上观测到自动前进和 `1600ms` 过渡。
- `_playing`、`_animatingNext` 和隐藏 slide 状态的实时维护。
- 到边界后的无跳变重排。
- 原 runtime 还包含 hover pause、reduced-motion 和尺寸变化后的重新布局逻辑。

迁移前的静态 HTML 固化了抓取时的 7 个克隆和 `__ariaHidden` class，但这些状态不会更新，也没有可靠的 `aria-hidden`/`inert` 行为。

### 推荐迁移方案

不要继续在抓取后的 7 个克隆 DOM 上叠补丁。将三条客户声从 `src/data/voice.json` 渲染为清晰的 carousel 组件：

- 只保留三条真实 slide；如使用克隆实现无限循环，由脚本在初始化时生成并标记 `aria-hidden="true"`。
- 用 track transform 复刻原站，而不是滚动整个含按钮的外层容器。
- 从线上再录制一轮精确的 autoplay 间隔；已确认 transition duration 为约 1600ms，但本次观察不足以把“停留时间”写死为可靠常量。
- Prev/Next 重置自动播放计时，边界重排禁用 transition 一帧。
- hover、键盘焦点进入、页面隐藏时暂停；离开后恢复。
- reduced motion 时停用自动播放并改为即时切换。
- 非当前 slide 使用 `aria-hidden="true"`，其交互后代使用 `inert`；按钮保持可读 `aria-label`。

### 验收标准

- 自动连续运行至少 20 个周期无空白、倒跳或累计偏移。
- Prev/Next 在桌面和移动端都恰好移动一张。
- resize 后卡片宽度和当前索引正确。
- hover/focus、后台标签页和 reduced motion 的暂停行为正确。
- 读屏不会重复朗读前后克隆内容。

## 7. P1：移动菜单能打开，但不等价于原站

### 实施状态

已新增 `src/scripts/mobile-nav.ts`，使用 `opening / open / closing / closed` 状态恢复约 400ms 的抽屉过渡，并补齐 Escape、焦点陷阱、初始焦点、焦点归还、背景 `inert`、滚动锁与桌面断点清理。Header 的开关按钮已补全 `aria-label`、`aria-controls` 与 `aria-expanded`。

### 迁移前状态

迁移前的 Astro 版本在 `Layout.astro` 中写了一个 `.mobile-nav-modal`。它支持：

- 汉堡按钮打开。
- 关闭按钮、点击 backdrop、点击菜单链接关闭。
- 打开时设置 `body.style.overflow = 'hidden'`。

但与原站相比仍缺少：

- 开关动画；当前由 `display: none` 直接切到 `display: flex`。
- Escape 关闭。本地移动视口实测按 Escape 后菜单仍保持打开。
- 焦点陷阱、打开后初始焦点、关闭后焦点归还。
- 打开按钮的 `aria-label` 和 `aria-expanded`。
- 背景页面的 `inert`/`aria-hidden` 管理。

线上移动版实测 Escape 会关闭 modal。原 STUDIO runtime 使用 `role="dialog"`、约 400ms 的 modal transition，并带 focus-trap 与关闭后的焦点恢复。

### 推荐迁移方案

- 保留当前独立 Astro 菜单，而不是引入原 runtime；重新按线上移动版 DOM/CSS 还原视觉。
- 使用 `hidden` + `data-state="opening|open|closing|closed"`，让 opacity/transform 能完成退场后再隐藏。
- 汉堡按钮补 `aria-label="メニューを開く"`、`aria-controls` 和 `aria-expanded`。
- 打开后聚焦关闭按钮或菜单容器；Tab/Shift+Tab 留在 dialog 内；Escape 关闭；关闭后焦点回到汉堡按钮。
- 背景 `#__site-root` 在打开期间设为 `inert`；同时锁定滚动并保存/恢复原 overflow。
- 切换到桌面 breakpoint 时如果菜单仍开着，要自动清理 dialog、inert 和 scroll lock 状态。

### 验收标准

- 390px、540px、840px 断点附近都可正常打开/关闭。
- Escape、关闭按钮、backdrop 和导航链接四种方式都能关闭。
- Tab 不会进入背景页面，关闭后焦点回到汉堡按钮。
- 快速连续开关不会卡在半透明状态或留下滚动锁。

## 8. P2：footer 地址图标应链接到事务所概要

### 实施状态

已把“地址 + 图标”整体改为真实的 `/company#overview` 链接，补充可读 `aria-label`，并为 `#overview` 设置 header 偏移所需的 `scroll-margin-top`。浏览器实测点击后可到达目标锚点。

迁移前 `src/components/Footer.astro` 中地址与外链样式图标都放在普通 `<div>` 内，没有 `<a>`；线上当前 DOM 也同样没有 href。这是明确的目标修正，而不是可以直接从原站复制的现成功能。

推荐把“地址 + 图标”整体设为链接，点击面积和语义优于只包住小图标：

```html
<a href="/company#overview" aria-label="事務所概要・アクセスを見る">
  <!-- address + icon -->
</a>
```

如果产品坚持只有图标可点击，也必须给图标链接可读的 `aria-label`。这是站内锚点，不应使用 `target="_blank"`，图标也可考虑改成向右箭头而非“外部打开”图标，避免错误暗示。

验收时确认从任意页面点击后到达 `/company#overview`，目标标题不被固定 header 遮住；必要时给目标使用 `scroll-margin-top`。

## 9. 其他审计发现

以下项目线上目前也有相同或相近问题，因此不算纯粹的 Astro 回归，但应在迁移收尾时作出明确决定。

### 9.1 服务详情页“FAQ 一覧を見る”是静态装饰

迁移前三个服务详情页的“一覧を見る →”在线上和本地都是普通 `<div>`，不是链接。视觉上明显像 CTA，推荐改为 `/faq` 链接。

**已处理：** `src/scripts/content-fixes.ts` 在保留 STUDIO 结构与样式的同时，把三个 CTA 包装为 `/faq` 链接，并补充可读标签。

### 9.2 两类已知 404 链接

- footer 的“採用情報”指向 `/recruit`，线上和本地都返回 404。
- news/voice 详情模板中的部分分类链接指向 `/news/category`，线上和本地都返回 404。

需要业务确认是删除入口、补页面，还是修正到现有列表/分类路由。不要继续保留“看似可点击但必然 404”的入口。

**已处理：** footer 删除当前没有目标页面的“採用情報”；news 详情分类入口回到 `/news`，voice 详情分类入口回到 `/voice`。

### 9.3 FAQ 分类导航文案与当前业务内容不一致

`/faq` 顶部仍显示“#創業支援 / #税務・会計 / #相続・事業継承 / #ご契約・その他”，但实际四组标题已变为“サービスについて / 専門家連携について / 料金・契約について / ご契約・その他”。锚点本身可以跳转，但标签语义是旧站遗留，应同步当前内容。

**已处理：** 四个服务端渲染标签已与当前分组标题同步，原锚点 id 保持不变，避免破坏既有深链接。

联系表单的“ご用件”也曾保留旧业务分类；现已把前端选项与 Worker 服务端白名单一并同步为“在日経営コンサルティング支援 / 組織運営・コミュニケーション支援 / 専門家連携サポート / その他”。

### 9.4 旧品牌与拼写残留

- footer logo alt 仍是“おだやか会計事務所”。
- copyright 仍是“©️2024 Odayaka accounting firm”。
- 首页英文标题写作 `Comapny`。
- 联系表单 email placeholder 原为 `xxx@hr_studio.com`；邮件链路实施时已改为中性的 `info@example.com`。

这些在线上也存在，需由品牌/业务确认最终文案后统一修改。

**已处理：** footer logo alt、copyright、首页 `Company` 拼写及 voice 详情正文中的旧品牌展示已统一为 `HAJIMEコンサルティング株式会社`。

### 9.5 当前正常、无需重做的部分

- 桌面 header 的 Service/Company 下拉菜单由现有 `:hover` CSS 驱动，线上和本地都能从 `opacity: 0; scale: 1 1e-10` 过渡到可见状态。
- 首页轮播的 Prev/Next 当前可以手动移动；问题是缺少自动、无限和状态管理，不是按钮完全无效。
- `/company#message`、`#philosophy`、`#team`、`#overview` 目标均存在。

## 10. 推荐代码组织

当前已把 `Layout.astro` 的交互拆为以下小模块：

```text
src/scripts/
├── accordion.ts       # FAQ 与服务页 toggle
├── appear.ts          # 全站一次性进入视口动画
├── mobile-nav.ts      # dialog、焦点和滚动锁
├── carousel.ts        # 首页客户声轮播
├── home-splash.ts     # 首页首次绘制与 logo 交叉淡入
└── content-fixes.ts   # 抓取 DOM 中需要补为真实链接的 CTA
```

首页在 `Layout.astro` 的 `<head>` 中使用极短内联脚本建立首次绘制状态，其余逻辑以模块加载。每个模块在找不到目标节点时静默退出，确保只有需要该交互的页面承担运行成本。

随机 `data-s-*` 可暂时作为视觉 CSS 的兼容层，但新脚本应优先使用稳定的 `data-*` hooks，例如：

```html
data-accordion
data-accordion-trigger
data-accordion-panel
data-appear
data-carousel
data-mobile-nav
```

## 11. 自动化回归建议

至少添加以下浏览器测试：

1. `/faq`：点第一项可见答案；点第二项后第一项关闭；ARIA 同步。
2. 三个服务详情页：每个 accordion 均可打开，且“一覧を見る”到 `/faq`。
3. 首页硬刷新：700ms 左右看到 logo、页面隐藏；约 2.6–3s 页面完成显示。
4. 任一内页：首屏动画完成；滚动到下一 section 后元素只显现一次。
5. 首页轮播：自动索引变化；Prev/Next；resize；reduced motion。
6. 移动菜单：打开、Tab 圈定、Escape 关闭、焦点归还、滚动锁清理。
7. footer 地址入口：从不同路由都跳到 `/company#overview`。
8. 联系表单：必填错误、成功、服务端错误、网络失败、重复提交。
9. 链接扫描：内部链接不得返回 404；若暂时保留 `/recruit`，测试中必须明确列为已知例外而不是静默忽略。

建议测试至少覆盖 1440×1000、768×1024、390×844，并额外运行 `prefers-reduced-motion: reduce`。

## 12. 实施完成定义

只有同时满足以下条件，交互迁移才算完成：

- 原站已有的 accordion、splash、scroll reveal、carousel 和 mobile modal 行为均有对应实现。
- 所有交互具备键盘和 ARIA 状态，不只是在鼠标下“看起来能动”。
- 动画失败或 JS 禁用时内容仍可读、链接仍可达。
- 联系表单真实投递且不泄漏用户输入到 URL。
- 没有新增第三方 CDN/runtime 依赖，图片、字体和脚本继续本地托管。
- 生产构建、内部链接扫描和上述浏览器回归全部通过。

## 13. 本次验证备注

- 已在浏览器中对线上与本地 FAQ、首页 loader、首页 carousel、桌面下拉菜单和移动菜单进行行为对照。
- 已直接检查线上 Nuxt/STUDIO runtime 中的 `ToggleRenderer` 与 `IntersectionObserver` 逻辑；本文方案优先复刻其机制。
- 18 个 accordion 已在真实浏览器覆盖鼠标、Enter、Space、单组单开、快速切换后的高度清理与 ARIA/inert 同步。
- 首页硬刷新时记录到 0/700/1850ms 的 logo 可见且正文不可交互，约 2700ms loader 已 `hidden + display:none`、正文解除 inert；轮播也通过跨越循环边界后的索引归一验证。
- 移动菜单在 390×844 视口通过打开、滚动锁、背景 inert、Escape 关闭和焦点归还；滚动显现的 pending 数会随锚点滚动下降，返回区域不会重新注册。
- `pnpm astro check` 为 0 error / 0 warning / 0 hint，`NODE_OPTIONS=--trace-deprecation pnpm build` 完整通过，浏览器控制台无 error/warning。
- `pnpm wrangler deploy --dry-run` 确认产物包含 13 个 Worker 模块、`/api/contact` 动态路由、370 个静态资产，以及 `ASSETS`、`R2_ASSETS`、`KV`、`SESSION`、`IMAGES` 和联系表单 vars；部署目标不再是纯静态资产 Worker。
- 本地 API 验证覆盖：缺少必填字段返回 400、honeypot 静默成功、跨站 POST 被 Astro/Cloudflare origin 检查拒绝。真实 Brevo 投递需配置生产 `BREVO_API_KEY` 后再做端到端测试。

### 13.1 Node `DEP0169` 警告

`NODE_OPTIONS=--trace-deprecation pnpm outdated` 将警告定位到 Corepack 缓存的 pnpm 9.15.4：其鉴权配置解析函数 `toNerfDart()` 仍调用 Node 的 `url.parse()`。这不是 Astro 页面代码或联系表单 Worker 的调用。

项目现已在 `package.json` 固定 `packageManager: "pnpm@10.34.5"`。重新安装依赖后，带 `--trace-deprecation` 的 `pnpm outdated`、`pnpm astro check`、`pnpm build` 与 Wrangler dry-run 均不再输出 `DEP0169`。不要通过 `NODE_NO_WARNINGS` 隐藏问题；新机器应启用 Corepack，让项目声明自动选择该版本。

## 14. Cloudflare R2 与 Workers Static Assets

### 14.1 两类资源不能混为一个 binding

本项目同时使用两种名称相近、用途不同的 Cloudflare 能力：

| 配置 | 当前名称 | 用途 |
| --- | --- | --- |
| Workers Static Assets binding | `ASSETS` | Wrangler 随部署上传的 Astro 构建产物，例如 HTML、CSS、JS、字体及 `public/` 中的站点文件 |
| R2 bucket binding | `R2_ASSETS` | 独立于部署生命周期的对象存储，适合大文件、可变媒体、上传内容、归档和备份 |
| Workers KV binding | `KV` | 小型、读多写少的键值数据，例如配置、限流计数的近似状态或短期标记；不用于保存站点文件 |

不要把 R2 binding 也命名为 `ASSETS`。binding 会成为 Worker runtime 中的变量，同名会冲突；而且两者 API 也不同：`ASSETS` 是 `Fetcher`，`R2_ASSETS` 是 `R2Bucket`。

R2 也不是“让纯静态 Worker 可以添加 vars/secrets”的开关。该问题已经通过加入 `/api/contact` 动态路由和 Astro Cloudflare Worker entrypoint 解决；R2 是另一个独立 binding。

### 14.2 当前账号与 bucket

- Cloudflare account ID：`a1651c8169a23dc4f295145b0d949138`
- R2 bucket name：`hajime-home-storage`
- Worker 内的 binding name：`R2_ASSETS`

`a1651c8169a23dc4f295145b0d949138` 是 account ID，不是 R2 bucket ID。通过 Worker binding 访问 R2 时，Wrangler 配置只需要顶层 `account_id` 和 R2 条目中的 `bucket_name`；不需要另填 bucket ID、S3 access key 或 secret。

当前 `wrangler.json` 应保持以下结构：

```jsonc
{
  "name": "hajime-home",
  "account_id": "a1651c8169a23dc4f295145b0d949138",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "assets": {
    "binding": "ASSETS"
  },
  "r2_buckets": [
    {
      "binding": "R2_ASSETS",
      "bucket_name": "hajime-home-storage"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "4594963162ef42a392ae4592ba1af62b"
    }
  ]
}
```

### 14.3 推荐的资源分层

不要把现有 `public/` 和 Astro `_astro/` 构建文件整体搬到 R2。推荐方案是：

1. 继续由 Workers Static Assets 管理随代码版本发布的 HTML、CSS、JS、字体、logo、favicon 和页面关键图片。这些资源应当与一次部署原子更新，且 Astro 已负责内容哈希和缓存。
2. 使用 `hajime-home-storage` 存放不应随每次部署重复上传的内容，例如体积较大的原始媒体、后台或表单产生的上传、可变文件、迁移备份。
3. 默认让 bucket 保持私有。只有确定需要浏览器直接公开访问的对象，才为 bucket 配置 `assets.hajime-jp.co.jp` 一类的自定义域；生产环境不要依赖仅用于开发的 `r2.dev` URL。
4. 若资源需要鉴权、下载审计、键名校验或动态响应头，则通过 Worker 路由读取 `R2_ASSETS.get(key)`；公开且无需鉴权的大文件优先走 R2 自定义域，避免每次下载都产生 Worker 调用。

如果以后决定把某类线上图片迁到 R2，应采用带版本或内容哈希的 object key，并在确认对象上传成功后再替换页面 URL。不要先删除 `public/` 原文件，以免部署期间出现资源 404。

### 14.4 初始化与验证流程

bucket 已存在时，不要重复执行 create；先确认登录账号和 bucket：

```bash
pnpm wrangler whoami
pnpm wrangler r2 bucket list
```

只有 bucket 尚未创建时才执行：

```bash
pnpm wrangler r2 bucket create hajime-home-storage
```

添加或调整 binding 后执行：

```bash
pnpm run cf:types
pnpm build
pnpm wrangler deploy --dry-run
```

`pnpm run cf:types` 应在 `worker-configuration.d.ts` 中生成：

```ts
R2_ASSETS: R2Bucket;
```

Wrangler 本地开发默认使用本机的 R2 存储，不会写入线上 bucket。不要在常规开发配置中加入 `"remote": true`；只有明确需要对真实 bucket 做受控联调时才临时启用，并避免执行覆盖或删除操作。

### 14.5 通过 Worker 提供私有对象时的要求

如果后续新增 `/api/assets/[...key]` 一类路由，至少应做到：

- 只允许读取明确的 key/prefix，拒绝路径穿越和未经授权的写入、删除。
- 使用 `object.writeHttpMetadata(headers)` 恢复上传时保存的 `Content-Type` 等元数据，并设置 `ETag`。
- 对大文件直接返回 `object.body` stream，不把整个对象读入内存。
- 需要视频、PDF 等断点续传时处理 `Range` 和条件请求。
- 写入/删除接口必须有独立鉴权，不能因为 bucket binding 已存在就公开 CRUD。
- 上传时写入正确的 `Content-Type` 和缓存策略；跨域提供字体或媒体时再按实际域名配置最小化 CORS。

### 14.6 R2 验收清单

- `pnpm wrangler r2 bucket list` 能在目标账号看到 `hajime-home-storage`。
- `pnpm run cf:types` 生成 `R2_ASSETS: R2Bucket`，同时仍保留 `ASSETS: Fetcher`。
- dry-run 同时列出 Static Assets 与 R2 两个 bindings。
- 联系表单的 vars/secrets 仍可配置，R2 binding 不影响 `BREVO_API_KEY`。
- 部署后原有页面静态资源无 404；若启用 R2 公网域名，需额外检查 Content-Type、Cache-Control、CORS 和缓存命中。

### 14.7 Workers KV 配置

目标 KV namespace 已从当前 Cloudflare 账号核对：

- namespace name：`hajime-home-kv`
- namespace ID：`4594963162ef42a392ae4592ba1af62b`
- Worker binding name：`KV`

这里必须使用 namespace ID，不能使用 account ID，也不能只写 `hajime-home-kv`。实际配置为：

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "4594963162ef42a392ae4592ba1af62b"
    }
  ]
}
```

应用代码通过 `env.KV` 访问 namespace。KV 适合全局读取频繁、允许最终一致性的数据；不要用它存大文件，也不要把依赖强一致性的锁、精确计数或交易状态放进去。当前只是完成 binding，尚未让联系表单写入 KV；如以后用它做防重复提交或限流，需要明确 key 生命周期并设置 `expirationTtl`。

验证命令：

```bash
pnpm wrangler kv namespace list
pnpm run cf:types
pnpm wrangler deploy --dry-run
```

类型文件应同时出现：

```ts
KV: KVNamespace;
R2_ASSETS: R2Bucket;
ASSETS: Fetcher;
```

与 R2 一样，Wrangler 对 KV 的本地访问默认落在本地存储。配置中不加 `"remote": true`，避免开发过程误写生产 namespace；需要检查线上 key 时，应使用显式带 `--remote` 的只读命令。

本次实际运行 `pnpm wrangler deploy --dry-run` 已确认：`env.KV` 指向 `4594963162ef42a392ae4592ba1af62b`，`env.R2_ASSETS` 指向 `hajime-home-storage`，同时 `env.ASSETS` 与联系表单 vars 均保留。
