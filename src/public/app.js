// State management
let sessionToken = null;

// DOM elements
const loginCard = document.getElementById('loginCard');
const configCard = document.getElementById('configCard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const configForm = document.getElementById('configForm');
const configError = document.getElementById('configError');
const configSuccess = document.getElementById('configSuccess');
const themeToggle = document.getElementById('themeToggle');
const logoutBtn = document.getElementById('logoutBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Initialize theme
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.querySelector('.theme-icon').textContent = '☀️';
  }
}

// Toggle theme
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  themeToggle.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
});

// Show error message
function showError(element, message) {
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 5000);
}

// Show success message
function showSuccess(element, message) {
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 3000);
}

// Login form submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('loginPassword').value;
  
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      sessionToken = data.token;
      loginCard.classList.add('hidden');
      configCard.classList.remove('hidden');
      loadConfiguration();
    } else {
      showError(loginError, data.error?.message || 'Login failed');
    }
  } catch (error) {
    showError(loginError, 'Connection error');
  }
});

// Load configuration
async function loadConfiguration() {
  try {
    const response = await fetch('/api/config', {
      headers: { 'x-session-token': sessionToken }
    });
    
    if (response.ok) {
      const config = await response.json();
      document.getElementById('geminiApiUrl').value = config.geminiApiUrl || '';
      document.getElementById('geminiApiKey').value = config.geminiApiKey || '';
      document.getElementById('defaultGeminiModel').value = config.defaultGeminiModel || 'gemini-2.5-flash';
      document.getElementById('localApiKey').value = config.localApiKey || '';
      
      // Update Claude API URL display
      updateClaudeApiUrl();
    } else {
      showError(configError, 'Failed to load configuration');
    }
  } catch (error) {
    showError(configError, 'Connection error');
  }
}

// Save configuration
configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const config = {
    geminiApiUrl: document.getElementById('geminiApiUrl').value,
    geminiApiKey: document.getElementById('geminiApiKey').value,
    defaultGeminiModel: document.getElementById('defaultGeminiModel').value
  };
  
  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken
      },
      body: JSON.stringify(config)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showSuccess(configSuccess, 'Configuration saved successfully');
      // Update Claude API URL display
      updateClaudeApiUrl();
      // Test connection after saving
      testConnection();
    } else {
      showError(configError, data.error?.message || 'Failed to save configuration');
    }
  } catch (error) {
    showError(configError, 'Connection error');
  }
});

// Test connection
async function testConnection() {
  statusDot.className = 'status-dot';
  statusText.textContent = 'Testing...';
  
  try {
    const response = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'x-session-token': sessionToken }
    });
    
    const data = await response.json();
    
    if (data.connected) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected';
    } else {
      statusDot.classList.add('disconnected');
      statusText.textContent = 'Disconnected';
    }
  } catch (error) {
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Error';
  }
}

// Generate new API key
document.getElementById('generateKeyBtn').addEventListener('click', async () => {
  if (!confirm('Generate a new API key? This will invalidate the current key.')) {
    return;
  }
  
  try {
    const response = await fetch('/api/generate-key', {
      method: 'POST',
      headers: { 'x-session-token': sessionToken }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      document.getElementById('localApiKey').value = data.localApiKey;
      showSuccess(configSuccess, 'New API key generated');
    } else {
      showError(configError, data.error?.message || 'Failed to generate key');
    }
  } catch (error) {
    showError(configError, 'Connection error');
  }
});

// Copy API key
document.getElementById('copyKeyBtn').addEventListener('click', () => {
  const apiKey = document.getElementById('localApiKey').value;
  navigator.clipboard.writeText(apiKey).then(() => {
    showSuccess(configSuccess, 'API key copied to clipboard');
  });
});

// Change password
document.getElementById('changePasswordBtn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  
  if (!currentPassword || !newPassword) {
    showError(configError, 'Please enter both passwords');
    return;
  }
  
  try {
    const response = await fetch('/api/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showSuccess(configSuccess, 'Password changed successfully. Please login again.');
      setTimeout(() => {
        sessionToken = null;
        configCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
        document.getElementById('loginPassword').value = '';
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
      }, 2000);
    } else {
      showError(configError, data.error?.message || 'Failed to change password');
    }
  } catch (error) {
    showError(configError, 'Connection error');
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  sessionToken = null;
  configCard.classList.add('hidden');
  loginCard.classList.remove('hidden');
  document.getElementById('loginPassword').value = '';
});

// Update Claude API URL display
function updateClaudeApiUrl() {
  const url = `${window.location.protocol}//${window.location.host}/v1/messages`;
  document.getElementById('claudeApiUrl').value = url;
}

// Copy Claude API URL
document.getElementById('copyUrlBtn').addEventListener('click', () => {
  const url = document.getElementById('claudeApiUrl').value;
  navigator.clipboard.writeText(url).then(() => {
    showSuccess(configSuccess, 'Claude API URL copied to clipboard');
  });
});

// Initialize
initTheme();
updateClaudeApiUrl();
