/**
 * Configuration Management Module
 * Handles loading, saving, and validating configuration data
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_FILE = path.join(__dirname, '../data/config.json');

/**
 * Generate a cryptographically secure random API key
 * @returns {string} 64-character hexadecimal string
 */
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Load configuration from file or create default configuration
 * @returns {Object} Configuration object with all settings
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading config:', error.message);
  }
  
  // Return default configuration
  return {
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    geminiApiUrl: process.env.GEMINI_API_URL || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModelName: process.env.GEMINI_MODEL_NAME || 'gemini-1.5-pro-latest',
    localApiKey: generateApiKey(),
    version: '1.0.0'
  };
}

/**
 * Save configuration to file atomically using temp file + rename
 * This ensures configuration is never corrupted even if process crashes
 * @param {Object} config - Configuration object to save
 * @returns {boolean} True if save succeeded, false otherwise
 */
function saveConfig(config) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const tempFile = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tempFile, CONFIG_FILE);
    return true;
  } catch (error) {
    console.error('Error saving config:', error.message);
    return false;
  }
}

/**
 * Validate URL format - must be HTTPS
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid or empty, false otherwise
 */
function validateUrl(url) {
  if (!url) return true; // Empty is allowed
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate and normalize configuration, filling in defaults for missing fields
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validated and normalized configuration
 * @throws {Error} If URL format is invalid
 */
function validateConfig(config) {
  const validated = { ...config };
  
  // Ensure required fields exist
  if (!validated.adminPassword) {
    validated.adminPassword = 'admin123';
  }
  
  if (!validated.localApiKey) {
    validated.localApiKey = generateApiKey();
  }
  
  if (!validated.geminiModelName) {
    validated.geminiModelName = 'gemini-1.5-pro-latest';
  }
  
  if (!validated.version) {
    validated.version = '1.0.0';
  }
  
  // Validate URL format
  if (validated.geminiApiUrl && !validateUrl(validated.geminiApiUrl)) {
    throw new Error('Invalid Gemini API URL format. Must use https://');
  }
  
  return validated;
}

module.exports = {
  loadConfig,
  saveConfig,
  generateApiKey,
  validateConfig,
  validateUrl
};
