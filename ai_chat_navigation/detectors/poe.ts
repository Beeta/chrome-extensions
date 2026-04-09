import type { DetectorAdapter, UserMessage } from "./types";
import { waitForElement, smoothScrollTo, highlightElement } from "./utils";

/**
 * Poe (poe.com) 检测器
 *
 * DOM 结构（2025+）：
 * - 用户消息气泡：[class*="Message_rightSideMessageBubble"]（CSS Modules 哈希类名，用前缀匹配）
 * - 文字内容：[class*="Prose_prose"] p（最内层段落）
 *
 * 注意：Poe 使用 CSS Modules，类名后缀哈希每次部署可能变化，用前缀属性选择器降低脆弱性。
 */
export class PoeDetector implements DetectorAdapter {
  name = "Poe";
  private observer: MutationObserver | null = null;

  canHandle(): boolean {
    return window.location.hostname === "poe.com";
  }

  async init(): Promise<void> {
    await waitForElement('[class*="Message_rightSideMessageBubble"]', 8000);
  }

  extractUserMessages(): UserMessage[] {
    const messages: UserMessage[] = [];
    const selectors = [
      '[class*="Message_row__ug_UU Message_rightSideMessageRow__23wdY"]',
      '[class*="Message_rightSideMessageBubble"] [class*="Prose_prose"] p',
      '[class*="Message_rightSideMessageBubble"] [class*="Message_selectableText"]',
      '[class*="Message_rightSideMessageBubble"]',
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
      if (text) messages.push({ content: text, element: el, index: i });
    });

    return messages;
  }

  onMessagesChange(cb: (messages: UserMessage[]) => void): () => void {
    const container =
      document.querySelector('[class*="InfiniteScroll"]') ||
      document.querySelector("main") ||
      document.body;

    this.observer = new MutationObserver(() => cb(this.extractUserMessages()));
    this.observer.observe(container, { childList: true, subtree: true });

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
