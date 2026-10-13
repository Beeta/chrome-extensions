// g-extension/prompts.js
(function () {
    let promptsInitialized = false;

    async function initPrompts() {
        const promptListDiv = document.getElementById('promptList');
        const promptIdInput = document.getElementById('promptId');
        const promptNameInput = document.getElementById('promptName');
        const promptContentInput = document.getElementById('promptContent');
        const savePromptButton = document.getElementById('savePromptButton');
        const clearFormButton = document.getElementById('promptClearFormButton');
        const addPromptEntryButton = document.getElementById('addPromptEntryButton');
        // 弹窗相关
        const promptModalOverlay = document.getElementById('promptModalOverlay');
        const promptModalTitle = document.getElementById('promptModalTitle');
        const promptModalClose = document.getElementById('promptModalClose');

        let prompts = [];


        async function loadPrompts() {
            const result = await chrome.storage.local.get(['promptTemplates']);
            prompts = result.promptTemplates ? [...result.promptTemplates] : [];
            renderPrompts();
        }

        async function savePrompts() {
            await chrome.storage.local.set({ promptTemplates: prompts });
        }

        function renderPrompts() {
            promptListDiv.innerHTML = '';
            if (prompts.length === 0) {
                promptListDiv.innerHTML = `<p>还没有模板，请添加一个。</p>`;
                return;
            }

            prompts.forEach(prompt => {
                const itemDiv = document.createElement('div');
                itemDiv.classList.add('prompt-item');
                itemDiv.dataset.id = prompt.id;

                const headerDiv = document.createElement('div');
                headerDiv.classList.add('prompt-item-header');

                const nameSpan = document.createElement('span');
                nameSpan.classList.add('prompt-item-name');
                nameSpan.textContent = prompt.name;
                headerDiv.appendChild(nameSpan);

                const actionsDiv = document.createElement('div');
                actionsDiv.classList.add('prompt-item-actions');

                const editButton = document.createElement('button');
                editButton.classList.add('edit-button');
                editButton.textContent = '编辑';
                editButton.addEventListener('click', () => loadPromptForEditing(prompt.id));
                actionsDiv.appendChild(editButton);

                const deleteButton = document.createElement('button');
                deleteButton.classList.add('delete-button');
                deleteButton.textContent = '删除';
                deleteButton.addEventListener('click', () => deletePrompt(prompt.id));
                actionsDiv.appendChild(deleteButton);
                headerDiv.appendChild(actionsDiv);
                itemDiv.appendChild(headerDiv);

                const contentPre = document.createElement('pre');
                contentPre.classList.add('prompt-item-content');
                contentPre.textContent = prompt.content;
                contentPre.title = '点击编辑';
                contentPre.addEventListener('click', () => loadPromptForEditing(prompt.id));
                itemDiv.appendChild(contentPre);

                promptListDiv.appendChild(itemDiv);
            });
        }

        function openPromptModal() {
            promptModalOverlay.classList.remove('hidden');
        }

        function closePromptModal() {
            promptModalOverlay.classList.add('hidden');
        }

        function resetForm() {
            promptIdInput.value = '';
            promptNameInput.value = '';
            promptContentInput.value = '';
        }

        function openAddModal() {
            resetForm();
            promptModalTitle.textContent = '添加模板';
            savePromptButton.textContent = '保存模板';
            openPromptModal();
            promptNameInput.focus();
        }

        function loadPromptForEditing(id) {
            const prompt = prompts.find(p => p.id === id);
            if (prompt) {
                promptIdInput.value = prompt.id;
                promptNameInput.value = prompt.name;
                promptContentInput.value = prompt.content;
                promptModalTitle.textContent = '编辑模板';
                savePromptButton.textContent = '更新模板';
                openPromptModal();
                promptNameInput.focus();
            }
        }

        async function deletePrompt(id) {
            const ok = await uiConfirm({ message: '确定要删除这个模板吗？', title: '删除模板' });
            if (ok) {
                prompts = prompts.filter(p => p.id !== id);
                await savePrompts();
                renderPrompts();
            }
        }

        savePromptButton.addEventListener('click', async () => {
            const id = promptIdInput.value;
            const name = promptNameInput.value.trim();
            const content = promptContentInput.value.trim();

            if (!name || !content) {
                alert("模板名称和内容不能为空。");
                return;
            }

            if (id) { // Editing existing
                const promptIndex = prompts.findIndex(p => p.id === id);
                if (promptIndex !== -1) {
                    prompts[promptIndex].name = name;
                    prompts[promptIndex].content = content;
                }
            } else { // Adding new
                prompts.push({
                    id: `custom-${Date.now()}`,
                    name,
                    content
                });
            }
            await savePrompts();
            renderPrompts();
            closePromptModal();
        });

        addPromptEntryButton.addEventListener('click', openAddModal);
        clearFormButton.addEventListener('click', closePromptModal);
        promptModalClose.addEventListener('click', closePromptModal);
        promptModalOverlay.addEventListener('click', (e) => {
            if (e.target === promptModalOverlay) closePromptModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !promptModalOverlay.classList.contains('hidden')) {
                closePromptModal();
            }
        });

        loadPrompts();
    }

    // 懒加载：首次进入 prompts tab 时初始化
    document.addEventListener('tab-activated', (e) => {
        if (e.detail === 'prompts' && !promptsInitialized) {
            promptsInitialized = true;
            initPrompts();
        }
    });
})();
