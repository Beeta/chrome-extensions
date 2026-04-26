// g-extension/content_script.js

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContentForSummarize") {
        const content = document.body.innerText;
        sendResponse({ contentForSummary: content });
    } else if (request.type === "SIDEBAR_STATUS") {
        if (request.active) {
            showFloatingCard();
        } else {
            hideFloatingCard();
        }
        sendResponse({ status: "ok" });
    }
    return true;
});

// Listen for text selection — write to session storage so sidebar picks it up reliably
document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
        chrome.storage.session.set({
            selectedTextForSidebar: { text: selectedText, ts: Date.now() }
        });
    }
});

// === Link Drag & Drop Preview Window ===
let previewBox = null;
let currentDraggedLink = null;
let isDraggingLink = false;

// Create floating preview box
function createPreviewBox() {
    if (previewBox) return;

    previewBox = document.createElement('div');
    previewBox.id = 'g-extension-link-preview';
    previewBox.style.display = 'none'; // Hidden by default
    previewBox.innerHTML = `
        <div class="g-preview-header">
            <strong>🔗 链接预览</strong>
            <button class="g-preview-close" title="关闭">×</button>
        </div>
        <div class="g-preview-content">
            <p class="g-preview-hint">拖动链接到这里</p>
            <div class="g-preview-link-info" style="display: none;">
                <p class="g-preview-link-text"></p>
                <button class="g-preview-summarize-btn">总结此链接</button>
            </div>
        </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        #g-extension-link-preview {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 280px;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
        }
        #g-extension-link-preview.drag-over {
            background: #f5f5f5;
            border-color: #000000;
        }
        .g-preview-header {
            padding: 12px 16px;
            background: #000000;
            color: white;
            border-radius: 11px 11px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .g-preview-header strong {
            font-size: 13px;
            font-weight: 600;
        }
        .g-preview-close {
            background: transparent;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
            opacity: 0.8;
        }
        .g-preview-close:hover {
            opacity: 1;
        }
        .g-preview-content {
            padding: 16px;
        }
        .g-preview-hint {
            text-align: center;
            color: #5f6368;
            margin: 20px 0;
            font-size: 13px;
        }
        .g-preview-link-info {
            text-align: center;
        }
        .g-preview-link-text {
            font-size: 12px;
            color: #1a1a1a;
            margin-bottom: 12px;
            word-break: break-all;
            line-height: 1.4;
        }
        .g-preview-summarize-btn {
            background: #000000;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            width: 100%;
        }
        .g-preview-summarize-btn:hover {
            opacity: 0.85;
        }
        @media (prefers-color-scheme: dark) {
            #g-extension-link-preview {
                background: #232323;
                border-color: #3c4043;
            }
            #g-extension-link-preview.drag-over {
                background: #2d2d2d;
                border-color: #ffffff;
            }
            .g-preview-header {
                background: #e8eaed;
                color: #1a1a1a;
            }
            .g-preview-close {
                color: #1a1a1a;
            }
            .g-preview-hint {
                color: #9aa0a6;
            }
            .g-preview-link-text {
                color: #e8eaed;
            }
            .g-preview-summarize-btn {
                background: #e8eaed;
                color: #1a1a1a;
            }
            .g-preview-summarize-btn:hover {
                opacity: 0.85;
            }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(previewBox);

    // Event listeners
    const closeBtn = previewBox.querySelector('.g-preview-close');
    closeBtn.addEventListener('click', () => {
        hidePreviewBox();
    });

    const summarizeBtn = previewBox.querySelector('.g-preview-summarize-btn');
    summarizeBtn.addEventListener('click', async () => {
        if (currentDraggedLink) {
            // Open sidebar first
            await chrome.runtime.sendMessage({ action: 'openSidePanel' });

            // Then send summarize request
            chrome.runtime.sendMessage({
                action: 'summarizeLinkTarget',
                url: currentDraggedLink,
                linkText: currentDraggedLink
            });
            hidePreviewBox();
        }
    });

    // Drag events on preview box
    previewBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        previewBox.classList.add('drag-over');
    });

    previewBox.addEventListener('dragleave', () => {
        previewBox.classList.remove('drag-over');
    });

    previewBox.addEventListener('drop', async (e) => {
        e.preventDefault();
        previewBox.classList.remove('drag-over');

        const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (url && url.startsWith('http')) {
            currentDraggedLink = url;
            showLinkInfo(url);

            // Open sidebar when link is dropped
            await chrome.runtime.sendMessage({ action: 'openSidePanel' });
        }
    });
}

function showPreviewBox() {
    if (!previewBox) createPreviewBox();
    previewBox.style.display = 'block';
    resetPreviewBox();
}

function hidePreviewBox() {
    if (previewBox) {
        previewBox.style.display = 'none';
        resetPreviewBox();
    }
}

function showLinkInfo(url) {
    const hint = previewBox.querySelector('.g-preview-hint');
    const linkInfo = previewBox.querySelector('.g-preview-link-info');
    const linkText = previewBox.querySelector('.g-preview-link-text');

    hint.style.display = 'none';
    linkInfo.style.display = 'block';
    linkText.textContent = url;
}

function resetPreviewBox() {
    if (!previewBox) return;

    const hint = previewBox.querySelector('.g-preview-hint');
    const linkInfo = previewBox.querySelector('.g-preview-link-info');

    hint.style.display = 'block';
    linkInfo.style.display = 'none';
    currentDraggedLink = null;
}

// Listen for drag events on links
document.addEventListener('dragstart', (e) => {
    // Check if dragging a link
    if (e.target.tagName === 'A' && e.target.href) {
        isDraggingLink = true;
        showPreviewBox();
    }
});

document.addEventListener('dragend', () => {
    if (isDraggingLink) {
        isDraggingLink = false;
        // Hide preview box after a delay if no link was dropped
        setTimeout(() => {
            if (!currentDraggedLink) {
                hidePreviewBox();
            }
        }, 300);
    }
});

// Initialize preview box structure when page loads (but keep it hidden)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPreviewBox);
} else {
    createPreviewBox();
}

// === Floating Action Card (summarize / ask) ===
let floatingCard = null;

function createFloatingCard() {
    if (floatingCard) return;

    floatingCard = document.createElement('div');
    floatingCard.id = 'g-extension-floating-card';

    floatingCard.innerHTML = `
        <button class="g-fc-close" title="关闭">×</button>
        <div class="g-fc-body">
            <span class="g-fc-title"></span>
            <button class="g-fc-ask">提问</button>
            <button class="g-fc-summarize">总结</button>
        </div>
    `;

    const style = document.createElement('style');
    style.id = 'g-extension-floating-card-style';
    style.textContent = `
        #g-extension-floating-card {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 14px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.13);
            z-index: 2147483646;
            display: flex;
            align-items: center;
            padding: 10px 14px 10px 18px;
            gap: 10px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            min-width: 0;
            max-width: 480px;
            animation: g-fc-slide-in 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes g-fc-slide-in {
            from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .g-fc-close {
            position: absolute;
            top: -8px;
            right: -8px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #1a1a1a;
            color: #fff;
            border: none;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        }
        .g-fc-body {
            display: flex;
            align-items: center;
            gap: 10px;
            overflow: hidden;
        }
        .g-fc-title {
            color: #1a1a1a;
            font-size: 14px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 220px;
        }
        .g-fc-ask, .g-fc-summarize {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 6px 14px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .g-fc-ask {
            background: #fff;
            color: #1a1a1a;
        }
        .g-fc-ask:hover { background: #f5f5f5; }
        .g-fc-summarize {
            background: #1a1a1a;
            color: #fff;
            border-color: #1a1a1a;
        }
        .g-fc-summarize:hover { opacity: 0.85; }
        @media (prefers-color-scheme: dark) {
            #g-extension-floating-card {
                background: #232323;
                border-color: #3c4043;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            }
            .g-fc-title { color: #e8eaed; }
            .g-fc-ask {
                background: #2d2d2d;
                color: #e8eaed;
                border-color: #5f6368;
            }
            .g-fc-ask:hover { background: #3c3c3c; }
            .g-fc-summarize {
                background: #e8eaed;
                color: #1a1a1a;
                border-color: #e8eaed;
            }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(floatingCard);

    // Update title to current page title
    const titleEl = floatingCard.querySelector('.g-fc-title');
    if (titleEl) titleEl.textContent = document.title || location.hostname;

    floatingCard.querySelector('.g-fc-close').addEventListener('click', () => {
        hideFloatingCard();
    });

    floatingCard.querySelector('.g-fc-ask').addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'openSidePanel' });
        hideFloatingCard();
    });

    floatingCard.querySelector('.g-fc-summarize').addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'openSidePanel' });
        // Give sidebar a moment to mount, then trigger summarize
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'FLOATING_CARD_SUMMARIZE' });
        }, 400);
        hideFloatingCard();
    });
}

function showFloatingCard() {
    // Don't show on chrome:// or extension pages
    if (location.protocol === 'chrome-extension:' || location.href.startsWith('chrome://')) return;
    if (!floatingCard) createFloatingCard();
    // Refresh title in case page title changed
    const titleEl = floatingCard.querySelector('.g-fc-title');
    if (titleEl) titleEl.textContent = document.title || location.hostname;
    floatingCard.style.display = 'flex';
}

function hideFloatingCard() {
    if (floatingCard) floatingCard.style.display = 'none';
}

// On page load, ask background if sidebar is currently active
function checkSidebarStatus() {
    chrome.runtime.sendMessage({ action: 'IS_SIDEBAR_ACTIVE' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.active) {
            showFloatingCard();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkSidebarStatus);
} else {
    checkSidebarStatus();
}
