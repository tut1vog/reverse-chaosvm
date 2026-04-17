'use strict';

/**
 * audit-logger.js — Structured audit logging for HTTP request/response pairs.
 *
 * Captures every HTTP request in a common JSON schema so that scraper and
 * Puppeteer flows can be diffed side-by-side. Opt-in: only active when an
 * AuditLogger instance is passed through the call chain.
 *
 * Output schema (top-level):
 *   { source, timestamp, requests[], tokens{}, result }
 *
 * Each request entry:
 *   { seq, step, method, url, requestHeaders, requestBodyDigest,
 *     responseStatus, responseHeaders, responseSize, startTime, duration, error }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuditLogger {
  /**
   * @param {string} source - 'scraper' | 'puppeteer'
   */
  constructor(source) {
    this.source = source;
    this.timestamp = new Date().toISOString();
    this.requests = [];
    this.tokens = {};
    this.result = null;
  }

  /**
   * Log a single request/response pair.
   * @param {Object} entry
   * @param {string} [entry.step] - logical step label (e.g. 'prehandle', 'verify')
   * @param {string} [entry.method] - HTTP method
   * @param {string} [entry.url] - request URL
   * @param {Object} [entry.requestHeaders] - request headers
   * @param {string|null} [entry.requestBodyDigest] - SHA-256 hex of request body (or null)
   * @param {number|null} [entry.responseStatus] - HTTP status code
   * @param {Object} [entry.responseHeaders] - response headers
   * @param {number} [entry.responseSize] - response body size in bytes
   * @param {number|null} [entry.startTime] - Date.now() at request start
   * @param {number|null} [entry.duration] - ms elapsed
   * @param {string|null} [entry.error] - error message if request failed
   */
  logRequest(entry) {
    this.requests.push({
      seq: this.requests.length + 1,
      step: entry.step || null,
      method: entry.method || 'GET',
      url: entry.url || '',
      requestHeaders: entry.requestHeaders || {},
      requestBodyDigest: entry.requestBodyDigest || null,
      responseStatus: entry.responseStatus || null,
      responseHeaders: entry.responseHeaders || {},
      responseSize: entry.responseSize || 0,
      startTime: entry.startTime || null,
      duration: entry.duration || null,
      error: entry.error || null,
    });
  }

  /**
   * Record token values for later comparison.
   * @param {Object} tokens - key/value pairs (e.g. { collect, eks, vData })
   */
  logTokens(tokens) {
    Object.assign(this.tokens, tokens);
  }

  /**
   * Record the final result of the flow.
   * @param {Object} result - e.g. { errorCode, ticket, randstr }
   */
  setResult(result) {
    this.result = result;
  }

  /**
   * Write the audit log to a JSON file. Creates parent directories as needed.
   * @param {string} filePath - absolute or relative path
   */
  save(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
      source: this.source,
      timestamp: this.timestamp,
      requests: this.requests,
      tokens: this.tokens,
      result: this.result,
    }, null, 2));
  }
}

/**
 * Compute a SHA-256 hex digest of a string or Buffer.
 * @param {string|Buffer} data
 * @returns {string}
 */
function bodyDigest(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = { AuditLogger, bodyDigest };
