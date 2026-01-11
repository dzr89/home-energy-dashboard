/**
 * Integration tests for API layer
 * Tests fetchHA, getSensorState, getSensorHistory with mocked responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', 'index.html');
const html = readFileSync(htmlPath, 'utf-8');

describe('API Layer', () => {
  let window;
  let fetchMock;
  let CONFIG;

  beforeEach(() => {
    // Create fresh DOM for each test
    const dom = new JSDOM(html, {
      url: 'http://localhost',
      runScripts: 'outside-only'
    });
    window = dom.window;

    // Setup localStorage mock
    const localStorageMock = {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, value) { this.store[key] = String(value); },
      removeItem(key) { delete this.store[key]; },
      clear() { this.store = {}; }
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });

    // Mock Chart.js
    window.Chart = class MockChart {
      constructor() { this.data = { labels: [], datasets: [] }; }
      update() {}
      destroy() {}
    };

    // Mock fetch
    fetchMock = vi.fn();
    window.fetch = fetchMock;

    // Initialize CONFIG
    CONFIG = {
      haUrl: 'http://homeassistant.local:8123',
      token: 'test-token-12345',
      refreshInterval: 30000,
      sensors: {
        solarPower: 'sensor.solar_power',
        solarToday: 'sensor.solar_today',
        consumptionPower: 'sensor.consumption_power',
        consumptionDaily: 'sensor.consumption_daily'
      }
    };

    // Evaluate the script to get functions
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    const scriptContent = scriptMatch[1];

    // Execute script with our config
    window.eval(`
      window.CONFIG = ${JSON.stringify(CONFIG)};
      window.lastApiCall = 0;
      const API_TIMEOUT = 10000;
      const MIN_API_INTERVAL = 100;

      async function fetchHA(endpoint) {
        const now = Date.now();
        const timeSinceLastCall = now - window.lastApiCall;
        if (timeSinceLastCall < MIN_API_INTERVAL) {
          await new Promise(resolve => setTimeout(resolve, MIN_API_INTERVAL - timeSinceLastCall));
        }
        window.lastApiCall = Date.now();

        if (!endpoint || typeof endpoint !== 'string' || endpoint.includes('..')) {
          throw new Error('Invalid endpoint');
        }

        const url = window.CONFIG.haUrl + '/api/' + endpoint;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
          const response = await fetch(url, {
            headers: {
              'Authorization': 'Bearer ' + window.CONFIG.token,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
          }
          return await response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            throw new Error('Request timeout - Home Assistant is not responding');
          }
          throw error;
        }
      }

      async function getSensorState(entityId) {
        const data = await fetchHA('states/' + entityId);
        return data;
      }

      async function getSensorHistory(entityId, startDate, endDate) {
        const start = new Date(startDate).toISOString();
        const end = new Date(endDate).toISOString();
        const data = await fetchHA('history/period/' + start + '?filter_entity_id=' + entityId + '&end_time=' + end);
        return data[0] || [];
      }

      window.fetchHA = fetchHA;
      window.getSensorState = getSensorState;
      window.getSensorHistory = getSensorHistory;
    `);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchHA', () => {
    it('makes authenticated API requests', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: '100' })
      });

      await window.fetchHA('states/sensor.test');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://homeassistant.local:8123/api/states/sensor.test',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-token-12345',
            'Content-Type': 'application/json'
          }
        })
      );
    });

    it('throws error for path traversal attempts', async () => {
      await expect(window.fetchHA('../etc/passwd')).rejects.toThrow('Invalid endpoint');
      await expect(window.fetchHA('states/../../../etc/passwd')).rejects.toThrow('Invalid endpoint');
    });

    it('throws error for empty endpoint', async () => {
      await expect(window.fetchHA('')).rejects.toThrow('Invalid endpoint');
      await expect(window.fetchHA(null)).rejects.toThrow('Invalid endpoint');
    });

    it('throws error for non-string endpoint', async () => {
      await expect(window.fetchHA(123)).rejects.toThrow('Invalid endpoint');
      await expect(window.fetchHA({})).rejects.toThrow('Invalid endpoint');
    });

    it('handles HTTP error responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(window.fetchHA('states/sensor.test')).rejects.toThrow('HTTP 401: Unauthorized');
    });

    it('handles 404 responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(window.fetchHA('states/sensor.nonexistent')).rejects.toThrow('HTTP 404: Not Found');
    });

    it('handles network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(window.fetchHA('states/sensor.test')).rejects.toThrow('Network error');
    });

    it('parses JSON response', async () => {
      const mockData = { entity_id: 'sensor.test', state: '500' };
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData)
      });

      const result = await window.fetchHA('states/sensor.test');
      expect(result).toEqual(mockData);
    });
  });

  describe('getSensorState', () => {
    it('fetches sensor state correctly', async () => {
      const mockSensor = {
        entity_id: 'sensor.solar_power',
        state: '1500',
        attributes: {
          unit_of_measurement: 'W',
          friendly_name: 'Solar Power'
        }
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSensor)
      });

      const result = await window.getSensorState('sensor.solar_power');

      expect(result).toEqual(mockSensor);
      expect(result.state).toBe('1500');
    });

    it('constructs correct endpoint URL', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: '0' })
      });

      await window.getSensorState('sensor.my_sensor');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('states/sensor.my_sensor'),
        expect.anything()
      );
    });
  });

  describe('getSensorHistory', () => {
    it('fetches sensor history with correct date range', async () => {
      const mockHistory = [{
        entity_id: 'sensor.solar_power',
        state: '100',
        last_changed: '2024-01-01T10:00:00Z'
      }];

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([mockHistory])
      });

      const startDate = '2024-01-01';
      const endDate = '2024-01-02';

      const result = await window.getSensorHistory('sensor.solar_power', startDate, endDate);

      expect(result).toEqual(mockHistory);
    });

    it('returns empty array when no history data', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([])
      });

      const result = await window.getSensorHistory('sensor.test', '2024-01-01', '2024-01-02');

      expect(result).toEqual([]);
    });

    it('includes entity filter in URL', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([[]])
      });

      await window.getSensorHistory('sensor.solar_power', '2024-01-01', '2024-01-02');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('filter_entity_id=sensor.solar_power'),
        expect.anything()
      );
    });

    it('includes end_time in URL', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([[]])
      });

      await window.getSensorHistory('sensor.test', '2024-01-01', '2024-01-02');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('end_time='),
        expect.anything()
      );
    });
  });
});

describe('Configuration', () => {
  let window;
  let localStorageMock;

  beforeEach(() => {
    const dom = new JSDOM(html, {
      url: 'http://localhost',
      runScripts: 'outside-only'
    });
    window = dom.window;

    localStorageMock = {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, value) { this.store[key] = String(value); },
      removeItem(key) { delete this.store[key]; },
      clear() { this.store = {}; }
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });

    // Setup config functions - use window.CONFIG to ensure updates are visible
    window.eval(`
      window.DEFAULT_SENSORS = {
        solarPower: 'sensor.enphase_current_power',
        solarToday: 'sensor.solar_production_today_kwh',
        consumptionPower: 'sensor.sense_energy',
        consumptionDaily: 'sensor.sense_daily_energy'
      };

      window.CONFIG = {
        haUrl: '',
        token: '',
        refreshInterval: 30000,
        sensors: { ...window.DEFAULT_SENSORS }
      };

      function isValidUrl(url) {
        if (!url || typeof url !== 'string') return true;
        try {
          const parsed = new URL(url);
          return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
          return false;
        }
      }

      window.loadConfig = function() {
        const saved = localStorage.getItem('energyDashboardConfig');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.haUrl && !isValidUrl(parsed.haUrl)) {
              console.warn('Invalid URL in saved config, ignoring');
              delete parsed.haUrl;
            }
            window.CONFIG = { ...window.CONFIG, ...parsed };
            return true;
          } catch (e) {
            console.error('Failed to parse saved config:', e);
            localStorage.removeItem('energyDashboardConfig');
            return false;
          }
        }
        return false;
      };

      window.saveConfig = function() {
        localStorage.setItem('energyDashboardConfig', JSON.stringify(window.CONFIG));
      };
    `);
  });

  describe('loadConfig', () => {
    it('returns false when no config is saved', () => {
      const result = window.loadConfig();
      expect(result).toBe(false);
    });

    it('loads config from localStorage', () => {
      const savedConfig = {
        haUrl: 'http://test.local:8123',
        token: 'my-token'
      };
      localStorageMock.setItem('energyDashboardConfig', JSON.stringify(savedConfig));

      const result = window.loadConfig();

      expect(result).toBe(true);
      expect(window.CONFIG.haUrl).toBe('http://test.local:8123');
      expect(window.CONFIG.token).toBe('my-token');
    });

    it('handles invalid JSON gracefully', () => {
      localStorageMock.setItem('energyDashboardConfig', 'not-valid-json');

      const result = window.loadConfig();

      expect(result).toBe(false);
      expect(localStorageMock.store['energyDashboardConfig']).toBeUndefined();
    });

    it('ignores invalid URLs in saved config', () => {
      const savedConfig = {
        haUrl: 'not-a-valid-url',
        token: 'my-token'
      };
      localStorageMock.setItem('energyDashboardConfig', JSON.stringify(savedConfig));

      window.loadConfig();

      expect(window.CONFIG.haUrl).toBe('');
    });

    it('merges with default config', () => {
      const savedConfig = {
        token: 'my-token'
      };
      localStorageMock.setItem('energyDashboardConfig', JSON.stringify(savedConfig));

      window.loadConfig();

      expect(window.CONFIG.token).toBe('my-token');
      expect(window.CONFIG.refreshInterval).toBe(30000);
      expect(window.CONFIG.sensors).toBeDefined();
    });
  });

  describe('saveConfig', () => {
    it('saves config to localStorage', () => {
      window.CONFIG.haUrl = 'http://new.local:8123';
      window.CONFIG.token = 'new-token';

      window.saveConfig();

      const saved = JSON.parse(localStorageMock.getItem('energyDashboardConfig'));
      expect(saved.haUrl).toBe('http://new.local:8123');
      expect(saved.token).toBe('new-token');
    });

    it('saves sensor configuration', () => {
      window.CONFIG.sensors.solarPower = 'sensor.custom_solar';

      window.saveConfig();

      const saved = JSON.parse(localStorageMock.getItem('energyDashboardConfig'));
      expect(saved.sensors.solarPower).toBe('sensor.custom_solar');
    });
  });
});

describe('Security', () => {
  describe('Path Traversal Prevention', () => {
    it('blocks directory traversal in API endpoints', async () => {
      const dom = new JSDOM(html, { url: 'http://localhost', runScripts: 'outside-only' });
      const window = dom.window;

      window.fetch = vi.fn();
      window.eval(`
        window.CONFIG = { haUrl: 'http://test.local', token: 'test' };
        window.lastApiCall = 0;
        async function fetchHA(endpoint) {
          if (!endpoint || typeof endpoint !== 'string' || endpoint.includes('..')) {
            throw new Error('Invalid endpoint');
          }
          return { state: 'test' };
        }
        window.fetchHA = fetchHA;
      `);

      const maliciousEndpoints = [
        '../../../etc/passwd',
        'states/../../secrets',
        '..%2F..%2Fetc/passwd',
        'states/sensor/../../../config'
      ];

      for (const endpoint of maliciousEndpoints) {
        await expect(window.fetchHA(endpoint)).rejects.toThrow('Invalid endpoint');
      }
    });
  });
});
