// options.js
(function() {
document.addEventListener('DOMContentLoaded', function() {
  const configIdInput = document.getElementById('configId');
  const configNameInput = document.getElementById('configName');
  const apiKeyInput = document.getElementById('apiKey');
  const apiTypeSelect = document.getElementById('apiType');
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const modelNameInput = document.getElementById('modelName');

  const saveConfigButton = document.getElementById('saveConfigButton');
  const testConfigButton = document.getElementById('testConfigButton');
  const clearFormButton = document.getElementById('clearFormButton');
  const cancelEditButton = document.getElementById('cancelEditButton');

  const configurationsListDiv = document.getElementById('configurationsList');
  const statusDiv = document.getElementById('status');

  const apiEndpointGroup = document.getElementById('apiEndpointGroup');

  let configurations = [];
  let activeConfigurationId = null;

  function generateId() {
    return `config_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  function toggleApiEndpointField() {
    if (apiTypeSelect.value === 'openai') {
      apiEndpointGroup.classList.remove('hidden');
    } else {
      apiEndpointGroup.classList.add('hidden');
      apiEndpointInput.value = '';
    }
  }

  apiTypeSelect.addEventListener('change', toggleApiEndpointField);

  async function loadConfigurations() {
    const result = await chrome.storage.sync.get(['apiConfigurations', 'activeConfigurationId']);
    configurations = result.apiConfigurations || [];
    activeConfigurationId = result.activeConfigurationId || null;
    renderConfigurations();
  }

  async function saveConfigurations() {
    try {
      await chrome.storage.sync.set({
        apiConfigurations: configurations,
        activeConfigurationId: activeConfigurationId
      });
      showStatus('配置保存成功！', 'green');
    } catch (e) {
      showStatus('错误: 保存配置失败。 ' + e.message, 'red');
      console.error("Error saving configurations:", e);
    }
  }

  function showStatus(text, color) {
    statusDiv.textContent = text;
    statusDiv.style.color = color;
    if (!text.includes("...")) {
        setTimeout(() => { statusDiv.textContent = ''; }, 4000);
    }
  }

  function renderConfigurations() {
    configurationsListDiv.innerHTML = '';
    if (configurations.length === 0) {
      configurationsListDiv.innerHTML = '<p>暂无配置。请使用上面的表单添加一个新配置。</p>';
      return;
    }

    configurations.forEach(config => {
      const itemDiv = document.createElement('div');
      itemDiv.classList.add('config-item');
      if (config.id === activeConfigurationId) {
        itemDiv.classList.add('is-active');
      }

      const detailsDiv = document.createElement('div');
      detailsDiv.classList.add('config-details');
      detailsDiv.innerHTML = `
        <strong>${escapeHtml(config.configName)}</strong> ${config.id === activeConfigurationId ? '(当前活动)' : ''}<br>
        <small>类型: ${escapeHtml(config.apiType)} | 模型: ${escapeHtml(config.modelName)}</small>
      `;
      itemDiv.appendChild(detailsDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.classList.add('config-actions');

      const setActiveButton = document.createElement('button');
      setActiveButton.textContent = '设为活动';
      setActiveButton.classList.add('set-active-btn');
      if (config.id === activeConfigurationId) {
        setActiveButton.disabled = true;
        setActiveButton.style.opacity = 0.5;
      }
      setActiveButton.addEventListener('click', async () => {
        activeConfigurationId = config.id;
        await saveConfigurations();
        renderConfigurations();
      });
      actionsDiv.appendChild(setActiveButton);

      const editButton = document.createElement('button');
      editButton.textContent = '编辑';
      editButton.classList.add('edit-btn');
      editButton.addEventListener('click', () => populateFormForEdit(config));
      actionsDiv.appendChild(editButton);

      const deleteButton = document.createElement('button');
      deleteButton.textContent = '删除';
      deleteButton.classList.add('delete-btn');
      deleteButton.addEventListener('click', async () => {
        if (confirm(`确定要删除配置 "${escapeHtml(config.configName)}" 吗？`)) {
          configurations = configurations.filter(c => c.id !== config.id);
          if (activeConfigurationId === config.id) {
            activeConfigurationId = configurations.length > 0 ? configurations[0].id : null;
          }
          await saveConfigurations();
          loadConfigurations();
        }
      });
      actionsDiv.appendChild(deleteButton);

      itemDiv.appendChild(actionsDiv);
      configurationsListDiv.appendChild(itemDiv);
    });
  }

  function populateFormForEdit(config) {
    configIdInput.value = config.id;
    configNameInput.value = config.configName;
    apiKeyInput.value = config.apiKey;
    apiTypeSelect.value = config.apiType;
    apiEndpointInput.value = config.apiEndpoint || '';
    modelNameInput.value = config.modelName;
    toggleApiEndpointField();

    saveConfigButton.textContent = '更新配置';
    cancelEditButton.classList.remove('hidden');
    document.getElementById('configFormContainer').scrollIntoView({ behavior: 'smooth' });
  }

  function clearForm() {
    configIdInput.value = '';
    configNameInput.value = '';
    apiKeyInput.value = '';
    apiTypeSelect.value = 'gemini';
    apiEndpointInput.value = '';
    modelNameInput.value = '';
    toggleApiEndpointField();

    saveConfigButton.textContent = '保存配置';
    cancelEditButton.classList.add('hidden');
    configNameInput.focus();
  }

  clearFormButton.addEventListener('click', clearForm);
  cancelEditButton.addEventListener('click', clearForm);

  testConfigButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const apiType = apiTypeSelect.value;
    const apiEndpoint = apiEndpointInput.value.trim();
    const modelName = modelNameInput.value.trim();

    if (!apiKey || !modelName) {
      showStatus('API密钥和模型名称不能为空。', 'red');
      return;
    }
    if (apiType === 'openai' && !apiEndpoint) {
      showStatus('OpenAI 兼容 API 需要填写 Endpoint URL。', 'red');
      return;
    }

    showStatus('正在测试连接...', 'blue');

    try {
        let response;
        if (apiType === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Test" }] }],
                    generationConfig: { maxOutputTokens: 1 }
                })
            });
        } else if (apiType === 'openai') {
            response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: "user", content: "Test" }],
                    max_tokens: 1
                })
            });
        }

        if (response.ok) {
            showStatus('连接成功！API 返回正常。', 'green');
        } else {
            const errorText = await response.text();
            let errorMsg = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                errorMsg = errorJson.error?.message || errorJson.error || errorText;
            } catch(e) {}
            showStatus(`连接失败: (${response.status}) ` + errorMsg.substring(0, 100), 'red');
        }
    } catch (error) {
        showStatus('连接失败: ' + error.message, 'red');
    }
  });

  saveConfigButton.addEventListener('click', async () => {
    const id = configIdInput.value;
    let configName = configNameInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const apiType = apiTypeSelect.value;
    const apiEndpoint = apiEndpointInput.value.trim();
    const modelName = modelNameInput.value.trim();

    if (!apiKey || !modelName) {
      showStatus('API密钥和模型名称不能为空。', 'red');
      return;
    }
    if (apiType === 'openai' && !apiEndpoint) {
      showStatus('OpenAI 兼容 API 需要填写 Endpoint URL。', 'red');
      return;
    }

    if (!configName) {
        configName = "Config " + new Date().toLocaleString();
    }

    const newConfig = {
      id: id || generateId(),
      configName,
      apiKey,
      apiType,
      apiEndpoint: apiType === 'openai' ? apiEndpoint : '',
      modelName
    };

    const existingIndex = configurations.findIndex(c => c.id === newConfig.id);
    if (existingIndex > -1) {
      configurations[existingIndex] = newConfig;
    } else {
      configurations.push(newConfig);
    }

    if (configurations.length === 1 || newConfig.id === activeConfigurationId || !activeConfigurationId) {
        activeConfigurationId = newConfig.id;
    }

    await saveConfigurations();
    clearForm();
    loadConfigurations();
  });

  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  loadConfigurations();
  toggleApiEndpointField();
});
})();
