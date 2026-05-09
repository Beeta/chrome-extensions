// content_script.js

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContentForSummarize") {
        const content = document.body.innerText;
        sendResponse({ contentForSummary: content });
    }
    return true;
});

// Listen for text selection to send to sidebar
document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
        chrome.runtime.sendMessage({
            action: "TEXT_SELECTED_FROM_PAGE",
            text: selectedText
        });
    }
});
