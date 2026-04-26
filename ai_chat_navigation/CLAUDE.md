# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 开发模式，WXT 自动热更新扩展
npm run build    # 生产构建，输出到 output/chrome-mv3/
npm run zip      # 打包成 zip 用于上架
```

加载扩展：Chrome/Edge 打开 `chrome://extensions`，开启开发者模式，加载 `output/chrome-mv3/` 目录。

## Architecture

这是一个 **WXT + React + TypeScript** 的 Chrome/Edge Manifest V3 扩展，核心功能是在 AI 聊天网站注入一个问题索引浮窗。

### 数据流

```
目标网站 DOM
    ↓ MutationObserver
DetectorAdapter.extractUserMessages()
    ↓ onMessagesChange callback
FloatingPanel (React, Shadow DOM)
    ↓ 用户点击
DetectorAdapter.scrollToMessage()
    ↓ scrollIntoView
目标网站 DOM
```

### 关键设计决策

**Shadow DOM 隔离**：浮窗挂载在 Shadow DOM 内（`container.attachShadow({ mode: 'open' })`），样式完全不与目标网站冲突。宿主容器必须设置 `style.cssText = 'all: initial'`，防止目标网站的 `transform`、`filter` 等属性破坏 `position: fixed` 定位。

**DetectorAdapter 模式**：`detectors/types.ts` 定义接口，每个网站实现一个 Detector 类，`DetectorManager`（`detectors/index.ts`）自动通过 `canHandle()` 选择对应实现。新增网站只需新增一个 Detector 类并注册到 `DetectorManager` 的数组中。

**选择器维护**：各 AI 网站的 DOM 结构会随版本变化。每个 Detector 内维护多个备用选择器（按优先级依次尝试），ChatGPT 使用语义化 `data-message-author-role="user"` 属性，最稳定；Kimi/豆包使用哈希类名，最脆弱。

**SPA 路由监听**：`FloatingPanel.tsx` 内用 `setInterval` 轮询 `location.href` 变化（500ms），切换对话后自动清空并重新提取消息。这是因为目标网站用 History API 路由切换，无法直接监听。

### 目录结构

- `detectors/` — 各网站检测器，`types.ts` 定义接口，`utils.ts` 提供 `waitForElement`/`smoothScrollTo`/`highlightElement`
- `components/FloatingPanel.tsx` — 浮窗 UI，纯内联样式（无 CSS 文件），全部渲染在 Shadow DOM 内
- `entrypoints/content.ts` — Content Script 唯一入口，注入 Shadow DOM 并挂载 React
- `entrypoints/popup/` — 扩展图标弹窗，仅做展示用（支持的网站列表）
