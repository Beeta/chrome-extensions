(() => {
  const state = {
    active: false,
    paragraphs: [],
    currentIndex: 0,
    currentEl: null,
    overlay: null,
  };

  // 收集页面中有效的段落元素
  function collectParagraphs() {
    // 优先用 p 标签；p 太少时 fallback 到不限深度的 div
    let candidates = Array.from(document.querySelectorAll('p'));
    if (candidates.length < 3) {
      candidates = Array.from(document.querySelectorAll(
        'article div, main div, [role="article"] div'
      ));
    }

    const filtered = candidates.filter((el) => {
      const text = (el.innerText || '').trim();
      if (text.length < 10) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width < 200) return false;

      if (el.closest('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]')) return false;
      if (el.closest('script, style, noscript')) return false;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

      return true;
    });

    // 去重：排除内部还包含其他候选段落的父容器，避免父子同时入选
    return filtered.filter(el =>
      !filtered.some(other => el !== other && el.contains(other))
    );
  }

  // 找距离视口中心最近的段落
  function findInitialIndex(paragraphs) {
    const viewportMid = window.scrollY + window.innerHeight / 2;
    let bestIndex = 0;
    let minDist = Infinity;

    paragraphs.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const elMid = window.scrollY + rect.top + rect.height / 2;
      const dist = Math.abs(elMid - viewportMid);
      if (dist < minDist) {
        minDist = dist;
        bestIndex = i;
      }
    });

    return bestIndex;
  }

  // 高亮指定段落并滚动到视口
  function highlight(index) {
    if (state.currentEl) {
      state.currentEl.classList.remove('ri-highlight');
    }

    const el = state.paragraphs[index];
    el.classList.add('ri-highlight');
    state.currentEl = el;
    state.currentIndex = index;

    // 滚到视口中心偏上 1/4 处
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - window.innerHeight * 0.35;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }

  // 导航到相邻段落
  function navigate(delta) {
    const next = state.currentIndex + delta;
    if (next < 0 || next >= state.paragraphs.length) return;

    // SPA 兼容：DOM 已重建时重新收集
    if (!document.contains(state.paragraphs[next])) {
      state.paragraphs = collectParagraphs();
      state.currentIndex = 0;
      if (state.paragraphs.length === 0) return;
      highlight(0);
      return;
    }

    highlight(next);
  }

  // 创建右侧浮层按钮
  function createOverlay() {
    const div = document.createElement('div');
    div.id = 'ri-overlay';
    div.innerHTML = `
      <button id="ri-up" title="上一段 (↑)">↑</button>
      <button id="ri-down" title="下一段 (↓)">↓</button>
    `;
    document.body.appendChild(div);

    div.querySelector('#ri-up').addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(-1);
    });
    div.querySelector('#ri-down').addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(1);
    });

    return div;
  }

  // 键盘事件处理
  function handleKeydown(e) {
    if (!state.active) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigate(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigate(-1);
    }
  }

  // 激活阅读指示器
  function activate() {
    state.paragraphs = collectParagraphs();
    if (state.paragraphs.length === 0) return;

    state.currentIndex = findInitialIndex(state.paragraphs);
    state.overlay = createOverlay();
    highlight(state.currentIndex);
    document.addEventListener('keydown', handleKeydown);
    state.active = true;
  }

  // 停用阅读指示器，清理所有状态
  function deactivate() {
    if (state.currentEl) {
      state.currentEl.classList.remove('ri-highlight');
      state.currentEl = null;
    }
    if (state.overlay) {
      state.overlay.remove();
      state.overlay = null;
    }
    document.removeEventListener('keydown', handleKeydown);
    state.active = false;
    state.paragraphs = [];
    state.currentIndex = 0;
  }

  // 监听来自 background.js 的 TOGGLE 消息
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'TOGGLE') return;
    if (state.active) {
      deactivate();
    } else {
      activate();
    }
  });
})();
