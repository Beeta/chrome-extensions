import type { DetectorAdapter, UserMessage } from "./types";
import { waitForElement, smoothScrollTo, highlightElement } from "./utils";

/**
 * 腾讯元宝 (yuanbao.tencent.com) 检测器
 *
 * DOM 结构（2025+）：
 * - 用户消息气泡：.agent-chat__bubble--human（BEM 类名，稳定）
 * - 文字内容：.hyc-content-text（最内层）
 */
export class YuanbaoDetector implements DetectorAdapter {
  name = "腾讯元宝";
  private observer: MutationObserver | null = null;

  canHandle(): boolean {
    return window.location.hostname === "yuanbao.tencent.com";
  }

  async init(): Promise<void> {
    await waitForElement(".agent-chat__bubble--human", 8000);
  }

  extractUserMessages(): UserMessage[] {
    const messages: UserMessage[] = [];
    const selectors = [
      ".agent-chat__bubble--human .hyc-content-text",
      ".agent-chat__bubble--human .agent-chat__bubble__content",
      ".agent-chat__bubble--human",
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
      document.querySelector('[class*="agent-chat"]') || document.body;

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
