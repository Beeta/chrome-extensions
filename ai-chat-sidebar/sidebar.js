// g-extension/sidebar.js

// --- 全局变量 ---
let currentApiKey = null;
let currentApiType = 'gemini';
let currentApiEndpoint = '';
let currentModelName = 'gemini-2.0-flash';

let currentChat = [];
let allChats = [];
let archivedChats = [];
let currentSelectedText = null;
let promptTemplates = [];
let promptDragIndex = null; // 拖拽排序时记录起始位置
let streamingMessageElement = null;
let isUserScrolling = false;
let scrollCheckTimeout = null;

// --- DOM 元素获取 ---
let chatOutput, chatInput, sendMessageButton, promptShortcutsContainer;
let inputsDisabled = false;

let pendingPageAttachment = null; // { title, url, tabId }
let pendingPageExtractCallback = null; // called when extractedPageContent arrives
let currentAbortController = null; // active streaming request, for stop-generation

// 内联图标（随 currentColor 适配深浅色，替代原灰色 PNG）
const ICON_SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.388.91L2 9.12c0 .5.374.925.875.985L17 12 2.875 13.9c-.5.06-.875.48-.875.98l-.012 4.61c0 .66.713 1.11 1.4.91z"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const ICON_ARCHIVE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>';


// --- 初始化和API Key加载 ---
async function initialize() {
    chatOutput = document.getElementById('chatOutput');

    // Detect when user manually scrolls
    if (chatOutput) {
        chatOutput.addEventListener('wheel', () => {
            isUserScrolling = true;
            clearTimeout(scrollCheckTimeout);
            // Reset after 2 seconds of no scrolling
            scrollCheckTimeout = setTimeout(() => {
                isUserScrolling = false;
            }, 2000);
        });
    }

    chatInput = document.getElementById('chatInput');
    sendMessageButton = document.getElementById('sendMessageButton');
    promptShortcutsContainer = document.getElementById('promptShortcuts');


    if (typeof marked !== 'object' || marked === null || typeof marked.parse !== 'function') {
        console.warn("Marked Library Test - marked is not an object or marked.parse is not a function.");
    }

    // Load Configuration
    try {
        const result = await chrome.storage.sync.get(['apiConfigurations', 'activeConfigurationId']);
        const configs = result.apiConfigurations || [];
        const activeId = result.activeConfigurationId;

        let activeConfig = null;
        if (activeId && configs.length > 0) {
            activeConfig = configs.find(c => c.id === activeId);
        }
        if (!activeConfig && configs.length > 0) {
            activeConfig = configs[0];
            console.warn("No active configuration found or ID mismatch, defaulting to the first available configuration.");
        }

        if (activeConfig) {
            currentApiKey = activeConfig.apiKey;
            currentApiType = activeConfig.apiType;
            currentApiEndpoint = activeConfig.apiEndpoint || '';
            currentModelName = activeConfig.modelName;
        }
        // 配置是否可用由 isApiConfigured() 判断；未配置时在空状态里引导，不再往对话里塞红色错误
        if (isApiConfigured()) {
            enableInputs();
        } else {
            disableInputs();
        }

    } catch (e) {
        console.error("Sidebar: Error loading API configuration:", e);
        disableInputs();
    }

    await loadArchivedChats();
    loadChatHistory();
    await loadPromptTemplates();

    if (!currentChat || currentChat.length === 0) {
        renderCurrentChat();
    }

    if (sendMessageButton) {
        sendMessageButton.addEventListener('click', () => {
            if (currentAbortController) {
                currentAbortController.abort();
            } else {
                handleSendMessage();
            }
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessageButton.click();
            }
        });
    }

    const addPromptButton = document.getElementById('addPromptButton');
    if (addPromptButton) {
        addPromptButton.addEventListener('click', openPromptsPage);
    }

    const addContextButton = document.getElementById('addContextButton');
    if (addContextButton) {
        addContextButton.addEventListener('click', attachCurrentPage);
    }

    renderContextChips();

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'sync') {
            if (changes.apiConfigurations || changes.activeConfigurationId) {
                const result = await chrome.storage.sync.get(['apiConfigurations', 'activeConfigurationId']);
                const configs = result.apiConfigurations || [];
                const activeId = result.activeConfigurationId;
                let activeConfig = null;

                if (activeId && configs.length > 0) {
                    activeConfig = configs.find(c => c.id === activeId);
                }
                if (!activeConfig && configs.length > 0) {
                    activeConfig = configs[0];
                }

                if (activeConfig) {
                    currentApiKey = activeConfig.apiKey;
                    currentApiType = activeConfig.apiType;
                    currentApiEndpoint = activeConfig.apiEndpoint || '';
                    currentModelName = activeConfig.modelName;
                } else {
                    currentApiKey = null;
                    currentApiType = 'gemini';
                    currentApiEndpoint = '';
                    currentModelName = '';
                }
                if (isApiConfigured()) enableInputs(); else disableInputs();
                renderCurrentChat();
            }
        }
        if (namespace === 'local') {
            if (changes.geminiChatHistory) {
                allChats = (changes.geminiChatHistory.newValue || []).map(chat => chat.filter(msg => !msg.isTempStatus && !msg.isThinking));
            }
            if (changes.geminiArchivedChats) {
                archivedChats = changes.geminiArchivedChats.newValue || [];
            }
            if (changes.promptTemplates) {
                await loadPromptTemplates();
            }
        }
    });
    chrome.runtime.onMessage.addListener(handleRuntimeMessages);
}

async function loadPromptTemplates() {
    const result = await chrome.storage.local.get(['promptTemplates']);
    promptTemplates = (result.promptTemplates && result.promptTemplates.length > 0)
        ? result.promptTemplates
        : [];
    renderPromptShortcuts();
}

