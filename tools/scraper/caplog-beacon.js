'use strict';

/**
 * caplog-beacon.js — /caplog telemetry beacon URL builders + fire-and-forget sender.
 *
 * Ports the two GET /caplog beacons that Chrome 146 fires around the verify
 * request, observed in sample/captcha-har.har entries 8 (pre-verify, 45 params)
 * and 10 (post-verify, 15 params). Our scraper emits zero caplog beacons today,
 * which is a distinctive "IP never reported telemetry" tell — this module
 * restores that signal.
 *
 * Parameter order is preserved byte-for-byte via explicit ordered tuple arrays
 * (a plain object would get its numeric-like string keys sorted to the front by
 * V8). Field numbering is NOT contiguous: the pre-beacon jumps 37 -> 42 and
 * 47 -> 49; the post-beacon uses its own sparse subset.
 *
 * Opaque literal values (31, 34, flag1) are HAR literals — their derivations
 * are not yet reversed. TODO: pin them in a later reversal pass.
 */

const { httpRequest } = require('../captcha-solver/captcha-client');

const CAPLOG_HOST = 't.captcha.qq.com';
const CAPLOG_URL_BASE = 'https://' + CAPLOG_HOST + '/caplog';

/**
 * Serialize an ordered array of [key, value] tuples into a query string. Values
 * are URI-encoded; empty strings stay empty. Do NOT build from an object — V8
 * reorders numeric-like keys.
 * @param {Array<[string, string|number]>} tuples
 * @returns {string}
 */
function buildQueryString(tuples) {
  return tuples
    .map(([k, v]) => k + '=' + encodeURIComponent(v == null ? '' : String(v)))
    .join('&');
}

/**
 * Build the 45-param pre-verify beacon URL.
 *
 * Timestamps are derived from t0 (the Date.now() captured at the start of
 * solveCaptcha). The HAR offsets are preserved: 5..9 = t0, 10 = t0+2,
 * 11 = t0+54, 12 = t0+97, 13 = t0+58, 14..16 = t0+290.
 *
 * @param {Object} [opts]
 * @param {number} [opts.t0] - Solve-start timestamp (ms). Defaults to Date.now().
 * @returns {string} Fully-formed URL.
 */
function buildPreVerifyBeaconUrl(opts) {
  const o = opts || {};
  const t0 = typeof o.t0 === 'number' ? o.t0 : Date.now();

  // TODO: appid=20128 is the caplog app id — unrelated to the scraper's verify
  // aid. Pin via a later config reversal pass; hardcoded for now.
  const tuples = [
    ['appid', 20128],
    ['1', 0],
    ['2', 0],
    ['3', 0],
    ['4', 0],
    ['5', t0],
    ['6', t0],
    ['7', t0],
    ['8', t0],
    ['9', t0],
    ['10', t0 + 2],
    ['11', t0 + 54],
    ['12', t0 + 97],
    ['13', t0 + 58],
    ['14', t0 + 290],
    ['15', t0 + 290],
    ['16', t0 + 290],
    ['17', 0],
    ['18', 0],
    ['19', 0],
    ['20', 344],
    ['21', 247],
    ['22', 0],
    ['23', 54],
    ['24', 0],
    ['29', ''],
    // TODO: opaque HAR literal (9-digit int) — not yet reversed.
    ['31', 199094670],
    ['32', 0],
    ['33', ''],
    // TODO: opaque 19-digit snowflake-ish id — not yet reversed.
    ['34', '7446039806946242560'],
    ['35', 7],
    ['36', 7],
    ['37', 0],
    // Field 38..41 are ABSENT from the pre-beacon — do not add them.
    ['42', 0],
    ['43', 154],
    ['44', 11],
    ['45', 223],
    ['46', 344],
    ['47', 98],
    // Field 48 is ABSENT from the pre-beacon — do not add it.
    ['49', 509],
    ['platform', 'pc'],
    // TODO: opaque HAR literal — not yet reversed.
    ['flag1', 21408],
    ['flag2', 3],
    ['flag3', 14],
    // NOTE: subsid differs from post-beacon (13 vs 14).
    ['subsid', 13],
  ];

  return CAPLOG_URL_BASE + '?' + buildQueryString(tuples);
}

/**
 * Build the 15-param post-verify beacon URL.
 *
 * @param {Object} [opts]
 * @param {number} [opts.ans] - Optional slide-dx in pixels for field 27.
 *   Defaults to the HAR literal 345 if not a finite number.
 * @returns {string} Fully-formed URL.
 */
function buildPostVerifyBeaconUrl(opts) {
  const o = opts || {};
  // Field 27 is likely slide-dx in px. Use the caller's ans if it's a finite
  // number; otherwise fall back to the HAR literal 345.
  const field27 = typeof o.ans === 'number' && Number.isFinite(o.ans) ? o.ans : 345;

  const tuples = [
    ['appid', 20128],
    ['27', field27],
    ['29', ''],
    // TODO: opaque HAR literal — matches the pre-beacon.
    ['31', 199094670],
    ['32', 0],
    ['33', ''],
    // TODO: opaque HAR literal — matches the pre-beacon.
    ['34', '7446039806946242560'],
    ['37', 0],
    ['46', 0],
    ['48', 3331],
    ['platform', 'pc'],
    // TODO: opaque HAR literal — matches the pre-beacon.
    ['flag1', 21408],
    ['flag2', 3],
    ['flag3', 14],
    // NOTE: subsid differs from pre-beacon (14 vs 13).
    ['subsid', 14],
  ];

  return CAPLOG_URL_BASE + '?' + buildQueryString(tuples);
}

/**
 * Fire a caplog beacon as a fire-and-forget GET. Never throws: resolves on
 * completion OR on any network error. The response body is discarded.
 *
 * @param {string} url
 * @param {Object} [opts]
 * @param {string} [opts.userAgent]
 * @param {number} [opts.timeoutMs=3000]
 * @param {string} [opts.referer] - Referer URL (defaults to t.captcha.qq.com)
 * @param {Object} [opts.auditLogger] - AuditLogger instance for request-level logging
 * @param {string} [opts.auditStep] - step label for audit log
 * @returns {Promise<void>}
 */
async function fireBeacon(url, opts) {
  const o = opts || {};
  const timeout = typeof o.timeoutMs === 'number' ? o.timeoutMs : 3000;
  const headers = {
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': o.referer || 'https://t.captcha.qq.com/',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'same-origin',
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  };
  if (o.userAgent) {
    headers['User-Agent'] = o.userAgent;
  }
  try {
    await httpRequest(url, {
      headers,
      timeout,
      auditLogger: o.auditLogger || null,
      auditStep: o.auditStep || null,
    });
  } catch (_) {
    // Fire-and-forget: swallow network errors so callers never see a rejection.
  }
}

module.exports = {
  CAPLOG_HOST,
  buildPreVerifyBeaconUrl,
  buildPostVerifyBeaconUrl,
  fireBeacon,
};
