'use strict';

/**
 * test-collector-schema.js — Verification tests for Task 7.6 (Collector Data Schema)
 *
 * Tests the COLLECTOR_SCHEMA, validateCollectorData, and buildDefaultCdArray
 * against the ground truth in output/dynamic/collector-map.json
 */

const path = require('path');
const { COLLECTOR_SCHEMA, validateCollectorData, buildDefaultCdArray } = require('../token/collector-schema');
const collectorMap = require('../output/dynamic/collector-map.json');

let pass = 0;
let fail = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    pass++;
    console.log(`  ✅ ${message}`);
  } else {
    fail++;
    console.log(`  ❌ FAIL: ${message}`);
  }
}

function assertEq(actual, expected, message) {
  total++;
  if (actual === expected) {
    pass++;
    console.log(`  ✅ ${message}`);
  } else {
    fail++;
    console.log(`  ❌ FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ════════════════════════════════════════════════════════════════
// 1. Schema Completeness — exactly 59 entries
// ════════════════════════════════════════════════════════════════
console.log('\n═══ 1. Schema Completeness ═══');

assertEq(COLLECTOR_SCHEMA.length, 59, 'COLLECTOR_SCHEMA has exactly 59 entries');

// Check indices are sequential 0-58
const indices = COLLECTOR_SCHEMA.map(e => e.index);
const expectedIndices = Array.from({ length: 59 }, (_, i) => i);
assert(JSON.stringify(indices) === JSON.stringify(expectedIndices),
  'Indices are sequential 0-58');

// Check no duplicate indices
const uniqueIndices = new Set(indices);
assertEq(uniqueIndices.size, 59, 'No duplicate indices');

// Check all required fields present in each entry
const requiredFields = ['index', 'name', 'type', 'apiSource', 'description', 'sampleValue', 'required', 'category'];
let missingFields = [];
for (const entry of COLLECTOR_SCHEMA) {
  for (const field of requiredFields) {
    if (!(field in entry)) {
      missingFields.push(`[${entry.index}] missing '${field}'`);
    }
  }
}
assert(missingFields.length === 0,
  `All entries have required fields (${missingFields.length === 0 ? 'OK' : missingFields.join(', ')})`);

// ════════════════════════════════════════════════════════════════
// 2. Type Accuracy — all 59 types match ground truth
// ════════════════════════════════════════════════════════════════
console.log('\n═══ 2. Type Accuracy (vs collector-map.json) ═══');

const groundTruthTypes = collectorMap.collectorTypes;
let typeMismatches = [];

for (let i = 0; i < 59; i++) {
  const schemaEntry = COLLECTOR_SCHEMA[i];
  const gtEntry = groundTruthTypes[String(i)];

  if (!gtEntry) {
    typeMismatches.push(`[${i}] no ground truth entry`);
    continue;
  }

  if (schemaEntry.type !== gtEntry.type) {
    typeMismatches.push(`[${i}] ${schemaEntry.name}: schema='${schemaEntry.type}' gt='${gtEntry.type}'`);
  }
}

assertEq(typeMismatches.length, 0,
  `All 59 type fields match ground truth (${typeMismatches.length} mismatches)`);
if (typeMismatches.length > 0) {
  typeMismatches.forEach(m => console.log(`    → ${m}`));
}

// Individual type checks for key fields (spot-check)
const spotChecks = [
  [0, 'number', 'callCounter'],
  [1, 'string', 'osPlatform'],
  [6, 'array', 'languages'],
  [9, 'array', 'screenResolution'],
  [18, 'object', 'audioFingerprint'],
  [21, 'object', 'storageEstimate'],
  [35, 'null', 'connectionInfo'],
  [46, 'object', 'userAgentData'],
];
for (const [idx, expectedType, name] of spotChecks) {
  assertEq(COLLECTOR_SCHEMA[idx].type, expectedType, `[${idx}] ${name} type is '${expectedType}'`);
}

// ════════════════════════════════════════════════════════════════
// 3. Sample Roundtrip — validateCollectorData on ground truth cdArray
// ════════════════════════════════════════════════════════════════
console.log('\n═══ 3. Sample Roundtrip Validation ═══');

const cdArray = collectorMap.cdArray;
assertEq(cdArray.length, 59, 'Ground truth cdArray has 59 entries');

const result = validateCollectorData(cdArray);
assert(result.valid === true, `validateCollectorData returns valid=true (errors: ${result.errors.length})`);
assertEq(result.errors.length, 0, 'Zero validation errors on ground truth');

if (result.errors.length > 0) {
  console.log('    Validation errors:');
  result.errors.forEach(e => console.log(`      → ${e}`));
}

// Test edge cases for validator
const badResults1 = validateCollectorData('not an array');
assert(badResults1.valid === false, 'Rejects non-array input');

const badResults2 = validateCollectorData([1, 2, 3]);
assert(badResults2.valid === false, 'Rejects wrong-length array');

const badResults3 = validateCollectorData(null);
assert(badResults3.valid === false, 'Rejects null input');

// ════════════════════════════════════════════════════════════════
// 4. API Attribution — ≥45 fields with non-empty apiSource
// ════════════════════════════════════════════════════════════════
console.log('\n═══ 4. API Attribution ═══');

const internalSources = ['internal'];
let fieldsWithApi = 0;
let fieldsInternal = 0;
let fieldsEmpty = [];

for (const entry of COLLECTOR_SCHEMA) {
  if (!entry.apiSource || entry.apiSource.trim() === '') {
    fieldsEmpty.push(`[${entry.index}] ${entry.name}`);
  } else if (internalSources.includes(entry.apiSource)) {
    fieldsInternal++;
    fieldsWithApi++; // internal counts as identified
  } else {
    fieldsWithApi++;
  }
}

assert(fieldsWithApi >= 45, `≥45 fields have identified API sources (${fieldsWithApi}/59, ${fieldsInternal} internal)`);
assertEq(fieldsEmpty.length, 0, `No fields with empty apiSource (${fieldsEmpty.length} empty)`);
if (fieldsEmpty.length > 0) {
  fieldsEmpty.forEach(f => console.log(`    → ${f}`));
}

// Check that known fields have reasonable API sources
const apiSpotChecks = [
  [8, 'navigator.hardwareConcurrency', 'hardwareConcurrency'],
  [31, 'navigator.userAgent', 'userAgent'],
  [48, 'navigator.platform', 'platform'],
  [49, 'screen.colorDepth', 'colorDepth'],
  [22, 'location.href', 'pageUrl'],
  [32, 'document.characterSet', 'characterSet'],
];
for (const [idx, expectedApi, name] of apiSpotChecks) {
  assert(COLLECTOR_SCHEMA[idx].apiSource.includes(expectedApi) ||
         COLLECTOR_SCHEMA[idx].apiSource === expectedApi,
    `[${idx}] ${name} apiSource contains '${expectedApi}'`);
}

// ════════════════════════════════════════════════════════════════
// 5. Default Builder — buildDefaultCdArray produces valid output
// ════════════════════════════════════════════════════════════════
console.log('\n═══ 5. Default Builder ═══');

// 5a. No-args call
const defaultCd = buildDefaultCdArray();
assertEq(defaultCd.length, 59, 'buildDefaultCdArray() returns 59-element array');

const defaultValidation = validateCollectorData(defaultCd);
assert(defaultValidation.valid === true,
  `Default array passes validation (errors: ${defaultValidation.errors.length})`);
if (defaultValidation.errors.length > 0) {
  defaultValidation.errors.forEach(e => console.log(`    → ${e}`));
}

// 5b. Custom profile
const customCd = buildDefaultCdArray({
  platform: 'Win32',
  osPlatform: 'windows',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  screenWidth: 2560,
  screenHeight: 1440,
  viewportWidth: 1280,
  availHeight: 1400,
  colorDepth: 32,
  hardwareConcurrency: 16,
  languages: ['en-US', 'en'],
  timezone: 'America/New_York',
  timezoneOffset: '-05',
  timestamp: 1700000000,
});
assertEq(customCd.length, 59, 'Custom profile returns 59-element array');

const customValidation = validateCollectorData(customCd);
assert(customValidation.valid === true,
  `Custom profile passes validation (errors: ${customValidation.errors.length})`);
if (customValidation.errors.length > 0) {
  customValidation.errors.forEach(e => console.log(`    → ${e}`));
}

// Verify custom values were applied
assertEq(customCd[1], 'windows', 'Custom osPlatform applied');
assertEq(customCd[48], 'Win32', 'Custom platform applied');
assertEq(customCd[8], 16, 'Custom hardwareConcurrency applied');
assertEq(customCd[49], 32, 'Custom colorDepth applied');
assert(Array.isArray(customCd[6]) && customCd[6].length === 2,
  'Custom languages applied (2 items)');
assertEq(customCd[16], 1700000000, 'Custom timestamp applied');
assertEq(customCd[26], '-05', 'Custom timezoneOffset applied');
assert(customCd[9][0] === 2560 && customCd[9][1] === 1440,
  'Custom screen resolution applied');

// 5c. Type checks on every element of default array
let typeErrors = [];
for (let i = 0; i < 59; i++) {
  const entry = COLLECTOR_SCHEMA[i];
  const value = defaultCd[i];
  const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (actualType !== entry.type) {
    typeErrors.push(`[${i}] ${entry.name}: expected '${entry.type}', got '${actualType}'`);
  }
}
assert(typeErrors.length === 0,
  `All 59 default elements have correct types (${typeErrors.length} errors)`);
if (typeErrors.length > 0) {
  typeErrors.forEach(e => console.log(`    → ${e}`));
}

// ════════════════════════════════════════════════════════════════
// 6. Schema Quality Checks
// ════════════════════════════════════════════════════════════════
console.log('\n═══ 6. Schema Quality Checks ═══');

// All names are non-empty strings
assert(COLLECTOR_SCHEMA.every(e => typeof e.name === 'string' && e.name.length > 0),
  'All entries have non-empty name');

// All descriptions are non-empty strings
assert(COLLECTOR_SCHEMA.every(e => typeof e.description === 'string' && e.description.length > 0),
  'All entries have non-empty description');

// All required flags are true
assert(COLLECTOR_SCHEMA.every(e => e.required === true),
  'All entries have required=true');

// All categories are valid
const validCategories = ['hardware', 'screen', 'browser', 'fingerprint', 'timing', 'network', 'internal'];
const invalidCategories = COLLECTOR_SCHEMA.filter(e => !validCategories.includes(e.category));
assert(invalidCategories.length === 0,
  `All categories are valid (${invalidCategories.length === 0 ? 'OK' : invalidCategories.map(e => `[${e.index}]=${e.category}`).join(', ')})`);

// Type values are all valid
const validTypes = ['number', 'string', 'array', 'object', 'null'];
assert(COLLECTOR_SCHEMA.every(e => validTypes.includes(e.type)),
  'All type values are valid (number/string/array/object/null)');

// Check async fields documented
const asyncIndices = [21, 37, 42];
for (const idx of asyncIndices) {
  assert(COLLECTOR_SCHEMA[idx].description.includes('_state') || COLLECTOR_SCHEMA[idx].description.includes('async'),
    `[${idx}] ${COLLECTOR_SCHEMA[idx].name} documents async/_state behavior`);
}

// Unique names
const names = COLLECTOR_SCHEMA.map(e => e.name);
const uniqueNames = new Set(names);
assertEq(uniqueNames.size, 59, 'All 59 entries have unique names');

// ════════════════════════════════════════════════════════════════
// 7. Documentation Check — COLLECTOR_SCHEMA.md exists and covers all fields
// ════════════════════════════════════════════════════════════════
console.log('\n═══ 7. Documentation Completeness ═══');

const fs = require('fs');
const docPath = path.join(__dirname, '..', 'docs', 'COLLECTOR_SCHEMA.md');
const docExists = fs.existsSync(docPath);
assert(docExists, 'docs/COLLECTOR_SCHEMA.md exists');

if (docExists) {
  const docContent = fs.readFileSync(docPath, 'utf8');

  // Check all 59 indices mentioned
  let missingInDoc = [];
  for (let i = 0; i < 59; i++) {
    // Look for the index number in a table row context (| N |)
    const pattern = new RegExp(`\\|\\s*${i}\\s*\\|`);
    if (!pattern.test(docContent)) {
      missingInDoc.push(i);
    }
  }
  assert(missingInDoc.length === 0,
    `All 59 indices appear in documentation (missing: ${missingInDoc.length === 0 ? 'none' : missingInDoc.join(', ')})`);

  // Check category headers
  const expectedHeaders = ['Hardware', 'Screen', 'Browser', 'Fingerprint', 'Timing', 'Network', 'Internal'];
  for (const header of expectedHeaders) {
    assert(docContent.includes(header),
      `Documentation has '${header}' category`);
  }

  // Check async fields section
  assert(docContent.includes('_state') || docContent.includes('Async'),
    'Documentation covers async fields');
}

// ════════════════════════════════════════════════════════════════
// 8. Cross-validation: Schema sampleValues vs ground truth
// ════════════════════════════════════════════════════════════════
console.log('\n═══ 8. Sample Value Cross-Validation ═══');

// Check that sampleValue types match schema type (internal consistency)
let sampleTypeErrors = [];
for (const entry of COLLECTOR_SCHEMA) {
  const sv = entry.sampleValue;
  const svType = sv === null ? 'null' : Array.isArray(sv) ? 'array' : typeof sv;
  if (svType !== entry.type) {
    sampleTypeErrors.push(`[${entry.index}] ${entry.name}: sampleValue type '${svType}' !== schema type '${entry.type}'`);
  }
}
assert(sampleTypeErrors.length === 0,
  `All sampleValue types match schema types (${sampleTypeErrors.length} errors)`);
if (sampleTypeErrors.length > 0) {
  sampleTypeErrors.forEach(e => console.log(`    → ${e}`));
}

// Spot-check specific sample values against ground truth
const gtCdArray = collectorMap.cdArray;
const valueSpotChecks = [
  [0, 'callCounter'],
  [1, 'osPlatform'],
  [2, 'touchSupport'],
  [3, 'viewportWidth'],
  [8, 'hardwareConcurrency'],
  [15, 'canvasHash'],
  [26, 'timezoneOffset'],
  [28, 'colorGamut'],
  [38, 'internalToken'],
  [41, 'frameStatus'],
  [44, 'availHeight'],
  [48, 'platform'],
  [49, 'colorDepth'],
  [57, 'featureBitmask'],
];
let valueMismatches = 0;
for (const [idx, name] of valueSpotChecks) {
  const schemaVal = COLLECTOR_SCHEMA[idx].sampleValue;
  const gtVal = gtCdArray[idx];
  // For simple types, compare directly
  if (typeof schemaVal !== 'object' || schemaVal === null) {
    if (schemaVal !== gtVal) {
      console.log(`    ⚠ [${idx}] ${name}: schema sample=${JSON.stringify(schemaVal)}, gt=${JSON.stringify(gtVal)}`);
      valueMismatches++;
    }
  }
}
assert(valueMismatches === 0,
  `Sample value spot-checks match ground truth (${valueMismatches} mismatches in ${valueSpotChecks.length} checks)`);


// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
console.log(`TOTAL: ${total} | PASS: ${pass} | FAIL: ${fail}`);
console.log(`Result: ${fail === 0 ? 'ALL PASS ✅' : `${fail} FAILURES ❌`}`);
console.log('══════════════════════════════════════════\n');

process.exit(fail > 0 ? 1 : 0);