function renderPromptShortcuts() {
    if (!promptShortcutsContainer) return;
    promptShortcutsContainer.innerHTML = '';

    // 按存储顺序渲染（支持拖拽自定义排序，不再字母序）
    promptTemplates.forEach((template, index) => {
        const button = document.createElement('button');
        button.classList.add('prompt-shortcut-button');
        button.textContent = template.name;
        button.title = template.content.substring(0, 100) + (template.content.length > 100 ? '...' : '');
        button.draggable = true;
        button.dataset.index = index;
        button.addEventListener('click', () => applyPromptTemplate(template));
        button.addEventListener('dragstart', (e) => {
            promptDragIndex = index;
            button.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        button.addEventListener('dragend', () => button.classList.remove('dragging'));
        button.addEventListener('dragover', (e) => e.preventDefault());
        button.addEventListener('drop', (e) => {
            e.preventDefault();
            reorderPromptTemplates(promptDragIndex, index);
            promptDragIndex = null;
        });
        promptShortcutsContainer.appendChild(button);
    });
}

function reorderPromptTemplates(from, to) {
    if (from === null || from === undefined || from === to) return;
    const arr = [...promptTemplates];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    promptTemplates = arr;
    chrome.storage.local.set({ promptTemplates });
    renderPromptShortcuts();
}

function applyPromptTemplate(template) {
    if (inputsDisabled) return;
    const content = template.content;

    // 已有选中/引用文本：优先用它（不覆盖用户的主动选择）
    if (currentSelectedText) {
        if (content.includes("{{text}}")) {
            const merged = content.replace(/{{text}}/g, currentSelectedText);
            clearSelectedTextPreview();
            chatInput.value = merged;
        } else {
            // 不含占位符：选中文本作为引用上下文，气泡只显示指令
            chatInput.value = content;
        }
        handleSendMessage();
        return;
    }

    // 无选中文本：默认提取"当前网页全文"作为上下文
    chatInput.value = '正在提取页面内容...';
    chatInput.disabled = true;
    pendingPageExtractCallback = (pageContent) => {
        chatInput.disabled = false;
        if (pageContent && content.includes("{{text}}")) {
            // 含占位符：全文替换进指令
            chatInput.value = content.replace(/{{text}}/g, pageContent);
        } else if (pageContent) {
            // 不含占位符：全文作为可折叠引用上下文，气泡只显示指令
            currentSelectedText = pageContent;
            chatInput.value = content;
        } else {
            // 特殊页面(chrome:// / PDF / 商店等)提取失败：退化为只发指令
            chatInput.value = content;
        }
        handleSendMessage();
    };
    chrome.runtime.sendMessage({ action: "extractActiveTabContent" }, (response) => {
        if (chrome.runtime.lastError || (response && response.success === false)) {
            const cb = pendingPageExtractCallback;
            pendingPageExtractCallback = null;
            if (cb) cb(null);
        }
    });
}

function handleClearAllHistory() {
    if (confirm("确定要清除所有对话历史吗？此操作无法撤销。")) {
        allChats = [];
        currentChat = [];
        saveChatHistory();
        renderCurrentChat();
        addMessageToChat({ role: 'model', parts: [{ text: '所有对话历史已清除。' }], timestamp: Date.now() });
    }
}

function openArchivePage() {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#archive') });
}

function openPromptsPage() {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#prompts') });
}

function handleSplitChat() {
    if (inputsDisabled) return;
    const hasRealMessages = currentChat.some(msg => !msg.isThinking && !msg.isTempStatus && !msg.isDivider);
    if (!hasRealMessages) return;

    const divider = { isDivider: true, timestamp: Date.now(), role: 'divider', parts: [{ text: '' }] };
    currentChat.push(divider);
    renderCurrentChat();
    saveCurrentChat();
}


function archiveQaPair(aiMessageIndexInCurrentChat) {
    const aiMessage = currentChat[aiMessageIndexInCurrentChat];
    if (!aiMessage || aiMessage.archived) return;

    let userMessage = null;
    for (let i = aiMessageIndexInCurrentChat - 1; i >= 0; i--) {
        if (currentChat[i].role === 'user' && !currentChat[i].isThinking && !currentChat[i].isTempStatus) {
            userMessage = currentChat[i];
            break;
        }
    }

    if (userMessage && aiMessage) {
        const userMessageCopy = { ...userMessage };
        delete userMessageCopy.archived; delete userMessageCopy.isThinking; delete userMessageCopy.isTempStatus;
        const aiMessageCopy = { ...aiMessage };
        delete aiMessageCopy.archived; delete aiMessageCopy.isThinking; delete aiMessageCopy.isTempStatus;

        const qaPairToArchive = [userMessageCopy, aiMessageCopy];

        archivedChats.unshift(qaPairToArchive);
        saveArchivedChats();

        aiMessage.archived = true;
        renderCurrentChat();
        saveCurrentChat();

        const tempStatusMsg = addMessageToChat({ role: 'model', parts: [{ text: '该问答已存档。' }], timestamp: Date.now(), isTempStatus: true });
        setTimeout(() => {
            const idx = currentChat.findIndex(m => m.timestamp === tempStatusMsg.timestamp && m.isTempStatus);
            if (idx > -1) {
                currentChat.splice(idx, 1);
                renderCurrentChat();
                saveCurrentChat();
            }
        }, 3000);
    } else {
        console.warn("Could not find user message for AI message at index:", aiMessageIndexInCurrentChat);
        const tempErrorMsg = addMessageToChat({ role: 'model', parts: [{ text: '存档失败：未能找到对应的用户问题。' }], timestamp: Date.now(), isTempStatus: true });
        setTimeout(() => {
            const idx = currentChat.findIndex(m => m.timestamp === tempErrorMsg.timestamp && m.isTempStatus);
            if (idx > -1) {
                currentChat.splice(idx, 1);
                renderCurrentChat();
                saveCurrentChat();
            }
        }, 3000);
    }
}


function handleRuntimeMessages(request, sender, sendResponse) {
    switch (request.type || request.action) {
        case 'TEXT_SELECTED_FOR_SIDEBAR':
            currentSelectedText = request.text;
            renderContextChips();
            sendResponse({ status: "Selected text received in sidebar" });
            break;

        case 'extractedPageContent':
            if (pendingPageExtractCallback) {
                const cb = pendingPageExtractCallback;
                pendingPageExtractCallback = null;
                enableInputs();
                if (request.error) {
                    cb(null);
                } else {
                    cb(request.content || null);
                }
                sendResponse({ status: "Page content processed" });
                break;
            }
            removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes('正在提取页面主要内容'));
            if (request.error) {
                addMessageToChat({ role: 'model', parts: [{ text: `提取失败: ${request.error}${request.warning ? ' (' + request.warning + ')' : ''}` }], timestamp: Date.now() });
            } else {
                currentSelectedText = request.content;
                renderContextChips();
                const successMsgText = `✅ 提取成功 (${request.content.length})` + (request.warning ? ` (${request.warning})` : '');
                const successMsg = addMessageToChat({ role: 'model', parts: [{ text: successMsgText }], timestamp: Date.now(), isTempStatus: true });
                setTimeout(() => removeMessageByContentCheck(msg => msg.timestamp === successMsg.timestamp), 6000);
            }
            sendResponse({ status: "Page content processed" });
            break;

        case 'EXTRACT_CONTENT_ERROR':
            removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes('正在提取页面主要内容'));
            addMessageToChat({ role: 'model', parts: [{ text: `提取失败: ${request.message}` }], timestamp: Date.now() });
            sendResponse({ status: "Error notice displayed" });
            break;

        case 'TRIGGER_SIDEBAR_PAGE_SUMMARY':
            handleSummarizeCurrentPage();
            sendResponse({ status: "Sidebar initiated page summary." });
            break;
    }
    return true;
}

