# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**智能侧边栏助手** — Chrome 扩展（Manifest V3），将 LLM 能力（Gemini / OpenAI 兼容接口）集成进浏览器侧边栏。无构建步骤，直接加载源文件。

## 调试与加载

无需编译。在 Chrome 中调试：
1. 打开 `chrome://extensions`，开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选择本目录
3. 修改文件后，点击扩展卡片上的刷新图标（background.js 修改需点刷新；sidebar.js 等修改需关闭再重开侧边栏）
4. Service Worker 日志：扩展卡片 → 「检查视图: Service Worker」
5. 侧边栏日志：右键 → 检查（侧边栏 iframe 内右键）

## 架构

```
background.js          # Service Worker：右键菜单、消息路由、临时标签页管理
content_script.js      # 注入所有页面：文本选择监听、链接拖放预览浮窗
sidebar.js / .html     # 侧边栏主界面：对话、流式响应、内容引用
options.js / .html     # 选项页：多 API 配置管理、语言设置
archive.js / .html     # 对话存档：历史对话查看与继续
prompts.js / .html     # Prompt 模板管理
page_content_extractor.js   # 动态注入脚本：用 Readability 提取当前页正文
link_content_extractor.js   # 动态注入脚本：提取链接页内容（后台临时 Tab）
libs/Readability.js    # Mozilla Readability（第三方）
libs/marked.min.js     # Markdown 渲染（第三方）
```

### 消息流

- `content_script` → `background`：文字选中（`TEXT_SELECTED_FROM_PAGE`）、链接拖放触发总结
- `background` → `sidebar`：`TEXT_SELECTED_FOR_SIDEBAR`、`IMAGE_SELECTED_FOR_SIDEBAR`、`SUMMARIZE_EXTERNAL_TEXT_FOR_SIDEBAR`、`SHOW_LINK_SUMMARY_ERROR`
- `sidebar` → `background`：`getAndSummarizePage`、`extractActiveTabContent`、`openSidePanel`、`summarizeLinkTarget`
- 动态注入脚本 → `background`：`extractedPageContent`（页面提取）、`extractedLinkContent`（链接提取）

### 数据存储（`chrome.storage.sync`）

| Key | 含义 |
|---|---|
| `apiConfigurations` | API 配置数组（含 apiKey、apiType、modelName、apiEndpoint） |
| `activeConfigurationId` | 当前激活的配置 ID |
| `interfaceLanguage` | `'zh'` 或 `'en'` |
| `chatHistory` | 当前对话历史 |
| `archivedChats` | 已存档对话列表 |
| `promptTemplates` | 自定义 Prompt 模板 |

## 关键约定

**翻译机制**：每个 JS 文件都维护自己的 `translations` 对象（`zh`/`en`）和 `t(key)` 函数，互不共享。新增文案必须在 `zh` 和 `en` 两个对象中同时添加。

**流式响应**：sidebar.js 和 archive.js 均使用 `streamingMessageElement` 跟踪当前正在流式输出的 DOM 元素。流式结束时需调用 `finalizeStreamingMessage()` 处理 Markdown 渲染和操作按钮显示。

**API 类型**：`apiType === 'gemini'` 使用 Google Generative Language API；`apiType === 'openai'` 使用自定义 endpoint 的 OpenAI 兼容接口。两种类型的请求构建和流式解析逻辑不同，修改时注意分支。

**内容提取**：`page_content_extractor.js` 和 `link_content_extractor.js` 是被动态 `executeScript` 注入的一次性脚本，执行完毕通过 `chrome.runtime.sendMessage` 将结果发回 background，不依赖持久连接。
