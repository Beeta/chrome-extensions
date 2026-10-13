// ui-confirm.js — 全局确认弹窗，替代原生 confirm()，三页共用。
// 用法: const ok = await uiConfirm({ message, title?, okText?, danger? });
(function () {
  let pendingResolve = null;

  function els() {
    return {
      overlay: document.getElementById('confirmModalOverlay'),
      title: document.getElementById('confirmModalTitle'),
      message: document.getElementById('confirmModalMessage'),
      okBtn: document.getElementById('confirmModalOk'),
      cancelBtn: document.getElementById('confirmModalCancel'),
      closeBtn: document.getElementById('confirmModalClose'),
    };
  }

  function close(result) {
    const { overlay } = els();
    if (overlay) overlay.classList.add('hidden');
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r(result);
    }
  }

  window.uiConfirm = function (opts) {
    const { overlay, title, message, okBtn } = els();
    if (!overlay) {
      // 兜底：弹窗元素缺失时退回原生 confirm
      return Promise.resolve(window.confirm(opts && opts.message || '确定吗？'));
    }
    const o = opts || {};
    title.textContent = o.title || '确认操作';
    message.textContent = o.message || '确定执行此操作吗？';
    okBtn.textContent = o.okText || '确认删除';
    okBtn.classList.toggle('delete-btn', o.danger !== false);
    overlay.classList.remove('hidden');
    okBtn.focus();
    return new Promise((resolve) => { pendingResolve = resolve; });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const { overlay, okBtn, cancelBtn, closeBtn } = els();
    if (!overlay) return;
    okBtn.addEventListener('click', () => close(true));
    cancelBtn.addEventListener('click', () => close(false));
    closeBtn.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener('keydown', (e) => {
      if (overlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    });
  });
})();
