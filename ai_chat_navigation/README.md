# AI Chat Navigator

A Chrome/Edge extension that injects a floating question index panel into AI chat websites, letting you jump between your messages instantly.

Chrome/Edge 扩展，在 AI 聊天网站注入一个问题索引浮窗，让你在长对话中一键跳转到任意一条提问。

**Supports / 支持:** ChatGPT · Claude · Gemini · Kimi · 豆包 (Doubao)

---

## What it does

When you have a long AI conversation, finding an earlier question means endless scrolling. AI Chat Navigator adds a small floating panel on the side that lists all your questions — click any one to jump straight to it.

AI 对话越来越长，想回头找某个问题只能一直往上翻。AI Chat Navigator 会在页面侧边显示一个浮窗，列出你所有的提问，点一下就能跳过去。

![panel preview placeholder](./docs/preview.png)

---

## Installation (Dev) / 开发安装

1. Clone the repo and install dependencies:

   克隆仓库并安装依赖：

```bash
npm install
```

2. Start dev mode (auto reload on save):

   启动开发模式（保存后自动重载扩展）：

```bash
npm run dev
```

3. Open `chrome://extensions` in Chrome/Edge, enable **Developer mode**, click **Load unpacked**, and select the `output/chrome-mv3/` directory.

   在 Chrome/Edge 打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择 `output/chrome-mv3/` 目录。

---

## Build for production / 生产构建

```bash
npm run build   # outputs to output/chrome-mv3/ / 输出到 output/chrome-mv3/
npm run zip     # packages a .zip ready for Chrome Web Store / 打包 zip 用于上架
```

---

## Tech stack / 技术栈

| Layer | Technology |
|---|---|
| Extension framework | [WXT](https://wxt.dev/) (Manifest V3) |
| UI | React 19 + TypeScript |
| Style isolation | Shadow DOM + inline styles |
| Site detection | Per-site `DetectorAdapter` classes |

---

## Architecture / 架构

```
Target site DOM / 目标网站 DOM
     ↓  MutationObserver
DetectorAdapter.extractUserMessages()
     ↓  onMessagesChange callback
FloatingPanel (React, Shadow DOM)
     ↓  user click / 用户点击
DetectorAdapter.scrollToMessage()
     ↓  scrollIntoView
Target site DOM / 目标网站 DOM
```

### Adding a new site / 新增网站支持

1. Create `detectors/<site>.ts` and implement the `DetectorAdapter` interface.

   新建 `detectors/<site>.ts`，实现 `DetectorAdapter` 接口。

2. Register it in `detectors/index.ts` inside the `DetectorManager` array.

   在 `detectors/index.ts` 的 `DetectorManager` 数组中注册。

That's it. The manager picks the right detector automatically via `canHandle()`.

就这两步，`DetectorManager` 会通过 `canHandle()` 自动选择对应实现。

---

## Project structure / 目录结构

```
detectors/
  types.ts         # DetectorAdapter interface / 接口定义
  index.ts         # DetectorManager — auto-selects the right detector / 自动选择检测器
  chatgpt.ts
  claude.ts
  gemini.ts
  kimi.ts
  doubao.ts
  utils.ts         # waitForElement / smoothScrollTo / highlightElement
components/
  FloatingPanel.tsx  # Floating UI, all inline styles, rendered inside Shadow DOM
                     # 浮窗 UI，纯内联样式，渲染在 Shadow DOM 内
entrypoints/
  content.ts         # Content script entry — injects Shadow DOM and mounts React
                     # Content Script 入口，注入 Shadow DOM 并挂载 React
  popup/             # Extension popup (supported sites list) / 扩展弹窗（支持网站列表）
```

---

## Key design decisions / 关键设计决策

**Shadow DOM isolation / Shadow DOM 隔离** — The panel mounts inside a Shadow DOM so its styles never conflict with the host site. The host container uses `all: initial` to prevent the site's `transform` or `filter` from breaking `position: fixed`.

浮窗挂载在 Shadow DOM 内，样式完全不与目标网站冲突。宿主容器设置 `all: initial`，防止目标网站的 `transform`、`filter` 等属性破坏 `position: fixed` 定位。

**Fallback selectors / 备用选择器** — AI sites change their DOM frequently. Each detector holds multiple fallback selectors tried in priority order. ChatGPT's `data-message-author-role="user"` attribute is the most stable; Kimi/Doubao use hashed class names and are more fragile.

AI 网站 DOM 结构会随版本变化。每个 Detector 内维护多个备用选择器按优先级依次尝试。ChatGPT 使用语义化属性 `data-message-author-role="user"`，最稳定；Kimi/豆包使用哈希类名，最脆弱。

**SPA route detection / SPA 路由监听** — The panel polls `location.href` every 500ms to detect conversation switches made via the History API, then clears and re-extracts messages automatically.

浮窗每 500ms 轮询 `location.href`，检测 History API 路由切换，切换对话后自动清空并重新提取消息。

---

## License

MIT
