// background.js - Service Worker

(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("Background: Failed to set side panel behavior:", error);
  }
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAndSummarizePage") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0].id) {
        sendResponse({ error: "无法确定活动标签页。" });
        return;
      }
      const activeTabId = tabs[0].id;
      const pageUrl = tabs[0].url || '';
      const pageTitle = tabs[0].title || '';

      chrome.tabs.sendMessage(activeTabId, { action: "getPageContentForSummarize" }, (pageResponse) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: "获取页面内容失败 (CS通讯错误): " + chrome.runtime.lastError.message });
          return;
        }
        if (pageResponse && typeof pageResponse.contentForSummary === 'string') {
          sendResponse({
            contentForSummary: pageResponse.contentForSummary,
            pageUrl: pageUrl,
            pageTitle: pageTitle
          });
        } else {
          sendResponse({ error: "未能从页面获取内容 (CS数据无效或格式错误)。" });
        }
      });
    });
    return true;
  } else if (request.action === "openSidePanel") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs.length > 0) {
        try {
          await chrome.sidePanel.open({ windowId: tabs[0].windowId });
          sendResponse({ success: true });
        } catch (error) {
          console.error("Failed to open side panel:", error);
          sendResponse({ success: false, error: error.message });
        }
      }
    });
    return true;
  } else if (request.action === "extractActiveTabContent") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0].id) {
        sendResponse({ success: false, error: "无法确定活动标签页。" });
        return;
      }
      const activeTabId = tabs[0].id;
      const tabUrl = tabs[0].url;

      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('about:') || tabUrl.startsWith('https://chrome.google.com/webstore')) {
        const errMsg = "无法在此类特殊页面上运行脚本。";
        sendResponse({ success: false, error: errMsg });
        chrome.runtime.sendMessage({
          type: "EXTRACT_CONTENT_ERROR",
          message: errMsg
        });
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        files: ["libs/Readability.js", "page_content_extractor.js"]
      }, (injectionResults) => {
        if (chrome.runtime.lastError) {
          const errMsg = "无法注入提取脚本: " + chrome.runtime.lastError.message;
          sendResponse({ success: false, error: errMsg });
          chrome.runtime.sendMessage({
            type: "EXTRACT_CONTENT_ERROR",
            message: errMsg
          });
        } else {
          sendResponse({ success: true });
        }
      });
    });
    return true;
  } else if (request.action === "TEXT_SELECTED_FROM_PAGE") {
    chrome.runtime.sendMessage({ type: "TEXT_SELECTED_FOR_SIDEBAR", text: request.text });
    sendResponse({ status: "Text selected event forwarded" });
    return true;
  }

  return false;
});
