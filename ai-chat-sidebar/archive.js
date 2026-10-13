// g-extension/archive.js
(function () {
    let archiveInitialized = false;

    async function initArchive() {
        let archivedChats = [];
        let currentApiKey = '';
        let currentApiType = 'gemini';
        let currentApiEndpoint = '';
        let currentModelName = 'gemini-1.5-flash';
        let activeChat = null; // Track active chat for sending messages
        let streamingArchiveMessageElement = null; // Track the DOM element being streamed to
        let isArchiveUserScrolling = false; // Track if user has manually scrolled
        let archiveScrollCheckTimeout = null; // Debounce scroll detection

        // --- API Initialization ---
        async function initializeApi() {
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
                }

                if (activeConfig) {
                    currentApiKey = activeConfig.apiKey;
                    currentApiType = activeConfig.apiType;
                    currentApiEndpoint = activeConfig.apiEndpoint || '';
                    currentModelName = activeConfig.modelName;
                }
                updateConfigBar(activeConfig);
            } catch (e) {
                console.error("Error loading API configuration:", e);
            }
        }

        function updateConfigBar(activeConfig) {
            if (!archiveConfigBar) return;
            if (activeConfig) {
                archiveConfigBar.innerHTML = `当前模型：<strong>${escapeHtml(activeConfig.configName)}</strong> · ${escapeHtml(activeConfig.modelName)}`;
            } else {
                archiveConfigBar.innerHTML = `未配置 API，请先到「设置」添加配置`;
            }
        }

        // --- DOM Elements ---
        const chatListContainer = document.getElementById('chat-list');
        const archivedChatsListDiv = chatListContainer; // Alias for compatibility
        const chatDetailContainer = document.getElementById('chat-detail-container');
        const clearAllArchivedButton = document.getElementById('clearAllArchivedButton');
        const archiveInputContainer = document.getElementById('archive-input-container');
        const archiveChatInput = document.getElementById('archive-chat-input');
        const archiveSendBtn = document.getElementById('archive-send-btn');
        const archiveSearchInput = document.getElementById('archive-search');
        const archiveConfigBar = document.getElementById('archive-config-bar');
        let archiveSearchTerm = '';

        // Detect when user manually scrolls in archive
        const archiveChatContainer = chatDetailContainer;
        if (archiveChatContainer) {
            archiveChatContainer.addEventListener('wheel', () => {
                isArchiveUserScrolling = true;
                clearTimeout(archiveScrollCheckTimeout);
                // Reset after 2 seconds of no scrolling
                archiveScrollCheckTimeout = setTimeout(() => {
                    isArchiveUserScrolling = false;
                }, 2000);
            });
        }

        // --- Initialize API ---
        await initializeApi();

        // --- Event Listeners for Chat Input ---
        if (archiveSendBtn) {
            archiveSendBtn.addEventListener('click', handleSendMessage);
        }
        if (archiveChatInput) {
            archiveChatInput.addEventListener('keydown', (e) => {
                // 输入法组合中（如中文输入法输入 zhao 后回车上屏）不触发发送
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    handleSendMessage();
                }
            });
            // Auto-resize textarea
            archiveChatInput.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
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

        function getChatTitle(chat) {
            const firstUserMsg = chat.find(msg => msg.role === 'user' && msg.parts && msg.parts[0] && msg.parts[0].text);
            const firstModelMsg = chat.find(msg => msg.role === 'model' && msg.parts && msg.parts[0] && msg.parts[0].text);
            const src = firstUserMsg || firstModelMsg || (chat[0] && chat[0].parts && chat[0].parts[0] ? chat[0] : null);
            if (src && src.parts && src.parts[0] && src.parts[0].text) {
                const text = src.parts[0].text.trim().replace(/\s+/g, ' ');
                return text.length > 60 ? text.substring(0, 60) + '…' : text;
            }
            return '(空对话)';
        }

        function showListView() {
            // 主从布局：详情区清空并隐藏，列表常驻可见
            if (chatDetailContainer) {
                chatDetailContainer.style.display = 'none';
                chatDetailContainer.innerHTML = '';
            }
            if (archiveInputContainer) archiveInputContainer.style.display = 'none';
            if (archiveConfigBar) archiveConfigBar.classList.remove('visible');
            // 清除列表项高亮
            archivedChatsListDiv.querySelectorAll('.chat-item.active').forEach(el => el.classList.remove('active'));
            activeChat = null;
        }

        function renderArchivedChatsList() {
            if (!archivedChatsListDiv) return;
            archivedChatsListDiv.innerHTML = '';

            if (archivedChats.length === 0) {
                archivedChatsListDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">没有已存档的对话。</div>`;
                return;
            }

            const sortedArchivedChats = [...archivedChats].sort((a, b) => {
                const tsA = a[0]?.timestamp || 0;
                const tsB = b[0]?.timestamp || 0;
                return tsB - tsA;
            });

            const term = archiveSearchTerm.trim().toLowerCase();
            const visibleChats = term
                ? sortedArchivedChats.filter(chat => getChatTitle(chat).toLowerCase().includes(term))
                : sortedArchivedChats;

            if (visibleChats.length === 0) {
                archivedChatsListDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">没有匹配的对话。</div>`;
                return;
            }

            visibleChats.forEach((chat) => {
                if (!chat || chat.length === 0) return;

                const chatItem = document.createElement('div');
                chatItem.classList.add('chat-item');
                if (chat === activeChat) chatItem.classList.add('active');

                const titleText = getChatTitle(chat);

                const titleDiv = document.createElement('div');
                titleDiv.classList.add('chat-item-title');
                titleDiv.textContent = titleText;

                const metaDiv = document.createElement('div');
                metaDiv.classList.add('chat-item-meta');
                const dateSpan = document.createElement('span');
                dateSpan.textContent = new Date(chat[0]?.timestamp || Date.now()).toLocaleDateString();
                const countSpan = document.createElement('span');
                countSpan.textContent = `${chat.length} 条`;
                metaDiv.appendChild(dateSpan);
                metaDiv.appendChild(countSpan);

                chatItem.appendChild(titleDiv);
                chatItem.appendChild(metaDiv);

                chatItem.addEventListener('click', () => {
                    archivedChatsListDiv.querySelectorAll('.chat-item.active').forEach(el => el.classList.remove('active'));
                    chatItem.classList.add('active');
                    renderChatDetails(chat, titleText);
                });

                archivedChatsListDiv.appendChild(chatItem);
            });
        }

        function renderEmptyState() {
            if (chatDetailContainer) {
                chatDetailContainer.style.display = 'block';
                chatDetailContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">💬</div>
                        <p>请从左侧选择一个对话查看详情</p>
                    </div>
                `;
            }
            if (archiveInputContainer) archiveInputContainer.style.display = 'none';
            if (archiveConfigBar) archiveConfigBar.classList.remove('visible');
            activeChat = null;
        }

        // --- API Logic ---
        async function callApi(userMessageContent, currentChat) {
            if (!currentApiKey || !currentModelName) {
                alert("API配置不完整，请在设置中检查。");
                return;
            }

            // Add Thinking Message
            const thinkingMsg = { role: 'model', parts: [{ text: "思考中..." }], timestamp: Date.now(), isThinking: true };
            currentChat.push(thinkingMsg);
            renderChatDetails(currentChat, currentChat[0].parts[0].text.substring(0, 20)); // Re-render to show thinking

            let endpoint = '';
            let requestBody = {};
            let headers = { 'Content-Type': 'application/json' };

            const historyForAPI = currentChat
                .filter(msg => msg.timestamp < thinkingMsg.timestamp && !msg.isTempStatus && !msg.isThinking)
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

            try {
                let responseText = "";
                let thinkingText = "";

                if (currentApiType === 'gemini') {
                    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModelName}:streamGenerateContent?key=${currentApiKey}&alt=sse`;
                    requestBody = { contents: historyForAPI }; // History already includes the new user message

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();

                    // Remove thinking message
                    currentChat.pop();
                    const aiMsg = { role: 'model', parts: [{ text: "" }], thinkingText: '', timestamp: Date.now() };
                    currentChat.push(aiMsg);

                    // Render the chat to create DOM elements, then grab reference to the new message
                    renderChatDetails(currentChat, currentChat[0].parts[0].text.substring(0, 20));
                    // Get the last message element (the one we just added)
                    const allMessages = chatDetailContainer.querySelectorAll('.message');
                    streamingArchiveMessageElement = allMessages[allMessages.length - 1];

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.substring(6).trim();
                                if (dataStr === '[DONE]') break;
                                try {
                                    const data = JSON.parse(dataStr);
                                    if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                                        for (const part of data.candidates[0].content.parts) {
                                            if (part.thought) {
                                                thinkingText += part.text || '';
                                            } else {
                                                responseText += part.text || '';
                                            }
                                        }
                                        aiMsg.parts[0].text = responseText;
                                        aiMsg.thinkingText = thinkingText;
                                        // Update only the streaming message instead of re-rendering
                                        updateStreamingArchiveMessage(responseText, thinkingText);
                                    }
                                } catch (e) { /* ignore parse errors */ }
                            }
                        }
                    }
                } else if (currentApiType === 'openai') {
                    endpoint = currentApiEndpoint;
                    headers['Authorization'] = `Bearer ${currentApiKey}`;
                    requestBody = {
                        model: currentModelName,
                        messages: historyForAPI,
                        stream: true
                    };

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(requestBody)
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();

                    // Remove thinking message
                    currentChat.pop();
                    const aiMsg = { role: 'model', parts: [{ text: "" }], thinkingText: '', timestamp: Date.now() };
                    currentChat.push(aiMsg);

                    // Render the chat to create DOM elements, then grab reference to the new message
                    renderChatDetails(currentChat, currentChat[0].parts[0].text.substring(0, 20));
                    // Get the last message element (the one we just added)
                    const allMessages = chatDetailContainer.querySelectorAll('.message');
                    streamingArchiveMessageElement = allMessages[allMessages.length - 1];

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.substring(6).trim();
                                if (dataStr === '[DONE]') break;
                                try {
                                    const data = JSON.parse(dataStr);
                                    if (data.choices && data.choices[0].delta) {
                                        const delta = data.choices[0].delta;
                                        if (delta.reasoning_content) {
                                            thinkingText += delta.reasoning_content;
                                        } else if (delta.reasoning) {
                                            thinkingText += delta.reasoning;
                                        }
                                        if (delta.content) {
                                            responseText += delta.content;
                                        }
                                        aiMsg.parts[0].text = responseText;
                                        aiMsg.thinkingText = thinkingText;
                                        updateStreamingArchiveMessage(responseText, thinkingText);
                                    }
                                } catch (e) { /* ignore */ }
                            }
                        }
                    }
                }

                // Apply markdown formatting to the final message
                finalizeStreamingArchiveMessage(thinkingText);
                saveArchivedChats(); // Save after response

            } catch (error) {
                console.error("API Error:", error);
                currentChat.pop(); // Remove thinking
                currentChat.push({ role: 'model', parts: [{ text: `Error: ${error.message}` }], timestamp: Date.now() });
                renderChatDetails(currentChat, currentChat[0].parts[0].text.substring(0, 20));
            }
        }

        async function handleSendMessage() {
            const text = archiveChatInput.value.trim();
            if (!text) return;

            if (!activeChat) return;

            archiveChatInput.value = '';
            archiveChatInput.style.height = 'auto';

            // Add User Message
            activeChat.push({ role: 'user', parts: [{ text: text }], timestamp: Date.now() });
            renderChatDetails(activeChat, activeChat[0].parts[0].text.substring(0, 20));

            // Scroll to bottom
            const msgContainer = chatDetailContainer;
            if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

            await callApi(text, activeChat);
        }

        // Efficiently update only the streaming message content
        function updateStreamingArchiveMessage(text, thinkingText) {
            if (!streamingArchiveMessageElement) return;

            const contentWrapper = streamingArchiveMessageElement.querySelector('.message-content');
            if (contentWrapper) {
                let html = '';
                if (thinkingText) {
                    html += `<details class="thinking-block" open><summary>💭 思考过程</summary><div class="thinking-content">${thinkingText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div></details>`;
                }
                html += text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                contentWrapper.innerHTML = html;

                // Auto-scroll if user hasn't manually scrolled
                const msgContainer = chatDetailContainer;
                if (!isArchiveUserScrolling && msgContainer) {
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                }
            }
        }

        // Apply markdown to the final streamed message
        function finalizeStreamingArchiveMessage(thinkingText) {
            if (!streamingArchiveMessageElement) return;

            const contentWrapper = streamingArchiveMessageElement.querySelector('.message-content');
            if (contentWrapper) {
                // Extract only the response text (not the thinking HTML)
                const aiMsg = currentChat[currentChat.length - 1];
                const text = aiMsg ? aiMsg.parts[0].text : '';
                let html = '';
                if (thinkingText) {
                    try {
                        html += `<details class="thinking-block"><summary>💭 思考过程</summary><div class="thinking-content">${marked.parse(thinkingText)}</div></details>`;
                    } catch (e) {
                        html += `<details class="thinking-block"><summary>💭 思考过程</summary><div class="thinking-content">${thinkingText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div></details>`;
                    }
                }
                try {
                    html += marked.parse(text);
                } catch (e) {
                    console.error("Error parsing final markdown:", e);
                    const escaped = text.replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#039;');
                    html += escaped.replace(/\n/g, '<br>');
                }
                contentWrapper.innerHTML = html;
            }
            streamingArchiveMessageElement = null;
            isArchiveUserScrolling = false; // Reset for next stream
        }

        function renderChatDetails(chat, titleText) {
            activeChat = chat; // Set active chat

            // 主从布局：仅切换右侧详情内容，列表常驻
            if (chatDetailContainer) {
                chatDetailContainer.style.display = 'block';
                chatDetailContainer.innerHTML = '';
            }
            if (archiveConfigBar) archiveConfigBar.classList.add('visible');

            // Show input container
            if (archiveInputContainer) archiveInputContainer.style.display = 'block';

            const headerDiv = document.createElement('div');
            headerDiv.classList.add('chat-header');

            const titleH2 = document.createElement('h2');
            titleH2.classList.add('chat-title-large');
            titleH2.textContent = titleText;

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '删除';
            deleteBtn.classList.add('action-btn');
            deleteBtn.style.color = '#ef4444';
            deleteBtn.style.borderColor = '#ef4444';

            deleteBtn.onclick = async () => {
                const ok = await uiConfirm({
                    message: `确定要从存档中删除这个对话吗？此操作无法撤销。`,
                    title: '删除对话'
                });
                if (ok) {
                    const originalIndex = archivedChats.findIndex(originalChat => originalChat === chat);
                    if (originalIndex !== -1) {
                        archivedChats.splice(originalIndex, 1);
                        saveArchivedChats();
                        renderArchivedChatsList();
                        showListView();
                    }
                }
            };

            const actionsDiv = document.createElement('div');
            actionsDiv.appendChild(deleteBtn);

            headerDiv.appendChild(titleH2);
            headerDiv.appendChild(actionsDiv);
            chatDetailContainer.appendChild(headerDiv);

            // Messages
            chat.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.classList.add('message', msg.role === 'user' ? 'user-message' : 'ai-message');

                const roleLabel = msg.role === 'user' ? '你' : 'AI';
                const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const msgHeader = document.createElement('div');
                msgHeader.classList.add('message-header');

                const infoSpan = document.createElement('span');
                infoSpan.textContent = `${roleLabel} • ${timeStr}`;
                msgHeader.appendChild(infoSpan);

                // Copy Button
                const copyBtn = document.createElement('button');
                copyBtn.classList.add('copy-btn');
                copyBtn.innerHTML = '📋'; // Simple icon, can be SVG
                copyBtn.title = 'Copy';
                copyBtn.onclick = async () => {
                    if (msg.parts && msg.parts[0] && typeof msg.parts[0].text === 'string') {
                        try {
                            await navigator.clipboard.writeText(msg.parts[0].text);
                            const originalText = copyBtn.innerHTML;
                            copyBtn.innerHTML = '✅';
                            setTimeout(() => copyBtn.innerHTML = originalText, 2000);
                        } catch (err) {
                            console.error('Failed to copy:', err);
                        }
                    }
                };
                msgHeader.appendChild(copyBtn);

                let contentHtml = '内容不可用';
                if (msg.parts && msg.parts[0] && typeof msg.parts[0].text === 'string') {
                    // Render thinking block if present
                    if (msg.role === 'model' && msg.thinkingText) {
                        try {
                            contentHtml = `<details class="thinking-block"><summary>💭 思考过程</summary><div class="thinking-content">${marked.parse(msg.thinkingText)}</div></details>`;
                        } catch (e) {
                            contentHtml = `<details class="thinking-block"><summary>💭 思考过程</summary><div class="thinking-content">${escapeHtml(msg.thinkingText).replace(/\n/g, '<br>')}</div></details>`;
                        }
                    } else {
                        contentHtml = '';
                    }
                    // Use marked to render Markdown
                    try {
                        contentHtml += marked.parse(msg.parts[0].text);
                    } catch (e) {
                        console.error("Markdown parse error:", e);
                        contentHtml += escapeHtml(msg.parts[0].text).replace(/\n/g, '<br>');
                    }
                }

                // If user message has a quote, render it as a quote card above the message text
                if (msg.role === 'user' && msg.quoteText) {
                    const escapedQuote = escapeHtml(msg.quoteText).replace(/\n/g, '<br>');
                    const truncatedQuote = msg.quoteText.length > 200
                        ? escapeHtml(msg.quoteText.substring(0, 200)).replace(/\n/g, '<br>') + '...'
                        : escapedQuote;
                    contentHtml = `<div class="quote-card"><div class="quote-card-content">${truncatedQuote}</div></div>${contentHtml}`;
                }

                const msgContent = document.createElement('div');
                msgContent.classList.add('message-content', 'markdown-body'); // Add markdown-body class for styling
                msgContent.innerHTML = contentHtml;

                messageDiv.appendChild(msgHeader);
                messageDiv.appendChild(msgContent);
                chatDetailContainer.appendChild(messageDiv);
            });
        }

        function loadArchivedChats() {
            chrome.storage.local.get(['geminiArchivedChats'], (result) => {
                if (result.geminiArchivedChats) {
                    archivedChats = result.geminiArchivedChats;
                } else {
                    archivedChats = [];
                }
                renderArchivedChatsList();
                renderEmptyState();
            });
        }

        function saveArchivedChats() {
            chrome.storage.local.set({ 'geminiArchivedChats': archivedChats });
        }

        if (clearAllArchivedButton) {
            clearAllArchivedButton.addEventListener('click', async () => {
                const ok = await uiConfirm({
                    message: '确定要永久删除所有已存档的对话吗？此操作无法撤销。',
                    title: '清空所有存档',
                    okText: '全部删除'
                });
                if (ok) {
                    archivedChats = [];
                    saveArchivedChats();
                    renderArchivedChatsList();
                    showListView();
                }
            });
        }

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.geminiArchivedChats) {
                archivedChats = changes.geminiArchivedChats.newValue || [];
                renderArchivedChatsList();
                if (archivedChats.length === 0) {
                    showListView();
                }
            }
        });

        if (archiveSearchInput) {
            archiveSearchInput.addEventListener('input', () => {
                archiveSearchTerm = archiveSearchInput.value;
                renderArchivedChatsList();
            });
        }

        loadArchivedChats();
    }

    // 懒加载：首次进入 archive tab 时初始化
    document.addEventListener('tab-activated', (e) => {
        if (e.detail === 'archive' && !archiveInitialized) {
            archiveInitialized = true;
            initArchive();
        }
    });
})();