function removeMessageByContentCheck(conditionFn) {
    const initialLength = currentChat.length;
    currentChat = currentChat.filter(msg => !conditionFn(msg));
    if (currentChat.length < initialLength) {
        renderCurrentChat();
        return true;
    }
    return false;
}


async function handleSendMessage() {
    const messageText = chatInput.value.trim();
    let userMessageForApi = messageText;
    let displayUserMessageInChat = messageText;
    let quoteTextForChat = null;

    if (currentSelectedText && messageText.includes("{{text}}")) {
        userMessageForApi = messageText.replace(/{{text}}/g, currentSelectedText);
        displayUserMessageInChat = userMessageForApi;
    } else if (currentSelectedText && !messageText.includes("{{text}}") && messageText) {
        const msgStruct = `关于以下引用内容：\n"{quote}"\n\n我的问题/指令是：\n"{msg}"`;
        userMessageForApi = msgStruct.replace('{quote}', currentSelectedText).replace('{msg}', messageText);
        displayUserMessageInChat = messageText;
        quoteTextForChat = currentSelectedText;
    } else if (currentSelectedText && !messageText) {
        userMessageForApi = currentSelectedText;
        displayUserMessageInChat = currentSelectedText;
    }

    if (!userMessageForApi.trim()) {
        const tempMsg = addMessageToChat({ role: 'model', parts: [{ text: '请输入消息或选择文本后再发送。' }], timestamp: Date.now(), isTempStatus: true });
        setTimeout(() => removeMessageByContentCheck(msg => msg.timestamp === tempMsg.timestamp && msg.isTempStatus), 3000);
        return;
    }

    if (!currentApiKey || !currentModelName || (currentApiType === 'openai' && !currentApiEndpoint)) {
        addMessageToChat({ role: 'model', parts: [{ text: '错误：当前活动的API配置不完整。请<a href="#" id="open-options-link">检查插件选项</a>。' }], timestamp: Date.now() });
        disableInputs(); return;
    }

    let finalDisplayMessage = displayUserMessageInChat;
    let finalApiTextMessage = userMessageForApi;

    if (!finalApiTextMessage.trim()) {
        const tempMsg = addMessageToChat({ role: 'model', parts: [{ text: '没有有效内容发送。' }], timestamp: Date.now(), isTempStatus: true });
        setTimeout(() => removeMessageByContentCheck(msg => msg.timestamp === tempMsg.timestamp && msg.isTempStatus), 3000);
        return;
    }

    // If there's a pending page attachment, extract the content first then send
    if (pendingPageAttachment) {
        pendingPageAttachment = null;
        renderContextChips();

        const userMsgObj = { role: 'user', parts: [{ text: finalDisplayMessage }], timestamp: Date.now() };
        if (quoteTextForChat) userMsgObj.quoteText = quoteTextForChat;
        addMessageToChat(userMsgObj);

        chatInput.value = '';
        clearSelectedTextPreview();
        disableInputs();

        const capturedApiMsg = finalApiTextMessage;

        pendingPageExtractCallback = async (pageContent) => {
            let apiMsg = capturedApiMsg;
            if (pageContent) {
                apiMsg = `以下是页面内容：\n\n${pageContent}\n\n用户问题：${capturedApiMsg}`;
            }
            await callApi(apiMsg, false);
        };

        chrome.runtime.sendMessage({ action: "extractActiveTabContent" }, (response) => {
            if (chrome.runtime.lastError || (response && response.success === false)) {
                const cb = pendingPageExtractCallback;
                pendingPageExtractCallback = null;
                enableInputs();
                if (cb) cb(null);
            }
        });
        return;
    }

    const userMsgObj = { role: 'user', parts: [{ text: finalDisplayMessage }], timestamp: Date.now() };
    if (quoteTextForChat) {
        userMsgObj.quoteText = quoteTextForChat;
    }
    addMessageToChat(userMsgObj);

    chatInput.value = '';
    clearSelectedTextPreview();

    await callApi(finalApiTextMessage, false);
}

