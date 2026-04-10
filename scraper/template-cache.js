'use strict';

const fs = require('fs');
const path = require('path');

class TemplateCache {
  /**
   * @param {string} [cachePath] - Path to the JSON cache file
   */
  constructor(cachePath) {
    this._cachePath = cachePath || path.join(__dirname, 'cache', 'templates.json');
    this._cache = {};
  }

  /**
   * Load cache from disk. Creates empty cache if file doesn't exist.
   */
  load() {
    if (fs.existsSync(this._cachePath)) {
      const raw = fs.readFileSync(this._cachePath, 'utf8');
      this._cache = JSON.parse(raw);
    } else {
      this._cache = {};
    }
  }

  /**
   * Write cache to disk as formatted JSON.
   */
  save() {
    const dir = path.dirname(this._cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this._cachePath, JSON.stringify(this._cache, null, 2) + '\n', 'utf8');
  }

  /**
   * Look up cached XTEA params by TDC_NAME.
   * Normalizes legacy entries by adding keyMods if only keyModConstants is present.
   * @param {string} tdcName
   * @returns {object|null} Entry with {template, key, delta, rounds, keyModConstants, keyMods, caseCount, cdFieldOrder?} or null
   */
  lookup(tdcName) {
    const entry = this._cache[tdcName] || null;
    if (entry) {
      return TemplateCache._normalizeEntry(entry);
    }
    return null;
  }

  /**
   * Look up cached XTEA params by template structure (caseCount).
   * Returns the first entry that matches the given caseCount.
   * Normalizes legacy entries by adding keyMods if only keyModConstants is present.
   * @param {number} caseCount - Number of opcodes in the VM dispatch switch
   * @returns {object|null} Entry with {template, key, delta, rounds, keyModConstants, keyMods, caseCount, cdFieldOrder?} or null
   */
  lookupByStructure(caseCount) {
    for (const [, entry] of Object.entries(this._cache)) {
      if (entry.caseCount === caseCount) {
        return TemplateCache._normalizeEntry(entry);
      }
    }
    return null;
  }

  /**
   * Add or update an entry, set lastSeen timestamp, and save.
   * Accepts keyMods (4-element) or keyModConstants (2-element) or both.
   * @param {string} tdcName
   * @param {object} params - {template, key, delta, rounds, keyModConstants?, keyMods?, caseCount, cdFieldOrder?}
   */
  store(tdcName, params) {
    const entry = Object.assign({}, params, {
      lastSeen: new Date().toISOString()
    });
    // Ensure both keyMods and keyModConstants are present for compatibility
    if (entry.keyMods && !entry.keyModConstants) {
      entry.keyModConstants = [entry.keyMods[1], entry.keyMods[3]];
    } else if (entry.keyModConstants && !entry.keyMods) {
      entry.keyMods = [0, entry.keyModConstants[0], 0, entry.keyModConstants[1]];
    }
    this._cache[tdcName] = entry;
    this.save();
  }

  /**
   * Scan all output/<version>/pipeline-config.json files to populate cache.
   * Extracts xteaParams and template fields from each config.
   */
  seed() {
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) return;

    const entries = fs.readdirSync(outputDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(outputDir, entry.name, 'pipeline-config.json');
      if (!fs.existsSync(configPath)) continue;

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!config.xteaParams) continue;

      // Derive target file path to extract TDC_NAME
      const targetFile = path.join(__dirname, '..', 'targets', config.target);
      if (!fs.existsSync(targetFile)) continue;

      // Read just the first line to get TDC_NAME
      const fd = fs.openSync(targetFile, 'r');
      const buf = Buffer.alloc(256);
      fs.readSync(fd, buf, 0, 256, 0);
      fs.closeSync(fd);
      const firstLine = buf.toString('utf8').split('\n')[0];

      const { extractTdcName } = require('./tdc-utils');
      const tdcName = extractTdcName(firstLine);
      if (!tdcName) continue;

      // Skip if this TDC_NAME is already in cache (avoid duplicates for shared templates)
      if (this._cache[tdcName]) continue;

      const cacheEntry = {
        template: config.template,
        key: config.xteaParams.key,
        delta: config.xteaParams.delta,
        rounds: config.xteaParams.rounds,
        keyModConstants: config.xteaParams.keyModConstants,
        caseCount: config.caseCount,
        lastSeen: new Date().toISOString()
      };
      // Add keyMods from config if available, otherwise derive from keyModConstants
      if (config.xteaParams.keyMods) {
        cacheEntry.keyMods = config.xteaParams.keyMods;
      } else if (config.xteaParams.keyModConstants) {
        cacheEntry.keyMods = [0, config.xteaParams.keyModConstants[0], 0, config.xteaParams.keyModConstants[1]];
      }
      // Add cdFieldOrder from config if available
      if (config.cdFieldOrder) {
        cacheEntry.cdFieldOrder = config.cdFieldOrder;
      }
      this._cache[tdcName] = cacheEntry;
    }
    this.save();
  }

  /**
   * Normalize a cache entry to ensure keyMods is present.
   * Converts legacy keyModConstants [v1, v3] → keyMods [0, v1, 0, v3].
   * @param {object} entry - Cache entry
   * @returns {object} Normalized entry (same reference, mutated in place)
   */
  static _normalizeEntry(entry) {
    if (!entry.keyMods && entry.keyModConstants) {
      entry.keyMods = [0, entry.keyModConstants[0], 0, entry.keyModConstants[1]];
    }
    return entry;
  }
}

module.exports = TemplateCache;
