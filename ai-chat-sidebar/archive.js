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
            } catch (e) {
                console.error("Error loading API configuration:", e);
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

        // Detect when user manually scrolls in archive
        const archiveChatContainer = document.querySelector('#panel-archive .chat-detail-view');
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
                if (e.key === 'Enter' && !e.shiftKey) {
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
            let titleText = "Archive";
            const firstUserMsg = chat.find(msg => msg.role === 'user' && msg.parts && msg.parts[0] && msg.parts[0].text);
            const firstModelMsg = chat.find(msg => msg.role === 'model' && msg.parts && msg.parts[0] && msg.parts[0].text);

            if (chat.length === 2 && firstUserMsg && firstModelMsg) {
                titleText = `问答: ${firstUserMsg.parts[0].text.substring(0, 30)}...`;
            } else if (firstUserMsg) {
                titleText = `对话始于: ${firstUserMsg.parts[0].text.substring(0, 30)}...`;
            } else if (firstModelMsg) {
                titleText = `对话始于 (AI): ${firstModelMsg.parts[0].text.substring(0, 30)}...`;
            } else if (chat[0] && chat[0].parts && chat[0].parts[0] && chat[0].parts[0].text) {
                titleText = (chat[0].role === 'user' ? "User: " : "AI: ") + chat[0].parts[0].text.substring(0, 30) + "...";
            }
            return titleText;
        }

        function showListView() {
            // Show list section, hide detail section
            const listSection = document.querySelector('.archive-list-section');
            const detailSection = document.getElementById('archive-detail-section');
            if (listSection) listSection.style.display = '';
            if (detailSection) detailSection.style.display = 'none';
            if (chatDetailContainer) {
                chatDetailContainer.style.display = 'none';
                chatDetailContainer.innerHTML = '';
            }
            if (archiveInputContainer) archiveInputContainer.style.display = 'none';
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

            sortedArchivedChats.forEach((chat) => {
                if (!chat || chat.length === 0) return;

                const chatItem = document.createElement('div');
                chatItem.classList.add('chat-item');

                const titleText = getChatTitle(chat);

                const titleDiv = document.createElement('div');
                titleDiv.classList.add('chat-item-title');
                titleDiv.textContent = titleText;

                const dateDiv = document.createElement('div');
                dateDiv.classList.add('chat-item-date');
                dateDiv.textContent = new Date(chat[0]?.timestamp || Date.now()).toLocaleDateString();

                chatItem.appendChild(titleDiv);
                chatItem.appendChild(dateDiv);

                chatItem.addEventListener('click', () => {
                    renderChatDetails(chat, titleText);
                });

                archivedChatsListDiv.appendChild(chatItem);
            });
        }

        function renderEmptyState() {
            if (chatDetailContainer) {
                chatDetailContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">💬</div>
                        <p>请选择一个对话查看详情</p>
                    </div>
                `;
            }
            if (archiveInputContainer) archiveInputContainer.style.display = 'none';
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
            const msgContainer = document.querySelector('#panel-archive .chat-detail-view');
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
                const msgContainer = document.querySelector('#panel-archive .chat-detail-view');
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

            // Switch to detail view: hide list section, show detail section
            const listSection = document.querySelector('.archive-list-section');
            const detailSection = document.getElementById('archive-detail-section');
            if (listSection) listSection.style.display = 'none';
            if (detailSection) detailSection.style.display = 'flex';
            if (chatDetailContainer) {
                chatDetailContainer.style.display = 'block';
                chatDetailContainer.innerHTML = '';
            }

            // Show input container
            if (archiveInputContainer) archiveInputContainer.style.display = 'block';

            // Back button (返回列表)
            const backBtn = document.createElement('button');
            backBtn.textContent = '← 返回列表';
            backBtn.classList.add('action-btn', 'back-to-list-btn');
            backBtn.style.marginBottom = '12px';
            backBtn.onclick = () => {
                showListView();
            };
            chatDetailContainer.appendChild(backBtn);

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

            deleteBtn.onclick = () => {
                if (confirm(`确定要从存档中删除这个对话 ("${titleText}") 吗？此操作无法撤销。`)) {
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
            });
        }

        function saveArchivedChats() {
            chrome.storage.local.set({ 'geminiArchivedChats': archivedChats });
        }

        if (clearAllArchivedButton) {
            clearAllArchivedButton.addEventListener('click', () => {
                if (confirm("确定要永久删除所有已存档的对话吗？此操作无法撤销。")) {
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
