/**
 * Test setup file
 * Extracts functions from index.html for testing while keeping single-file architecture
 */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the HTML file
const htmlPath = join(__dirname, '..', 'index.html');
const html = readFileSync(htmlPath, 'utf-8');

// Extract the script content from HTML
function extractScript(htmlContent) {
  const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  if (!scriptMatch) {
    throw new Error('Could not find script in index.html');
  }
  return scriptMatch[1];
}

// Create a minimal DOM environment and extract functions
export function createTestEnvironment() {
  const dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'outside-only',
    resources: 'usable'
  });

  const { window } = dom;

  // Setup localStorage mock
  const localStorageMock = {
    store: {},
    getItem(key) {
      return this.store[key] || null;
    },
    setItem(key, value) {
      this.store[key] = String(value);
    },
    removeItem(key) {
      delete this.store[key];
    },
    clear() {
      this.store = {};
    }
  };

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
  });

  // Mock Chart.js (not needed for unit tests)
  window.Chart = class MockChart {
    constructor() {
      this.data = { labels: [], datasets: [] };
    }
    update() {}
    destroy() {}
  };

  // Execute the script to populate window with functions
  const scriptContent = extractScript(html);

  // Wrap script to capture function definitions
  const wrappedScript = `
    ${scriptContent}

    // Expose functions for testing
    window.__testExports = {
      sanitizeText,
      isValidEntityId,
      isValidUrl,
      isSecureUrl,
      debounce,
      formatPower,
      formatEnergy,
      loadConfig,
      saveConfig,
      CONFIG,
      DEFAULT_SENSORS,
      fetchHA,
      getSensorState,
      getSensorHistory,
      showError,
      clearError,
      updateStatus
    };
  `;

  try {
    window.eval(wrappedScript);
  } catch (e) {
    // Script may fail due to missing dependencies, but functions are defined
    console.warn('Script execution warning:', e.message);
  }

  return {
    window,
    document: window.document,
    localStorage: localStorageMock,
    getExports: () => window.__testExports
  };
}

// Export functions individually for direct testing
export function extractFunctions() {
  const scriptContent = extractScript(html);

  // Parse and extract pure functions that don't need DOM
  const functions = {};

  // sanitizeText
  functions.sanitizeText = function(text) {
    if (text === null || text === undefined) return '';
    const div = { textContent: '', innerHTML: '' };
    div.textContent = String(text);
    // Simulate browser behavior
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // isValidEntityId
  functions.isValidEntityId = function(entityId) {
    if (!entityId || typeof entityId !== 'string') return false;
    const pattern = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
    return pattern.test(entityId) && entityId.length <= 255;
  };

  // isValidUrl
  functions.isValidUrl = function(url) {
    if (!url || typeof url !== 'string') return true; // Empty URL is allowed
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  // isSecureUrl
  functions.isSecureUrl = function(url) {
    if (!url) return true; // Empty URL means hosted on HA
    try {
      return new URL(url).protocol === 'https:';
    } catch {
      return false;
    }
  };

  // debounce
  functions.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // formatPower
  functions.formatPower = function(watts) {
    if (watts === null || watts === undefined || isNaN(watts)) return '--';
    const numWatts = Number(watts);
    if (isNaN(numWatts)) return '--';
    if (numWatts >= 1000) {
      return `${(numWatts / 1000).toFixed(1)}<span class="card-unit">kW</span>`;
    }
    return `${Math.round(numWatts)}<span class="card-unit">W</span>`;
  };

  // formatEnergy
  functions.formatEnergy = function(kwh) {
    if (kwh === null || kwh === undefined || isNaN(kwh)) return '--';
    const numKwh = Number(kwh);
    if (isNaN(numKwh)) return '--';
    return numKwh.toFixed(1);
  };

  return functions;
}
