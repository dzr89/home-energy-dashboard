/**
 * Unit tests for utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractFunctions } from './setup.js';

const {
  sanitizeText,
  isValidEntityId,
  isValidUrl,
  isSecureUrl,
  debounce,
  formatPower,
  formatEnergy
} = extractFunctions();

describe('sanitizeText', () => {
  it('returns empty string for null', () => {
    expect(sanitizeText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(sanitizeText(undefined)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('passes through plain text unchanged', () => {
    expect(sanitizeText('Hello World')).toBe('Hello World');
  });

  it('escapes HTML tags', () => {
    const result = sanitizeText('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes ampersands', () => {
    expect(sanitizeText('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes quotes', () => {
    const result = sanitizeText('He said "hello"');
    expect(result).toContain('&quot;');
  });

  it('converts numbers to strings', () => {
    expect(sanitizeText(123)).toBe('123');
  });

  it('handles special characters', () => {
    const result = sanitizeText('<img src=x onerror="alert(1)">');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;');
  });
});

describe('isValidEntityId', () => {
  it('returns false for null', () => {
    expect(isValidEntityId(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidEntityId(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidEntityId('')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isValidEntityId(123)).toBe(false);
    expect(isValidEntityId({})).toBe(false);
  });

  it('accepts valid sensor entity ID', () => {
    expect(isValidEntityId('sensor.power_consumption')).toBe(true);
  });

  it('accepts valid binary_sensor entity ID', () => {
    expect(isValidEntityId('binary_sensor.motion_detected')).toBe(true);
  });

  it('accepts entity IDs starting with underscore', () => {
    expect(isValidEntityId('_custom.my_sensor')).toBe(true);
  });

  it('accepts entity IDs with numbers', () => {
    expect(isValidEntityId('sensor.temp_sensor_1')).toBe(true);
  });

  it('rejects entity IDs without domain separator', () => {
    expect(isValidEntityId('sensor_power')).toBe(false);
  });

  it('rejects entity IDs with uppercase letters', () => {
    expect(isValidEntityId('Sensor.Power')).toBe(false);
  });

  it('rejects entity IDs with special characters', () => {
    expect(isValidEntityId('sensor.power-usage')).toBe(false);
    expect(isValidEntityId('sensor.power@home')).toBe(false);
  });

  it('rejects entity IDs starting with numbers in domain', () => {
    expect(isValidEntityId('1sensor.power')).toBe(false);
  });

  it('rejects entity IDs longer than 255 characters', () => {
    const longId = 'sensor.' + 'a'.repeat(250);
    expect(isValidEntityId(longId)).toBe(false);
  });

  it('accepts entity IDs at exactly 255 characters', () => {
    const exactId = 'sensor.' + 'a'.repeat(248);
    expect(exactId.length).toBe(255);
    expect(isValidEntityId(exactId)).toBe(true);
  });
});

describe('isValidUrl', () => {
  it('returns true for empty string (allowed for HA-hosted)', () => {
    expect(isValidUrl('')).toBe(true);
  });

  it('returns true for null', () => {
    expect(isValidUrl(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isValidUrl(undefined)).toBe(true);
  });

  it('accepts valid HTTP URL', () => {
    expect(isValidUrl('http://homeassistant.local:8123')).toBe(true);
  });

  it('accepts valid HTTPS URL', () => {
    expect(isValidUrl('https://myha.duckdns.org')).toBe(true);
  });

  it('accepts localhost URLs', () => {
    expect(isValidUrl('http://localhost:8123')).toBe(true);
  });

  it('accepts IP address URLs', () => {
    expect(isValidUrl('http://192.168.1.100:8123')).toBe(true);
  });

  it('rejects malformed URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  it('rejects FTP URLs', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });

  it('rejects file URLs', () => {
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects javascript URLs', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('isSecureUrl', () => {
  it('returns true for empty URL (HA-hosted)', () => {
    expect(isSecureUrl('')).toBe(true);
  });

  it('returns true for null', () => {
    expect(isSecureUrl(null)).toBe(true);
  });

  it('returns true for HTTPS URLs', () => {
    expect(isSecureUrl('https://myha.duckdns.org')).toBe(true);
  });

  it('returns false for HTTP URLs', () => {
    expect(isSecureUrl('http://homeassistant.local:8123')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(isSecureUrl('not-a-url')).toBe(false);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn();
    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('only calls function once for rapid calls', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on subsequent calls', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn(); // Reset timer
    vi.advanceTimersByTime(50);
    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments to the debounced function', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('uses arguments from last call', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn('first');
    debouncedFn('second');
    debouncedFn('third');
    vi.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledWith('third');
  });
});

describe('formatPower', () => {
  it('returns -- for null', () => {
    expect(formatPower(null)).toBe('--');
  });

  it('returns -- for undefined', () => {
    expect(formatPower(undefined)).toBe('--');
  });

  it('returns -- for NaN', () => {
    expect(formatPower(NaN)).toBe('--');
  });

  it('returns -- for non-numeric string', () => {
    expect(formatPower('not a number')).toBe('--');
  });

  it('formats watts below 1000', () => {
    const result = formatPower(500);
    expect(result).toContain('500');
    expect(result).toContain('W');
  });

  it('formats kilowatts for values >= 1000', () => {
    const result = formatPower(1500);
    expect(result).toContain('1.5');
    expect(result).toContain('kW');
  });

  it('rounds watts to whole numbers', () => {
    const result = formatPower(123.7);
    expect(result).toContain('124');
    expect(result).toContain('W');
  });

  it('formats zero correctly', () => {
    const result = formatPower(0);
    expect(result).toContain('0');
    expect(result).toContain('W');
  });

  it('handles string numbers', () => {
    const result = formatPower('500');
    expect(result).toContain('500');
    expect(result).toContain('W');
  });

  it('handles negative values', () => {
    const result = formatPower(-500);
    expect(result).toContain('-500');
    expect(result).toContain('W');
  });
});

describe('formatEnergy', () => {
  it('returns -- for null', () => {
    expect(formatEnergy(null)).toBe('--');
  });

  it('returns -- for undefined', () => {
    expect(formatEnergy(undefined)).toBe('--');
  });

  it('returns -- for NaN', () => {
    expect(formatEnergy(NaN)).toBe('--');
  });

  it('formats energy with one decimal place', () => {
    expect(formatEnergy(12.34)).toBe('12.3');
  });

  it('formats zero correctly', () => {
    expect(formatEnergy(0)).toBe('0.0');
  });

  it('handles string numbers', () => {
    expect(formatEnergy('5.67')).toBe('5.7');
  });

  it('handles negative values', () => {
    expect(formatEnergy(-3.5)).toBe('-3.5');
  });

  it('rounds correctly', () => {
    expect(formatEnergy(1.999)).toBe('2.0');
    expect(formatEnergy(1.944)).toBe('1.9');
  });
});
