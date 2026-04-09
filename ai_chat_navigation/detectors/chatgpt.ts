import type { DetectorAdapter, UserMessage } from './types';
import { waitForElement, smoothScrollTo, highlightElement } from './utils';

/**
 * ChatGPT / chatgpt.com 检测器
 *
 * ChatGPT 在 Manifest V3 时代的 DOM 结构（2024+）：
 * - 用户消息：[data-message-author-role="user"]
 * - 容器：article 或 div[data-message-id] 嵌套在 main 中
 *
 * ⚠️ ChatGPT 频繁改版，选择器可能需要定期维护。
 */
export class ChatGPTDetector implements DetectorAdapter {
  name = 'ChatGPT';
  private observer: MutationObserver | null = null;

  canHandle(): boolean {
    const host = window.location.hostname;
    return host === 'chat.openai.com' || host === 'chatgpt.com';
  }

  async init(): Promise<void> {
    // 等待主聊天容器出现
    await waitForElement('main');
  }

  extractUserMessages(): UserMessage[] {
    const messages: UserMessage[] = [];
    // 选择所有用户消息的容器
    const userTurns = document.querySelectorAll('[data-message-author-role="user"]');

    userTurns.forEach((el, i) => {
      const text = el.textContent?.trim() || '';
      if (text) {
        messages.push({ content: text, element: el, index: i });
      }
    });

    return messages;
  }

  onMessagesChange(cb: (messages: UserMessage[]) => void): () => void {
    const container = document.querySelector('main') || document.body;

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
    const userTurns = document.querySelectorAll('[data-message-author-role="user"]');
    const el = userTurns[index] as HTMLElement | undefined;
    if (!el) return;
    smoothScrollTo(el);
    highlightElement(el);
  }
}