function handleSummarizeCurrentPage() {
    if (inputsDisabled) return;
    if (!currentApiKey || !currentModelName || (currentApiType === 'openai' && !currentApiEndpoint)) {
        addMessageToChat({ role: 'model', parts: [{ text: '错误：当前活动的API配置不完整。请<a href="#" id="open-options-link">检查插件选项</a>。' }], timestamp: Date.now() });
        disableInputs();
        return;
    }
    const summaryRequestText = '(正在请求总结当前网页...)';
    addMessageToChat({ role: 'user', parts: [{ text: summaryRequestText }], timestamp: Date.now(), isTempStatus: true });

    chrome.runtime.sendMessage({ action: "getAndSummarizePage" }, async (response) => {
        removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text === summaryRequestText);

        if (chrome.runtime.lastError) {
            addMessageToChat({ role: 'model', parts: [{ text: `无法总结 (CS): ${chrome.runtime.lastError.message}` }], timestamp: Date.now() });
            return;
        }

        if (response && typeof response.contentForSummary === 'string') {
            const pageContent = response.contentForSummary;
            if (pageContent.trim() === "") {
                addMessageToChat({ role: 'user', parts: [{ text: '总结请求' }], timestamp: Date.now() });
                addMessageToChat({ role: 'model', parts: [{ text: '页面内容为空或未能提取到有效文本进行总结。' }], timestamp: Date.now() });
                return;
            }
            let prompt = `请使用中文，清晰、简洁且全面地总结以下网页内容。如果内容包含技术信息或代码，请解释其核心概念和用途。如果是一篇文章，请提炼主要观点和论据。总结应易于理解，并抓住内容的精髓。\n\n网页内容如下：\n"${pageContent}"`;

            const pageUrl = response.pageUrl || '';
            const pageTitle = response.pageTitle || '';
            let userMessage = '总结请求';

            if (pageTitle) {
                userMessage += `: "${pageTitle}"`;
            }
            if (pageUrl) {
                userMessage += `\n${pageUrl}`;
            }
            userMessage += `\n(${pageContent.length} characters)`;

            addMessageToChat({ role: 'user', parts: [{ text: userMessage }], timestamp: Date.now() });
            await callApi(prompt, true);
        } else if (response && response.error) {
            addMessageToChat({ role: 'user', parts: [{ text: '总结请求' }], timestamp: Date.now() });
            addMessageToChat({ role: 'model', parts: [{ text: `无法总结: ${response.error}` }], timestamp: Date.now() });
        } else {
            addMessageToChat({ role: 'user', parts: [{ text: '总结请求' }], timestamp: Date.now() });
            addMessageToChat({ role: 'model', parts: [{ text: '总结错误: 从背景脚本收到未知响应。' }], timestamp: Date.now() });
        }
    });
}

function attachCurrentPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        const tab = tabs[0];
        pendingPageAttachment = { title: tab.title || '', url: tab.url || '', tabId: tab.id };
        renderContextChips();
    });
}

