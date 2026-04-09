import type { DetectorAdapter, UserMessage } from './types';
import { waitForElement, smoothScrollTo, highlightElement } from './utils';

/**
 * Google Gemini 检测器
 *
 * Gemini DOM 结构（2024+）：
 * - 用户消息：.user-query 或 .query-content 内的文本
 * - 容器：.conversation-container 或 infinite-scroller
 */
export class GeminiDetector implements DetectorAdapter {
  name = 'Gemini';
  private observer: MutationObserver | null = null;

  canHandle(): boolean {
    return window.location.hostname === 'gemini.google.com';
  }

  async init(): Promise<void> {
    await waitForElement('infinite-scroller, .conversation-container, .user-query-container');
  }

  extractUserMessages(): UserMessage[] {
    const messages: UserMessage[] = [];

    // Gemini 用户消息的选择器（按优先级尝试）
    let userNodes = document.querySelectorAll('.user-query-container .query-text');

    if (userNodes.length === 0) {
      userNodes = document.querySelectorAll('.user-query p, .query-content');
    }

    userNodes.forEach((el, i) => {
      const text = el.textContent?.trim() || '';
      if (text) {
        messages.push({ content: text, element: el, index: i });
      }
    });

    return messages;
  }

  onMessagesChange(cb: (messages: UserMessage[]) => void): () => void {
    const container =
      document.querySelector('infinite-scroller') ||
      document.querySelector('.conversation-container') ||
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
    let userNodes = document.querySelectorAll('.user-query-container .query-text');
    if (userNodes.length === 0) {
      userNodes = document.querySelectorAll('.user-query p, .query-content');
    }

    const el = userNodes[index] as HTMLElement | undefined;
    if (!el) return;
    smoothScrollTo(el);
    highlightElement(el);
  }
}
