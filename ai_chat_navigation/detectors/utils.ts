/**
 * 等待某个 CSS 选择器对应的 DOM 元素出现。
 * 轮询方式，适用于 SPA 页面切换后容器延迟挂载的场景。
 */
export function waitForElement(
  selector: string,
  timeout = 10000,
): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const start = Date.now();
    const timer = setInterval(() => {
      const found = document.querySelector(selector);
      if (found) {
        clearInterval(timer);
        resolve(found);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, 200);
  });
}

/**
 * 平滑滚动到指定元素，居中显示。
 */
export function smoothScrollTo(el: Element): void {
  el.scrollIntoView({ behavior: 'auto', block: 'start' });
}

const HIGHLIGHT_STYLE_ID = '__ai_nav_highlight_style__';

function ensureHighlightKeyframes(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    @keyframes __ai_nav_pulse__ {
      0%   { background-color: rgba(99,102,241,0); transform: scale(1); }
      15%  { background-color: rgba(99,102,241,0.25); transform: scale(1.015); }
      40%  { background-color: rgba(139,92,246,0.18); transform: scale(1.008); }
      70%  { background-color: rgba(99,102,241,0.10); transform: scale(1.003); }
      100% { background-color: rgba(99,102,241,0); transform: scale(1); }
    }
    .__ai_nav_highlight__ {
      animation: __ai_nav_pulse__ 1.4s cubic-bezier(0.22,1,0.36,1) forwards !important;
      border-radius: 6px !important;
      outline: none !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 高亮效果：背景光晕脉冲 + 轻微弹入缩放，整体感强，无边框。
 */
export function highlightElement(el: HTMLElement): void {
  ensureHighlightKeyframes();
  el.classList.remove('__ai_nav_highlight__');
  // 强制重绘，确保重复点击也能触发动画
  void el.offsetWidth;
  el.classList.add('__ai_nav_highlight__');
  el.addEventListener(
    'animationend',
    () => el.classList.remove('__ai_nav_highlight__'),
    { once: true },
  );
}

/**
 * 截断文本，超出 maxLen 字符后加省略号。
 */
export function truncate(text: string, maxLen = 80): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}
