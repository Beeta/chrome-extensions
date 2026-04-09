import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: "output",
  manifest: {
    name: "聊到哪了",
    description: "为 AI 聊天网站提供问题索引浮窗，快速跳转到任意对话位置",
    version: "1.0.0",
    permissions: ["storage"],
    host_permissions: [
      "https://chat.openai.com/*",
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*",
      "https://www.kimi.com/*",
      "https://www.doubao.com/*",
      "https://poe.com/*",
      "https://yuanbao.tencent.com/*",
    ],
    icons: {
      "32": "/icon-32.png",
      "48": "/icon-48.png",
      "128": "/icon-128.png",
    },
    action: {
      default_title: "聊天导航，防止你找不着北",
      default_icon: {
        "32": "/icon-32.png",
        "48": "/icon-48.png",
      },
    },
  },
});
