'use strict';

const fs = require('fs');
const path = require('path');

const { parseVmFunction } = require('./vm-parser');
const { mapOpcodes } = require('./opcode-mapper');
const { extractKey } = require('./key-extractor');
const { verifyToken } = require('./token-verifier');
const { extractStructure } = require('./structure-extractor');
const { deobfuscate } = require('./deobfuscator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the output stem from a target path.
 * e.g. "targets/tdc-v4.js" => "tdc-v4", "targets/tdc.js" => "tdc"
 */
function deriveStem(tdcPath) {
  return path.basename(tdcPath, '.js');
}

/**
 * Classify template based on case count.
 */
function classifyTemplate(caseCount) {
  if (caseCount === 95) return 'A';
  if (caseCount === 94) return 'B';
  if (caseCount === 100) return 'C';
  return 'unknown';
}

/**
 * Format a 32-bit unsigned integer as hex string like 0x6257584F.
 */
function hex32(n) {
  return '0x' + ((n >>> 0).toString(16).toUpperCase().padStart(8, '0'));
}

/**
 * Write a JSON file to the output directory, creating the directory if needed.
 */
function saveJson(outputDir, filename, data) {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  return filePath;
}

function log(msg) {
  console.log(`[port] ${msg}`);
}

// ---------------------------------------------------------------------------
// Pipeline orchestrator
// ---------------------------------------------------------------------------

/**
 * Port a new tdc.js build through the full pipeline.
 *
 * @param {string} tdcPath - Path to the tdc.js file
 * @param {object} [options]
 * @param {boolean} [options.skipVerify] - Skip Stage 4 (token verification)
 * @param {boolean} [options.skipStructure] - Skip Stage 5 (structure extraction)
 * @returns {Promise<object>} Pipeline result
 */
async function portVersion(tdcPath, options) {
  const opts = options || {};
  const stem = deriveStem(tdcPath);
  const outputDir = path.join('output', stem);
  const resolvedPath = path.resolve(tdcPath);

  log(`Starting pipeline for ${tdcPath}`);

  const result = {
    success: false,
    failedStage: null,
    error: null,
    stem,
    outputDir,
    parsed: null,
    mapped: null,
    keyResult: null,
    verifyResult: null,
    structureResult: null
  };

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // =========================================================================
  // Stage 1: Parse VM
  // =========================================================================
  let parsed;
  let src;
  try {
    src = fs.readFileSync(resolvedPath, 'utf8');
    parsed = parseVmFunction(src);
    result.parsed = parsed;

    const varNames = [
      parsed.variables.bytecode,
      parsed.variables.pc,
      parsed.variables.regs,
      parsed.variables.thisCtx,
      parsed.variables.catchStack,
      parsed.variables.excVal
    ].filter(Boolean).join('/');

    log(`Stage 1/5: Parsing VM... found ${parsed.caseCount} opcodes, variables: ${varNames}`);
  } catch (err) {
    log(`Stage 1/5: Parsing VM... FAILED`);
    log(`Error: ${err.message}`);
    log(`Partial results saved to ${outputDir}/`);
    result.failedStage = 1;
    result.error = err.message;
    return result;
  }

  // =========================================================================
  // Stage 1.5: Deobfuscate if needed
  // =========================================================================
  const deobResult = deobfuscate(src);
  if (deobResult.isObfuscated) {
    log(`Stage 1.5/5: Deobfuscating... ${deobResult.stats.decoderReplacements} decoder replacements, ${deobResult.stats.helperReplacements} helper replacements`);
    src = deobResult.deobfuscated;
    // Re-parse with deobfuscated source for accurate variable extraction
    parsed = parseVmFunction(src);
  }

  // =========================================================================
  // Stage 2: Map Opcodes
  // =========================================================================
  let mapped;
  try {
    mapped = mapOpcodes(parsed, src);
    result.mapped = mapped;

    const mappedCount = Object.keys(mapped.opcodeTable).length;
    const unmappedCount = mapped.unmapped.length;
    const template = classifyTemplate(parsed.caseCount);

    log(`Stage 2/5: Mapping opcodes... ${mappedCount}/${parsed.caseCount} mapped, ${unmappedCount} unmapped (Template ${template})`);

    // Save opcode-table.json
    saveJson(outputDir, 'opcode-table.json', mapped.opcodeTable);
  } catch (err) {
    log(`Stage 2/5: Mapping opcodes... FAILED`);
    log(`Error: ${err.message}`);
    log(`Partial results saved to ${outputDir}/`);
    result.failedStage = 2;
    result.error = err.message;
    return result;
  }

  // =========================================================================
  // Stage 3: Extract XTEA Key
  // =========================================================================
  let keyResult;
  try {
    keyResult = await extractKey(resolvedPath, mapped.opcodeTable, parsed.variables);
    result.keyResult = keyResult;

    const keyHex = keyResult.key
      ? `[${keyResult.key.map(hex32).join(', ')}]`
      : 'null';
    const deltaHex = keyResult.delta ? hex32(keyResult.delta) : 'null';
    const rounds = keyResult.rounds || 'unknown';

    log(`Stage 3/5: Extracting XTEA key... key=${keyHex} delta=${deltaHex} rounds=${rounds}`);

    // Save xtea-params.json
    saveJson(outputDir, 'xtea-params.json', keyResult);
  } catch (err) {
    log(`Stage 3/5: Extracting XTEA key... FAILED`);
    log(`Error: ${err.message}`);
    log(`Partial results saved to ${outputDir}/`);
    result.failedStage = 3;
    result.error = err.message;

    // Save partial pipeline-config
    savePipelineConfig(outputDir, tdcPath, parsed, mapped, null, null, null);
    return result;
  }

  // =========================================================================
  // Stage 4: Verify Token
  // =========================================================================
  let verifyResult = null;
  if (opts.skipVerify) {
    log('Stage 4/5: Verifying token... SKIPPED (--skip-verify)');
  } else {
    try {
      verifyResult = await verifyToken(resolvedPath, keyResult);
      result.verifyResult = verifyResult;

      if (verifyResult.match) {
        const segInfo = verifyResult.segments
          ? verifyResult.segments.filter(s => s.match).length + '/' + verifyResult.segments.length + ' segments identical'
          : 'all segments identical';
        log(`Stage 4/5: Verifying token... MATCH (${verifyResult.liveTokenLength} chars, ${segInfo})`);
      } else {
        log(`Stage 4/5: Verifying token... MISMATCH (live=${verifyResult.liveTokenLength} standalone=${verifyResult.standaloneTokenLength})`);
      }

      // Save verification-report.json
      saveJson(outputDir, 'verification-report.json', verifyResult);
    } catch (err) {
      log(`Stage 4/5: Verifying token... FAILED`);
      log(`Error: ${err.message}`);
      log(`Partial results saved to ${outputDir}/`);
      result.failedStage = 4;
      result.error = err.message;

      // Save partial pipeline-config
      savePipelineConfig(outputDir, tdcPath, parsed, mapped, keyResult, null, null);
      return result;
    }
  }

  // =========================================================================
  // Stage 5: Extract Structure
  // =========================================================================
  let structureResult = null;
  if (opts.skipStructure) {
    log('Stage 5/5: Extracting structure... SKIPPED (--skip-structure)');
  } else {
    try {
      // Build xteaParams from keyResult for structure extraction
      const xteaParams = {
        key: keyResult.key,
        delta: keyResult.delta,
        rounds: keyResult.rounds,
        keyMods: keyResult.keyMods || [0, 0, 0, 0],
      };
      structureResult = await extractStructure(resolvedPath, xteaParams);
      result.structureResult = structureResult;

      if (structureResult.success) {
        log(`Stage 5/5: Extracting structure... hash@${structureResult.hashPosition}, ${structureResult.fieldOrder ? structureResult.fieldOrder.filter(x => x >= 0).length + ' fields matched' : 'no field order'}, split=${structureResult.headerSplit ? structureResult.headerSplit.strategy : 'unknown'}`);
      } else {
        log(`Stage 5/5: Extracting structure... FAILED (${structureResult.error})`);
      }

      saveJson(outputDir, 'structure-params.json', structureResult);
    } catch (err) {
      log(`Stage 5/5: Extracting structure... FAILED`);
      log(`Error: ${err.message}`);
      // Non-fatal: structure extraction failure doesn't block the pipeline
    }
  }

  // =========================================================================
  // Save combined pipeline-config.json
  // =========================================================================
  const configPath = savePipelineConfig(outputDir, tdcPath, parsed, mapped, keyResult, verifyResult, structureResult);

  result.success = true;
  log(`Pipeline complete. Config saved to ${configPath}`);

  return result;
}

/**
 * Build and save the combined pipeline-config.json.
 */
function savePipelineConfig(outputDir, tdcPath, parsed, mapped, keyResult, verifyResult, structureResult) {
  const config = {
    target: path.basename(tdcPath),
    template: parsed ? classifyTemplate(parsed.caseCount) : 'unknown',
    caseCount: parsed ? parsed.caseCount : null,
    variables: parsed ? parsed.variables : null,
    opcodeTable: mapped ? mapped.opcodeTable : null,
    unmappedOpcodes: mapped ? mapped.unmapped : null,
    xteaParams: keyResult ? {
      key: keyResult.key,
      delta: keyResult.delta,
      rounds: keyResult.rounds,
      keyModConstants: keyResult.keyModConstants,
      keyMods: keyResult.keyMods || null
    } : null,
    tokenVerified: verifyResult ? verifyResult.match : null,
    structureParams: structureResult && structureResult.success ? {
      hashPosition: structureResult.hashPosition,
      fieldOrder: structureResult.fieldOrder,
      serializationDiffs: structureResult.serializationDiffs,
      headerSplit: structureResult.headerSplit,
    } : null,
    timestamp: new Date().toISOString()
  };

  return saveJson(outputDir, 'pipeline-config.json', config);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse flags
  const skipVerify = args.includes('--skip-verify');
  const skipStructure = args.includes('--skip-structure');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 1) {
    console.error('Usage: node pipeline/run.js <tdc-path> [--skip-verify] [--skip-structure]');
    process.exit(1);
  }

  const tdcPath = positional[0];

  if (!fs.existsSync(tdcPath)) {
    console.error(`Error: File not found: ${tdcPath}`);
    process.exit(1);
  }

  portVersion(tdcPath, { skipVerify, skipStructure })
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error(`[port] Fatal error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { portVersion };
