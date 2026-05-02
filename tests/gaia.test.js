/**
 * tests/gaia.test.js
 * Vitest unit tests for Gaia GIS Explorer utility functions.
 *
 * Run:  npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Inline the pure helpers under test ──────────────────────────────────────
// These are copied verbatim from js/gaia-utils.js.
// gaia-utils.js cannot be imported directly because it is a classic browser
// script (no ES module exports) — keep these copies in sync with that file.

const CONSTANTS = {
  TOAST_DURATION_MS:    4500,
  FETCH_TIMEOUT_MS:     30000,
  FILE_SIZE_WARN_MB:    50,
  FILE_SIZE_WARN_BYTES: 50 * 1024 * 1024,
  MAX_CATALOGUE_FEATURES: 100000,
  MAP_FIT_PADDING:      [30, 30],
  MAP_FIT_PADDING_WIDE: [40, 40],
  AGOL_TOKEN_MINUTES:   120,
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _isValidURL(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

function _evalFCExpr(expr, props) {
  let js = expr.replace(/\[([^\]]+)\]/g, (_, f) => {
    const v = props?.[f];
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return String(v);
    return JSON.stringify(String(v));
  });
  return new Function(
    'Math', 'String', 'Number', 'parseFloat', 'parseInt',
    'Boolean', 'Array', 'Object', 'JSON', 'Date', 'isNaN', 'isFinite',
    'window', 'document', 'globalThis', 'self', 'Function', 'fetch',
    'XMLHttpRequest', 'WebSocket', 'navigator', 'location',
    'return (' + js + ')'
  )(
    Math, String, Number, parseFloat, parseInt,
    Boolean, Array, Object, JSON, Date, isNaN, isFinite,
    undefined, undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined
  );
}

function urlBaseName(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || u.hostname;
  } catch (e) {
    return url.split('/').pop() || url;
  }
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

describe('CONSTANTS', () => {
  it('has correct TOAST_DURATION_MS', () => {
    expect(CONSTANTS.TOAST_DURATION_MS).toBe(4500);
  });

  it('has correct FETCH_TIMEOUT_MS', () => {
    expect(CONSTANTS.FETCH_TIMEOUT_MS).toBe(30000);
  });

  it('has correct FILE_SIZE_WARN_MB', () => {
    expect(CONSTANTS.FILE_SIZE_WARN_MB).toBe(50);
  });

  it('FILE_SIZE_WARN_BYTES equals 50 * 1024 * 1024', () => {
    expect(CONSTANTS.FILE_SIZE_WARN_BYTES).toBe(50 * 1024 * 1024);
  });

  it('has correct MAX_CATALOGUE_FEATURES', () => {
    expect(CONSTANTS.MAX_CATALOGUE_FEATURES).toBe(100000);
  });

  it('MAP_FIT_PADDING is [30, 30]', () => {
    expect(CONSTANTS.MAP_FIT_PADDING).toEqual([30, 30]);
  });

  it('MAP_FIT_PADDING_WIDE is [40, 40]', () => {
    expect(CONSTANTS.MAP_FIT_PADDING_WIDE).toEqual([40, 40]);
  });

  it('has correct AGOL_TOKEN_MINUTES', () => {
    expect(CONSTANTS.AGOL_TOKEN_MINUTES).toBe(120);
  });
});

// ─── escHtml ─────────────────────────────────────────────────────────────────

describe('escHtml', () => {
  it('escapes ampersands', () => {
    expect(escHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than', () => {
    expect(escHtml('1 > 0')).toBe('1 &gt; 0');
  });

  it('escapes double quotes', () => {
    expect(escHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('coerces non-strings', () => {
    expect(escHtml(42)).toBe('42');
    expect(escHtml(null)).toBe('null');
  });

  it('leaves safe text unchanged', () => {
    expect(escHtml('Hello World')).toBe('Hello World');
  });

  it('handles all special chars together', () => {
    expect(escHtml('<a href="x">AT&T</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;AT&amp;T&lt;/a&gt;'
    );
  });
});

// ─── _isValidURL ─────────────────────────────────────────────────────────────

describe('_isValidURL', () => {
  it('accepts https URLs', () => {
    expect(_isValidURL('https://example.com/data.geojson')).toBe(true);
  });

  it('accepts http URLs', () => {
    expect(_isValidURL('http://example.com/wms')).toBe(true);
  });

  it('rejects bare strings', () => {
    expect(_isValidURL('not a url')).toBe(false);
  });

  it('rejects file:// protocol', () => {
    expect(_isValidURL('file:///etc/passwd')).toBe(false);
  });

  it('rejects javascript: protocol', () => {
    expect(_isValidURL('javascript:alert(1)')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(_isValidURL('')).toBe(false);
  });

  it('rejects ftp:// protocol', () => {
    expect(_isValidURL('ftp://example.com/file')).toBe(false);
  });

  it('accepts URLs with query strings', () => {
    expect(_isValidURL('https://example.com/api?f=json&token=abc')).toBe(true);
  });
});

// ─── _evalFCExpr ─────────────────────────────────────────────────────────────

describe('_evalFCExpr', () => {
  it('evaluates a simple arithmetic expression', () => {
    expect(_evalFCExpr('1 + 1', {})).toBe(2);
  });

  it('substitutes a numeric field', () => {
    expect(_evalFCExpr('[area] * 2', { area: 5 })).toBe(10);
  });

  it('substitutes a string field', () => {
    expect(_evalFCExpr('[name].toUpperCase()', { name: 'hello' })).toBe('HELLO');
  });

  it('returns null for missing field', () => {
    expect(_evalFCExpr('[missing]', {})).toBeNull();
  });

  it('supports Math functions', () => {
    expect(_evalFCExpr('Math.round([val])', { val: 3.7 })).toBe(4);
  });

  it('supports ternary expressions', () => {
    expect(_evalFCExpr('[x] > 0 ? "pos" : "neg"', { x: 5 })).toBe('pos');
  });

  it('blocks access to window (returns undefined)', () => {
    expect(_evalFCExpr('window', {})).toBeUndefined();
  });

  it('blocks access to fetch (returns undefined)', () => {
    expect(_evalFCExpr('fetch', {})).toBeUndefined();
  });

  it('blocks access to globalThis (returns undefined)', () => {
    expect(_evalFCExpr('globalThis', {})).toBeUndefined();
  });

  it('handles null field value', () => {
    expect(_evalFCExpr('[val]', { val: null })).toBeNull();
  });

  it('handles boolean results', () => {
    expect(_evalFCExpr('[x] === 0', { x: 0 })).toBe(true);
  });
});

// ─── urlBaseName ─────────────────────────────────────────────────────────────

describe('urlBaseName', () => {
  it('returns filename from path', () => {
    expect(urlBaseName('https://example.com/data/layer.geojson')).toBe('layer.geojson');
  });

  it('returns last path segment', () => {
    expect(urlBaseName('https://example.com/arcgis/rest/services/MyLayer/FeatureServer/0')).toBe('0');
  });

  it('returns hostname when no path', () => {
    expect(urlBaseName('https://example.com')).toBe('example.com');
  });

  it('handles trailing slash gracefully', () => {
    const result = urlBaseName('https://example.com/api/');
    expect(['api', 'example.com']).toContain(result);
  });

  it('falls back for non-URL strings', () => {
    expect(urlBaseName('just-a-name')).toBe('just-a-name');
  });
});
