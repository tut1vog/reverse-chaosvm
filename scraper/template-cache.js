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
   * @param {string} tdcName
   * @returns {object|null} Entry with {template, key, delta, rounds, keyModConstants, caseCount} or null
   */
  lookup(tdcName) {
    return this._cache[tdcName] || null;
  }

  /**
   * Look up cached XTEA params by template structure (caseCount).
   * Returns the first entry that matches the given caseCount.
   * @param {number} caseCount - Number of opcodes in the VM dispatch switch
   * @returns {object|null} Entry with {template, key, delta, rounds, keyModConstants, caseCount} or null
   */
  lookupByStructure(caseCount) {
    for (const [, entry] of Object.entries(this._cache)) {
      if (entry.caseCount === caseCount) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Add or update an entry, set lastSeen timestamp, and save.
   * @param {string} tdcName
   * @param {object} params - {template, key, delta, rounds, keyModConstants, caseCount}
   */
  store(tdcName, params) {
    this._cache[tdcName] = Object.assign({}, params, {
      lastSeen: new Date().toISOString()
    });
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

      this._cache[tdcName] = {
        template: config.template,
        key: config.xteaParams.key,
        delta: config.xteaParams.delta,
        rounds: config.xteaParams.rounds,
        keyModConstants: config.xteaParams.keyModConstants,
        caseCount: config.caseCount,
        lastSeen: new Date().toISOString()
      };
    }
    this.save();
  }
}

module.exports = TemplateCache;
