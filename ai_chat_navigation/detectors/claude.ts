import type { DetectorAdapter, UserMessage } from './types';
import { waitForElement, smoothScrollTo, highlightElement } from './utils';

/**
 * Claude.ai 检测器
 *
 * Claude.ai DOM 结构（2024+）：
 * - 用户消息：[data-testid="user-message"] 内的文本
 * - 整体对话容器：包含 role="presentation" 的滚动容器
 *
 * ⚠️ Claude 使用虚拟滚动，长对话时旧消息的 DOM 节点会被销毁。
 * 这里同时保存文本和 DOM 引用，DOM 引用可能失效但文本始终有效。
 */
export class ClaudeDetector implements DetectorAdapter {
  name = 'Claude';
  private observer: MutationObserver | null = null;

  canHandle(): boolean {
    return window.location.hostname === 'claude.ai';
  }

  async init(): Promise<void> {
    // Claude SPA 路由，等待对话容器出现
    await waitForElement('[data-testid="user-message"]') ??
      await waitForElement('.font-claude-message');
  }

  extractUserMessages(): UserMessage[] {
    const messages: UserMessage[] = [];

    // 主选择器
    let userNodes = document.querySelectorAll('[data-testid="user-message"]');

    // 备用选择器（Claude 有时会变动）
    if (userNodes.length === 0) {
      userNodes = document.querySelectorAll('.human-turn-content, .user-message');
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
    // Claude 的消息列表容器
    const container =
      document.querySelector('[data-testid="conversation-content"]') ||
      document.querySelector('.flex-1.overflow-y-auto') ||
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
    let userNodes = document.querySelectorAll('[data-testid="user-message"]');
    if (userNodes.length === 0) {
      userNodes = document.querySelectorAll('.human-turn-content, .user-message');
    }

    const el = userNodes[index] as HTMLElement | undefined;
    if (!el) return;
    smoothScrollTo(el);
    highlightElement(el);
  }
}
