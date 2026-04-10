'use strict';

/**
 * Extract TDC_NAME from tdc.js source.
 * Line 1 contains: window.TDC_NAME = "<32-char-string>"
 * @param {string} source - Full tdc.js source code
 * @returns {string|null} The TDC_NAME value or null
 */
function extractTdcName(source) {
  const m = source.match(/(?:window\.TDC_NAME\s*=\s*"([^"]+)"|var\s+TDC_NAME\s*=\s*"([^"]+)")/);
  if (!m) return null;
  return m[1] || m[2];
}

/**
 * Extract the eks token (base64 string) from tdc.js source.
 * Near line 123, format: window.<TDC_NAME_VALUE> = '<312-char base64>'
 * @param {string} source - Full tdc.js source code
 * @returns {string|null} The base64 eks string or null
 */
function extractEks(source) {
  // First try: window.<literal-name> = '...' where the name is a known identifier
  // The pattern uses the TDC_NAME value directly as a property on window
  const tdcName = extractTdcName(source);

  if (tdcName) {
    // Escape any regex-special chars in the name (unlikely but safe)
    const escaped = tdcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`window\\.${escaped}\\s*=\\s*'([^']+)'`);
    const m = source.match(re);
    if (m) return m[1];
  }

  // Fallback: window[TDC_NAME] = '...' (variable reference form)
  const m2 = source.match(/window\[TDC_NAME\]\s*=\s*'([^']+)'/);
  if (m2) return m2[1];

  // Fallback: any window.<32-char-identifier> = '<long-base64>'
  const m3 = source.match(/window\.[A-Za-z]{32}\s*=\s*'([^']{200,})'/);
  if (m3) return m3[1];

  return null;
}

module.exports = { extractTdcName, extractEks };