function renderContextChips() {
    const container = document.getElementById('contextChips');
    if (!container) return;
    container.innerHTML = '';

    const chips = [];
    if (pendingPageAttachment) {
        chips.push({ kind: 'page', icon: '📄', label: pendingPageAttachment.title || pendingPageAttachment.url || '当前页面' });
    }
    if (currentSelectedText) {
        const preview = currentSelectedText.length > 40 ? currentSelectedText.slice(0, 40) + '…' : currentSelectedText;
        chips.push({ kind: 'selection', icon: '✂', label: preview });
    }

    if (chips.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    chips.forEach(chip => {
        const el = document.createElement('div');
        el.className = 'context-chip context-chip-' + chip.kind;
        el.innerHTML = '<span class="context-chip-icon"></span><span class="context-chip-label"></span><button class="context-chip-remove" title="移除" aria-label="移除此上下文">×</button>';
        el.querySelector('.context-chip-icon').textContent = chip.icon;
        el.querySelector('.context-chip-label').textContent = chip.label;
        el.querySelector('.context-chip-remove').addEventListener('click', () => {
            if (chip.kind === 'page') pendingPageAttachment = null;
            else if (chip.kind === 'selection') currentSelectedText = null;
            renderContextChips();
        });
        container.appendChild(el);
    });
}

function handleExtractContent() {
    if (inputsDisabled) return;
    if (!currentApiKey) {
        addMessageToChat({ role: 'model', parts: [{ text: '错误：当前活动的API配置不完整。请<a href="#" id="open-options-link">检查插件选项</a>。' }], timestamp: Date.now() });
        disableInputs();
        return;
    }

    const tempStatusMsg = addMessageToChat({ role: 'model', parts: [{ text: '正在提取页面主要内容...' }], timestamp: Date.now(), isTempStatus: true });

    chrome.runtime.sendMessage({ action: "extractActiveTabContent" }, (response) => {
        if (chrome.runtime.lastError || (response && !response.success)) {
            removeMessageByContentCheck(msg => msg.timestamp === tempStatusMsg.timestamp);
            const errorMessage = response?.error || chrome.runtime.lastError?.message || "Unknown";
            addMessageToChat({ role: 'model', parts: [{ text: `提取失败: ${errorMessage}` }], timestamp: Date.now() });
        }
    });
}


function disableInputs() {
    inputsDisabled = true;
    if (chatInput) chatInput.disabled = true;
    if (sendMessageButton) sendMessageButton.disabled = true;
}

function enableInputs() {
    inputsDisabled = false;
    if (chatInput) chatInput.disabled = false;
    if (sendMessageButton) sendMessageButton.disabled = false;
}

// 流式生成期间把发送按钮切换为"停止"态（可点击中断），并锁住输入
function setStreamingUI(on) {
    inputsDisabled = on;
    if (chatInput) chatInput.disabled = on;
    if (!sendMessageButton) return;
    if (on) {
        sendMessageButton.classList.add('is-stop');
        sendMessageButton.title = '停止生成';
        sendMessageButton.setAttribute('aria-label', '停止生成');
        sendMessageButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"></rect></svg>';
    } else {
        sendMessageButton.classList.remove('is-stop');
        sendMessageButton.title = '发送';
        sendMessageButton.setAttribute('aria-label', '发送');
        sendMessageButton.innerHTML = ICON_SEND;
    }
}

async function callApi(userMessageContent, isSummary = false) {
    if (!currentApiKey || !currentModelName || (currentApiType === 'openai' && !currentApiEndpoint)) {
        addMessageToChat({ role: 'model', parts: [{ text: '错误：当前活动的API配置不完整。请<a href="#" id="open-options-link">检查插件选项</a>。' }], timestamp: Date.now() });
        return;
    }

    const thinkingMessage = addMessageToChat({ role: 'model', parts: [{ text: '正在思考中...' }], timestamp: Date.now(), isThinking: true });

    let endpoint = '';
    let requestBody = {};
    let headers = { 'Content-Type': 'application/json' };

    const messagesBeforeThinking = currentChat.filter(
        msg => msg.timestamp < thinkingMessage.timestamp && !msg.isTempStatus && !msg.isThinking && !msg.archived
    );
    const lastDividerIdx = messagesBeforeThinking.reduce((acc, msg, i) => msg.isDivider ? i : acc, -1);
    const historyForAPI = messagesBeforeThinking
        .slice(lastDividerIdx + 1)
        .filter(msg => !msg.isDivider)
        .map(msg => {
            const textContent = msg.parts.map(part => part.text).join('\n');
            if (currentApiType === 'openai') {
                return {
                    role: msg.role === 'model' ? 'assistant' : msg.role,
                    content: textContent
                };
            } else { // Gemini
                return {
                    role: msg.role,
                    parts: [{ text: textContent }]
                };
            }
        });

    // ----- Specific API Request Construction -----
    try {
        if (currentApiType === 'gemini') {
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModelName}:streamGenerateContent?key=${currentApiKey}&alt=sse`;
            const geminiUserParts = [];
            if (userMessageContent && userMessageContent.trim() !== "") {
                geminiUserParts.push({ text: userMessageContent });
            }
            if (geminiUserParts.length === 0) throw new Error("没有内容可以发送给AI。");
            requestBody = { contents: [...historyForAPI, { role: "user", parts: geminiUserParts }] };

        } else if (currentApiType === 'openai') {
            endpoint = currentApiEndpoint;
            headers['Authorization'] = `Bearer ${currentApiKey}`;
            const openaiCurrentUserMessageContent = [];
            if (userMessageContent && userMessageContent.trim() !== "") {
                openaiCurrentUserMessageContent.push({ type: "text", text: userMessageContent });
            }
            if (openaiCurrentUserMessageContent.length === 0) throw new Error("没有内容可以发送给AI。");
            requestBody = {
                model: currentModelName,
                messages: [...historyForAPI, { role: "user", content: openaiCurrentUserMessageContent }],
                stream: true
            };
        } else {
            throw new Error(`API "${currentApiType}" not supported.`);
        }
    } catch (error) {
        removeMessageByContentCheck(msg => msg.isThinking && msg.timestamp === thinkingMessage.timestamp);
        addMessageToChat({ role: 'model', parts: [{ text: `请求构建失败: ${error.message}` }], timestamp: Date.now() });
        return;
    }

    // ----- API Call and Streaming Response Handling -----
    currentAbortController = new AbortController();
    setStreamingUI(true);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: currentAbortController.signal
        });

        removeMessageByContentCheck(msg => msg.isThinking && msg.timestamp === thinkingMessage.timestamp);

        if (!response.ok) {
            let friendlyErrorMessage = '';
            const errorText = await response.text();
            let errorDetails = '';
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson.error?.message || JSON.stringify(errorJson.error);
            } catch {
                errorDetails = errorText.substring(0, 200) + (errorText.length > 200 ? '...' : '');
            }

            switch (response.status) {
                case 401:
                case 403:
                    friendlyErrorMessage = `API 认证失败 (${response.status}). <a href="#" id="open-options-link">Check Config</a>.<br><small>${errorDetails}</small>`;
                    break;
                case 429:
                    friendlyErrorMessage = `API 请求频率超限 (429).<br><small>${errorDetails}</small>`;
                    break;
                case 500:
                case 502:
                case 503:
                case 504:
                    friendlyErrorMessage = `AI 服务端出现临时错误 (${response.status}).<br><small>${errorDetails}</small>`;
                    break;
                default:
                    friendlyErrorMessage = `API 调用失败 (${response.status}).<br><small>${errorDetails}</small>`;
            }
            addMessageToChat({ role: 'model', parts: [{ text: friendlyErrorMessage }], timestamp: Date.now() });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiResponseText = '';
        let aiThinkingText = '';
        let aiMessage = null;
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim() === '' || !line.startsWith('data: ')) continue;

                const jsonStr = line.substring(6);
                if (jsonStr === '[DONE]') break;

                try {
                    const data = JSON.parse(jsonStr);
                    let chunkText = '';
                    let chunkThinking = '';

                    if (currentApiType === 'gemini') {
                        if (data.candidates && data.candidates[0]?.content?.parts) {
                            for (const part of data.candidates[0].content.parts) {
                                if (part.thought) {
                                    chunkThinking += part.text || '';
                                } else {
                                    chunkText += part.text || '';
                                }
                            }
                        }
                    } else if (currentApiType === 'openai') {
                        if (data.choices && data.choices[0]?.delta) {
                            const delta = data.choices[0].delta;
                            if (delta.reasoning_content) {
                                chunkThinking = delta.reasoning_content;
                            } else if (delta.reasoning) {
                                chunkThinking = delta.reasoning;
                            }
                            if (delta.content) {
                                chunkText = delta.content;
                            }
                        }
                    }

                    if (chunkThinking || chunkText) {
                        if (!aiMessage) {
                            aiMessage = addMessageToChat({ role: 'model', parts: [{ text: '' }], thinkingText: '', timestamp: Date.now() });
                            // Store reference to the DOM element for this streaming message
                            streamingMessageElement = chatOutput.lastElementChild;
                        }
                        if (chunkThinking) {
                            aiThinkingText += chunkThinking;
                            aiMessage.thinkingText = aiThinkingText;
                        }
                        if (chunkText) {
                            aiResponseText += chunkText;
                            aiMessage.parts[0].text = aiResponseText;
                        }
                        // Update only the streaming message instead of re-rendering all
                        updateStreamingMessage(aiResponseText, aiThinkingText);
                    }
                } catch (error) {
                    console.warn('Error parsing stream chunk:', error, 'Chunk:', jsonStr);
                }
            }
        }

        if (aiMessage) {
            if (currentApiType === 'gemini' && buffer.startsWith('data: ')) {
                try {
                    const finalJson = JSON.parse(buffer.substring(6));
                    if (finalJson.promptFeedback?.blockReason) {
                        aiMessage.parts[0].text += `\n\n[Block Reason: ${finalJson.promptFeedback.blockReason}]`;
                        updateStreamingMessage(aiMessage.parts[0].text, aiThinkingText);
                    }
                } catch (e) { /* Ignore if buffer is not valid JSON */ }
            }
            // Apply markdown formatting to the final message
            finalizeStreamingMessage(aiResponseText, aiThinkingText);
            saveCurrentChat();
        } else {
            addMessageToChat({ role: 'model', parts: [{ text: 'API返回了空的流式响应。请检查API服务商的状态或稍后再试。' }], timestamp: Date.now() });
        }

    } catch (error) {
        removeMessageByContentCheck(msg => msg.isThinking && msg.timestamp === thinkingMessage.timestamp);
        if (error.name === 'AbortError') {
            // 用户主动停止：保留已生成的部分内容
            if (streamingMessageElement) {
                finalizeStreamingMessage();
                saveCurrentChat();
            }
            return;
        }
        console.error(`Error calling or streaming from ${currentApiType} API:`, error);
        let friendlyError = '与API通讯时发生错误。';
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            friendlyError = '网络连接失败。请检查您的网络连接并重试。';
        } else {
            friendlyError += ` ${error.message}`;
        }
        addMessageToChat({ role: 'model', parts: [{ text: friendlyError }], timestamp: Date.now() });
    } finally {
        setStreamingUI(false);
        currentAbortController = null;
    }
}


function addMessageToChat(message) {
    if (!message.parts || !Array.isArray(message.parts) || message.parts.some(p => typeof p.text !== 'string')) {
        if (typeof message.text === 'string') {
            message.parts = [{ text: message.text }];
        } else if (message.parts && typeof message.parts.text === 'string') {
            message.parts = [{ text: message.parts.text }];
        }
        else {
            console.warn("Correcting invalid message structure for chat:", message);
            message.parts = [{ text: "Invalid message" }];
        }
    }

    if (message.isTempStatus && message.parts[0].text.includes('正在提取页面主要内容')) {
        removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes('正在提取页面主要内容'));
    }

    const messageWithTimestamp = { ...message, timestamp: message.timestamp || Date.now() };
    currentChat.push(messageWithTimestamp);
    renderCurrentChat();
    if (!message.isTempStatus && !message.isThinking) {
        saveCurrentChat();
    }
    return messageWithTimestamp;
}

// Efficiently update only the streaming message content
function updateStreamingMessage(text, thinkingText) {
    if (!streamingMessageElement) return;

    const contentWrapper = streamingMessageElement.querySelector('.message-content-wrapper');
    if (contentWrapper) {
        let html = '';

        // Render thinking content as a collapsible details block
        if (thinkingText) {
            let thinkingHtml = '';
            try {
                thinkingHtml = marked.parse(thinkingText);
            } catch (e) {
                thinkingHtml = escapeHtml(thinkingText).replace(/\n/g, '<br>');
            }
            html += `<details class="thinking-block" open><summary>💭 思考过程</summary><div class="thinking-content">${thinkingHtml}</div></details>`;
        }

        // Render main response
        if (text) {
            try {
                html += marked.parse(text);
            } catch (e) {
                html += escapeHtml(text).replace(/\n/g, '<br>');
            }
        }

        contentWrapper.innerHTML = html;

        // Auto-scroll if user hasn't manually scrolled
        if (!isUserScrolling && chatOutput) {
            chatOutput.scrollTop = chatOutput.scrollHeight;
        }
    }
}

// Apply markdown to the final streamed message
function finalizeStreamingMessage(rawText, thinkingText) {
    if (!streamingMessageElement) return;

    streamingMessageElement = null;
    isUserScrolling = false;
    // Re-render the full chat so action buttons are injected with correct text content
    renderCurrentChat();
}

function isApiConfigured() {
    return !!(currentApiKey && currentModelName && (currentApiType !== 'openai' || currentApiEndpoint));
}

function renderWelcome() {
    const wrap = document.createElement('div');
    wrap.className = 'welcome-state';
    if (!isApiConfigured()) {
        wrap.innerHTML = `
            <div class="welcome-icon">⚙️</div>
            <div class="welcome-title">欢迎使用智能侧边栏</div>
            <div class="welcome-desc">开始前，先配置一个 AI 服务（Gemini 或 OpenAI 兼容接口）。</div>
            <button class="welcome-btn" id="welcomeConfigBtn">去配置 API</button>`;
        chatOutput.appendChild(wrap);
        wrap.querySelector('#welcomeConfigBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
        return;
    }
    wrap.innerHTML = `
        <div class="welcome-icon">💬</div>
        <div class="welcome-title">有什么可以帮你？</div>
        <div class="welcome-desc">直接提问，或在网页上划词、点回形针附加当前页作为上下文。</div>
        <div class="welcome-examples"></div>`;
    const exWrap = wrap.querySelector('.welcome-examples');
    ['总结这个页面的要点', '把选中的内容翻译成英文', '这段代码是做什么的？'].forEach(ex => {
        const b = document.createElement('button');
        b.className = 'welcome-example';
        b.textContent = ex;
        b.addEventListener('click', () => {
            if (chatInput) { chatInput.value = ex; chatInput.focus(); }
        });
        exWrap.appendChild(b);
    });
    chatOutput.appendChild(wrap);
}

function renderCurrentChat() {
    if (!chatOutput) return;
    chatOutput.innerHTML = '';
    const hasContent = currentChat.some(msg => !msg.isDivider);
    if (!hasContent) {
        renderWelcome();
        return;
    }
    currentChat.forEach((msg, index) => {
        if (msg.isDivider) {
            const dividerEl = document.createElement('div');
            dividerEl.classList.add('chat-divider');
            const line = document.createElement('div');
            line.classList.add('chat-divider-line');
            const label = document.createElement('span');
            label.classList.add('chat-divider-label');
            label.textContent = '新对话';
            dividerEl.appendChild(line);
            dividerEl.appendChild(label);
            dividerEl.appendChild(line.cloneNode());
            chatOutput.appendChild(dividerEl);
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', msg.role === 'user' ? 'user' : 'ai');
        if (msg.isTempStatus) messageDiv.classList.add('temporary-status');
        if (msg.isThinking) messageDiv.classList.add('thinking-status');

        let contentHtml = '';
        const textContent = (msg.parts && msg.parts[0] && typeof msg.parts[0].text === 'string') ? msg.parts[0].text : "";
        const thinkingContent = msg.thinkingText || "";

        if (msg.role === 'model' && typeof marked !== 'undefined' && typeof marked.parse === 'function' && !msg.isTempStatus && !msg.isThinking) {
            // Render thinking block if present
            if (thinkingContent) {
                let thinkingHtml = '';
                try {
                    thinkingHtml = marked.parse(thinkingContent);
                } catch (e) {
                    thinkingHtml = escapeHtml(thinkingContent).replace(/\n/g, '<br>');
                }
                contentHtml += `<details class="thinking-block"><summary>💭 思考过程</summary><div class="thinking-content">${thinkingHtml}</div></details>`;
            }
            // Render main response
            try {
                contentHtml += marked.parse(textContent);
            } catch (e) {
                console.error("Error parsing markdown:", e, "for text:", textContent);
                contentHtml += escapeHtml(textContent).replace(/\n/g, '<br>');
            }
        } else {
            contentHtml = escapeHtml(textContent).replace(/\n/g, '<br>');
        }

        // If user message has a quote, render it as a quote card above the message text
        if (msg.role === 'user' && msg.quoteText) {
            const escapedQuote = escapeHtml(msg.quoteText).replace(/\n/g, '<br>');
            const truncatedQuote = msg.quoteText.length > 200
                ? escapeHtml(msg.quoteText.substring(0, 200)).replace(/\n/g, '<br>') + '...'
                : escapedQuote;
            contentHtml = `<div class="quote-card"><div class="quote-card-content">${truncatedQuote}</div></div>${contentHtml}`;
        }

        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('message-content-wrapper');
        contentWrapper.innerHTML = contentHtml;
        messageDiv.appendChild(contentWrapper);

        const optionsLink = contentWrapper.querySelector('#open-options-link');
        if (optionsLink) {
            optionsLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.runtime.openOptionsPage();
            });
        }

        const footerDiv = document.createElement('div');
        footerDiv.classList.add('message-footer');

        const timestampSpan = document.createElement('span');
        timestampSpan.classList.add('timestamp');
        timestampSpan.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Only AI messages get action buttons
        if (msg.role === 'model' && !msg.isThinking && !msg.isTempStatus && textContent) {
            const actionsContainer = document.createElement('div');
            actionsContainer.classList.add('message-actions');

            // Copy button with icon
            const copyElement = document.createElement('span');
            copyElement.classList.add('copy-action');
            copyElement.innerHTML = ICON_COPY;
            copyElement.title = '复制';
            copyElement.setAttribute('role', 'button');
            copyElement.setAttribute('tabindex', '0');
            copyElement.setAttribute('aria-label', '复制');
            copyElement.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyElement.click(); } };
            copyElement.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(textContent).then(() => {
                    copyElement.innerHTML = '✅';
                    setTimeout(() => {
                        copyElement.innerHTML = ICON_COPY;
                    }, 1500);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            };
            actionsContainer.appendChild(copyElement);

            // Archive button with icon
            if (!msg.archived) {
                const archiveElement = document.createElement('span');
                archiveElement.classList.add('archive-action');
                archiveElement.innerHTML = ICON_ARCHIVE;
                archiveElement.title = '归档';
                archiveElement.setAttribute('role', 'button');
                archiveElement.setAttribute('tabindex', '0');
                archiveElement.setAttribute('aria-label', '归档');
                archiveElement.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); archiveElement.click(); } };
                archiveElement.onclick = (e) => {
                    e.stopPropagation();
                    archiveQaPair(index);
                };
                actionsContainer.appendChild(archiveElement);
            } else {
                const archivedTextSpan = document.createElement('span');
                archivedTextSpan.classList.add('archived-text');
                archivedTextSpan.textContent = '已归档';
                actionsContainer.appendChild(archivedTextSpan);
            }

            footerDiv.appendChild(actionsContainer);
            footerDiv.appendChild(timestampSpan);
            messageDiv.appendChild(footerDiv);
        } else if (msg.role === 'user') {
            // User messages: no footer at all
        } else {
            // Thinking / temp status messages: just timestamp
            footerDiv.appendChild(timestampSpan);
            messageDiv.appendChild(footerDiv);
        }

        chatOutput.appendChild(messageDiv);
    });
    if (chatOutput.scrollHeight > chatOutput.clientHeight) {
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function clearSelectedTextPreview() {
    currentSelectedText = null;
    renderContextChips();
}

function saveChatHistory() {
    const cleanAllChats = allChats.map(chat =>
        chat.filter(msg => !msg.isTempStatus && !msg.isThinking)
    ).filter(chat => chat.length > 0);
    chrome.storage.local.set({ 'geminiChatHistory': cleanAllChats });
}

function saveCurrentChat() {
    const chatToStore = currentChat.filter(msg => !(msg.isThinking || msg.isTempStatus));

    let existingChatIndex = -1;
    if (chatToStore.length > 0 && allChats.length > 0) {
        const firstMessageTimestamp = chatToStore[0].timestamp;
        existingChatIndex = allChats.findIndex(
            histChat => histChat.length > 0 && histChat[0].timestamp === firstMessageTimestamp
        );
    }

    if (chatToStore.length > 0) {
        if (existingChatIndex !== -1) {
            allChats[existingChatIndex] = [...chatToStore];
        } else {
            allChats.unshift([...chatToStore]);
        }
    }

    if (allChats.length > 50) {
        allChats = allChats.slice(0, 50);
    }
    saveChatHistory();
}


async function loadChatHistory() {
    return new Promise(resolve => {
        chrome.storage.local.get(['geminiChatHistory'], (result) => {
            if (result.geminiChatHistory) {
                allChats = result.geminiChatHistory.map(chat =>
                    chat.filter(msg => msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string' && !msg.isTempStatus && !msg.isThinking)
                ).filter(chat => chat.length > 0);
            } else {
                allChats = [];
            }

            // Always start a new empty conversation when sidebar opens
            currentChat = [];
            renderCurrentChat();
            resolve();
        });
    });
}

async function loadArchivedChats() {
    return new Promise(resolve => {
        chrome.storage.local.get(['geminiArchivedChats'], (result) => {
            if (result.geminiArchivedChats) {
                archivedChats = result.geminiArchivedChats;
            } else {
                archivedChats = [];
            }
            resolve();
        });
    });
}

function saveArchivedChats() {
    const cleanArchivedChats = archivedChats.map(chat =>
        chat.map(msg => {
            const { isThinking, isTempStatus, ...rest } = msg;
            return rest;
        })
    );
    chrome.storage.local.set({ 'geminiArchivedChats': cleanArchivedChats });
}

document.addEventListener('DOMContentLoaded', initialize);

document.addEventListener('click', function (event) {
    if (event.target.tagName === 'A' && event.target.href && event.target.href.startsWith('http')) {
        event.preventDefault();
        chrome.tabs.create({ url: event.target.href });
    }
});

// === Hamburger Menu Logic ===
document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('hamburgerButton');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    if (!hamburgerBtn || !hamburgerMenu) return;

    let overlay = null;

    function openMenu() {
        hamburgerMenu.style.display = 'block';
        overlay = document.createElement('div');
        overlay.className = 'hamburger-overlay';
        overlay.addEventListener('click', closeMenu);
        document.body.appendChild(overlay);
    }

    function closeMenu() {
        hamburgerMenu.style.display = 'none';
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
            overlay = null;
        }
    }

    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hamburgerMenu.style.display === 'none') {
            openMenu();
        } else {
            closeMenu();
        }
    });

    // Menu items -> call handlers directly
    document.getElementById('menuSummarizePage')?.addEventListener('click', () => {
        closeMenu();
        handleSummarizeCurrentPage();
    });
    document.getElementById('menuExtractContent')?.addEventListener('click', () => {
        closeMenu();
        handleExtractContent();
    });
    document.getElementById('menuSplitChat')?.addEventListener('click', () => {
        closeMenu();
        handleSplitChat();
    });
    document.getElementById('menuViewHistory')?.addEventListener('click', () => {
        closeMenu();
        openHistoryPanel();
    });
    document.getElementById('menuViewArchived')?.addEventListener('click', () => {
        closeMenu();
        openArchivePage();
    });
    document.getElementById('menuManagePrompts')?.addEventListener('click', () => {
        closeMenu();
        openPromptsPage();
    });
    document.getElementById('menuClearHistory')?.addEventListener('click', () => {
        closeMenu();
        handleClearAllHistory();
    });
    document.getElementById('menuSettings')?.addEventListener('click', () => {
        closeMenu();
        chrome.runtime.openOptionsPage();
    });
});

// === History Panel Logic ===
function getChatTitle(chat) {
    const firstUser = chat.find(m => m.role === 'user' && !m.isDivider && m.parts?.[0]?.text);
    if (!firstUser) return '（空对话）';
    const text = firstUser.parts[0].text;
    return text.length > 40 ? text.slice(0, 40) + '…' : text;
}

function getChatDate(chat) {
    const first = chat.find(m => m.timestamp);
    if (!first) return '';
    return new Date(first.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function openHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    const list = document.getElementById('historyList');
    if (!panel || !list) return;

    list.innerHTML = '';

    const chats = allChats.filter(c => c.some(m => m.role === 'user' && !m.isDivider));
    if (chats.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'history-item-empty';
        empty.textContent = '暂无历史对话';
        list.appendChild(empty);
    } else {
        chats.forEach((chat, idx) => {
            const item = document.createElement('div');
            item.className = 'history-item';

            const titleEl = document.createElement('div');
            titleEl.className = 'history-item-title';
            titleEl.textContent = getChatTitle(chat);

            const metaEl = document.createElement('div');
            metaEl.className = 'history-item-meta';
            const msgCount = chat.filter(m => !m.isDivider && !m.isTempStatus).length;
            metaEl.textContent = `${getChatDate(chat)}  ·  ${msgCount} 条消息`;

            item.appendChild(titleEl);
            item.appendChild(metaEl);
            item.addEventListener('click', () => {
                loadHistoryChat(chat);
                closeHistoryPanel();
            });
            list.appendChild(item);
        });
    }

    panel.style.display = 'flex';
    document.getElementById('historyPanelClose').onclick = closeHistoryPanel;
}

function closeHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    if (panel) panel.style.display = 'none';
}

function loadHistoryChat(chat) {
    currentChat = [...chat];
    renderCurrentChat();
    saveCurrentChat();
}