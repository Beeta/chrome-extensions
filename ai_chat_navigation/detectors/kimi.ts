import type { DetectorAdapter, UserMessage } from "./types";
import { waitForElement, smoothScrollTo, highlightElement } from "./utils";
/**
 * Kimi (kimi.moonshot.cn) 检测器
 *
 * Kimi DOM 结构（2024+）：
 * - 用户消息：带有 user 相关类名的消息气泡
 * - 容器：聊天列表主容器
 *
 * ⚠️ Kimi 的类名是混淆的哈希，可能随版本变化。
 * 优先使用语义化属性（role、data-*）作为选择器。
 */
export class KimiDetector implements DetectorAdapter {
  name = "Kimi";
  private observer: MutationObserver | null = null;

  canHandle(): boolean {
    return window.location.hostname === "www.kimi.com";
  }

  // async init(): Promise<void> {
  //   // 等待聊天主容器
  //   await waitForElement('[class="chat-content-item"]', 8000);
  // }
  async init(): Promise<void> {
    await waitForElement('[class*="message"], [class*="chat"]', 8000);
  }

  extractUserMessages(): UserMessage[] {
    const messages: UserMessage[] = [];

    // Kimi 通过 data-role 或类名标记角色
    // 尝试多个可能的选择器
    const selectors = [
      // "div.user-content",
      ".chat-content-item.chat-content-item-user.user-content",
      // '[class="segment segment-user"]',
      '[data-role="user"] [class*="content"]',
      '[class*="userMessage"] [class*="text"]',
      '[class*="user-message"]',
      '[class*="chat-content-item-user"]',
      // 通用回退：找包含"发送"图标旁边的消息
    ];

    let userNodes: NodeListOf<Element> | null = null;
    for (const sel of selectors) {
      console.log(sel);
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        userNodes = found;
        // console.log(found);
        // console.log("---");
        break;
      }
    }

    if (!userNodes) return messages;

    userNodes.forEach((el, i) => {
      const text = el.textContent?.trim() || "";
      if (text) {
        messages.push({ content: text, element: el, index: i });
      }
    });

    return messages;
  }

  onMessagesChange(cb: (messages: UserMessage[]) => void): () => void {
    const container =
      document.querySelector('[class*="chatList"], [class*="chat-list"]') ||
      document.body;

    this.observer = new MutationObserver(() => {
      cb(this.extractUserMessages());
    });

    this.observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      this.observer?.disconnect();
      this.observer = null;
    };
  }

  scrollToMessage(index: number): void {
    const messages = this.extractUserMessages();
    const msg = messages[index];
    if (!msg?.element) return;
    smoothScrollTo(msg.element);
    highlightElement(msg.element as HTMLElement);
  }
}
