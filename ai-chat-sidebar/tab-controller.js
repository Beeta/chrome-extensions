// tab-controller.js — Tab 切换控制器
function activateTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(function(panel) {
    panel.classList.toggle('active', panel.id === 'panel-' + tabName);
  });
  // 通知各模块做懒加载初始化
  document.dispatchEvent(new CustomEvent('tab-activated', { detail: tabName }));
}

document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    activateTab(btn.dataset.tab);
  });
});

// 读取 hash 决定初始激活的 tab
var hashTab = location.hash.replace('#', '');
var validTabs = ['settings', 'archive', 'prompts'];
var initialTab = validTabs.indexOf(hashTab) !== -1 ? hashTab : 'settings';
activateTab(initialTab);
