import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { DetectorManager } from "../detectors/index";
import { FloatingPanel } from "../components/FloatingPanel";

export default defineContentScript({
  matches: [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://www.kimi.com/*",
    "https://www.doubao.com/*",
    "https://yuanbao.tencent.com/*",
    "https://poe.com/*",
  ],
  runAt: "document_idle",

  async main() {
    // 防止重复注入（SPA 热重载或扩展重载时可能触发两次）
    if (document.getElementById("ai-nav-root")) return;

    const manager = new DetectorManager();
    const detector = await manager.detect();

    if (!detector) {
      console.log("[AI Nav] Current site not supported.");
      return;
    }

    console.log(`[AI Nav] Detected: ${detector.name}`);

    // 创建宿主容器
    const container = document.createElement("div");
    container.id = "ai-nav-root";
    // 宿主本身不能有任何样式，否则 fixed 定位会被 transform 破坏
    container.style.cssText = "all: initial;";
    document.body.appendChild(container);

    // 创建 Shadow DOM（样式完全隔离）
    const shadow = container.attachShadow({ mode: "open" });

    // Shadow DOM 内的挂载点
    const mountPoint = document.createElement("div");
    shadow.appendChild(mountPoint);

    // 注入 React 组件
    const root = createRoot(mountPoint);
    root.render(createElement(FloatingPanel, { detector }));

    // 页面卸载时清理
    window.addEventListener(
      "beforeunload",
      () => {
        root.unmount();
        container.remove();
      },
      { once: true },
    );
  },
});
