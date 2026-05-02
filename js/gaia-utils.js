// gaia-utils.js — Shared utility functions (must load before all other gaia-*.js)

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function urlBaseName(url) {
  try { return new URL(url).pathname.split('/').filter(Boolean).pop() || 'Layer'; }
  catch(e) { return 'Layer'; }
}

function _isValidURL(str) {
  try { const u = new URL(str); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch(e) { return false; }
}

// Safe expression evaluator for Field Calculator — sandboxes dangerous globals
function _evalFCExpr(expr, props) {
  let js = expr.replace(/\[([^\]]+)\]/g, (_, f) => {
    const v = props?.[f];
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return String(v);
    return JSON.stringify(String(v));
  });
  // eslint-disable-next-line no-new-func
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
