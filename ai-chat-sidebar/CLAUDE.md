# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**智能侧边栏助手** — Chrome Manifest V3 扩展，将 LLM（Gemini / OpenAI 兼容）能力集成到浏览器侧边栏。当前版本 1.3.0。

## 安装与调试

无构建步骤，纯静态文件。开发流程：

1. `chrome://extensions` → 开启开发者模式 → 加载已解压的扩展程序，选择本目录
2. 修改任何 JS/HTML/CSS 后，在扩展管理页点击刷新按钮（或按 `Ctrl+R`）
3. 修改 `background.js` 后需单独点击 Service Worker 的"重新加载"链接
4. 侧边栏热重载：关闭再重新打开侧边栏即可

调试入口：
- **background.js**：扩展管理页 → Service Worker → Inspect
- **sidebar.js**：侧边栏右键 → 检查
- **content_script.js**：目标页面开发者工具 Console

## 架构

### 消息通信总线

扩展各部分通过 `chrome.runtime.sendMessage` 通信，形成如下流向：

```
content_script.js  →  background.js  →  sidebar.js
(用户网页)              (中转/协调)       (侧边栏UI)
```

**关键消息类型**（`type` 字段，由 background 转发给 sidebar）：
- `TEXT_SELECTED_FOR_SIDEBAR` — 用户选中文本
- `IMAGE_SELECTED_FOR_SIDEBAR` — 右键分析图片
- `SUMMARIZE_EXTERNAL_TEXT_FOR_SIDEBAR` — 链接内容已提取，待总结
- `SHOW_LINK_SUMMARY_ERROR` — 链接提取失败
- `EXTRACT_CONTENT_ERROR` — 页面内容提取失败
- `EXTRACTED_PAGE_CONTENT` — 页面全文提取完成

**关键消息类型**（`action` 字段，由 sidebar/content 发给 background）：
- `getAndSummarizePage` — 获取当前页面内容
- `extractActiveTabContent` — 注入 Readability 提取全文
- `summarizeLinkTarget` — 打开临时 Tab 提取链接内容
- `openSidePanel` — 打开侧边栏

### 文件职责

| 文件 | 职责 |
|---|---|
| `manifest.json` | MV3 声明，权限：activeTab, scripting, storage, contextMenus, sidePanel, tabs |
| `background.js` | Service Worker：右键菜单、页面内容提取协调、临时 Tab 管理 |
| `content_script.js` | 注入所有页面：文本选中监听、链接拖拽预览浮窗 |
| `sidebar.js` | 侧边栏主逻辑：API 调用、流式输出、Markdown 渲染、对话管理 |
| `sidebar.html/css` | 侧边栏 UI |
| `options.js/html` | 设置页：多 API 配置管理、语言切换 |
| `archive.js/html` | 历史对话查看页 |
| `prompts.js/html` | Prompt 模板管理页 |
| `page_content_extractor.js` | 被动态注入到目标页，使用 Readability 提取正文 |
| `link_content_extractor.js` | 被动态注入到临时链接 Tab，提取内容后 sendMessage 回 background |
| `libs/Readability.js` | Mozilla Readability，本地依赖 |
| `libs/marked.min.js` | Markdown 渲染，本地依赖 |

### 存储结构（`chrome.storage.sync`）

- `configurations[]` — API 配置列表（含 apiKey, apiType, apiEndpoint, modelName）
- `activeConfigurationId` — 当前激活的配置 ID
- `interfaceLanguage` — `'zh'` 或 `'en'`
- `promptTemplates[]` — 用户自定义 Prompt 模板
- `archivedChats[]` — 已存档对话
- `currentChat[]` — 当前对话历史（同步到 storage 以跨页面持久化）

### 国际化

sidebar.js、background.js、options.js 各自维护一份 `translations` 对象，通过 `t(key)` 函数按 `currentLanguage` 取值。修改文案需同步修改 `zh` 和 `en` 两个 key。

### API 支持

- **Gemini**：`https://generativelanguage.googleapis.com/` — 使用 SSE 流式，消息格式为 `{role, parts: [{text}]}`
- **OpenAI 兼容**：自定义 endpoint — 使用标准 OpenAI Chat Completions 格式，SSE 流式解析 `data:` 行

流式输出通过 `updateStreamingMessage(text)` 实时渲染，完成后调 `finalizeStreamingMessage()`。
