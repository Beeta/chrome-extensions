import type { DetectorAdapter, UserMessage } from "./types";
import { waitForElement, smoothScrollTo, highlightElement } from "./utils";

/**
 * 豆包 (www.doubao.com) 检测器
 *
 * 豆包 DOM 结构（2024+）：
 * - 用户消息：带有 user/human 相关标识的消息节点
 *
 * ⚠️ 豆包（字节跳动）的类名也是哈希混淆的，选择器需要实测。
 */
export class DoubaoDetector implements DetectorAdapter {
  name = "豆包";
  private observer: MutationObserver | null = null;

  canHandle(): boolean {
    return window.location.hostname === "www.doubao.com";
  }

  async init(): Promise<void> {
    await waitForElement('[class*="message"], [class*="chat"]', 8000);
  }

  extractUserMessages(): UserMessage[] {
    const messages: UserMessage[] = [];

    // 豆包的用户消息选择器（按优先级）
    const selectors = [
      '[data-testid="send_message"]',
      '[data-role="user"]',
      '[class*="userContent"]',
      '[class*="user_content"]',
      '[class*="humanMessage"]',
    ];

    let userNodes: NodeListOf<Element> | null = null;
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        userNodes = found;
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
      document.querySelector(
        '[class*="chatContent"], [class*="chat-content"]',
      ) || document.body;

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
