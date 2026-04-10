'use strict';

const fs = require('fs');
const path = require('path');

// 1. Load the browser capture
const verifyPost = require('../output/puppeteer-capture/verify-post.json');

// 2. Extract browser's vData and remove from fields
const browserVData = verifyPost.vData;
const postFields = { ...verifyPost };
delete postFields.vData;

console.log('=== vData & jQuery Serialization Comparison: jsdom vs Browser ===\n');
console.log(`Post fields: ${Object.keys(postFields).length} fields (vData excluded)`);
console.log(`Browser vData: ${browserVData.length} chars`);

// 3. Load vm-slide and jQuery sources
const vmSlidePath = path.join(__dirname, '..', 'sample', 'vm_slide.js');
const jqueryPath = path.join(__dirname, '..', 'sample', 'slide-jy.js');
const vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
const jquerySource = fs.readFileSync(jqueryPath, 'utf8');

console.log(`vm-slide source: ${vmSlidePath} (${vmSlideSource.length} bytes)`);
console.log(`jQuery source: ${jqueryPath} (${jquerySource.length} bytes)\n`);

// 4. Generate vData using jsdom
const { generateVData } = require('../scraper/vdata-generator');

let jsdomVData, jsdomSerialized;
try {
  const result = generateVData(postFields, vmSlideSource, jquerySource);
  jsdomVData = result.vData;
  jsdomSerialized = result.serializedBody;
  console.log('jsdom vData generation: SUCCESS');
  console.log(`jsdom vData: ${jsdomVData.length} chars`);
  console.log(`jsdom serializedBody: ${jsdomSerialized.length} chars\n`);
} catch (err) {
  console.error('jsdom vData generation FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}

// 5. Reconstruct browser's serialized body from fields
// Method A: insertion order (Object.keys preserves it from JSON parse)
function manualSerialize(fields) {
  return Object.keys(fields)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]))
    .join('&');
}

const browserSerializedInsertionOrder = manualSerialize(postFields);

console.log('--- Serialization Comparison ---\n');
console.log(`jsdom jQuery.param length:       ${jsdomSerialized.length}`);
console.log(`manual encodeURIComponent length: ${browserSerializedInsertionOrder.length}`);

// Helper: find first divergence and context
function findDivergence(a, b) {
  const minLen = Math.min(a.length, b.length);
  let firstDiv = null;
  let totalDiffs = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length || i >= b.length || a[i] !== b[i]) {
      totalDiffs++;
      if (firstDiv === null) firstDiv = i;
    }
  }

  let aContext = null;
  let bContext = null;
  if (firstDiv !== null) {
    const start = Math.max(0, firstDiv - 30);
    const end = Math.min(Math.max(a.length, b.length), firstDiv + 30);
    aContext = a.substring(start, end);
    bContext = b.substring(start, end);
  }

  return { firstDiv, totalDiffs, aContext, bContext };
}

// Compare jsdom serialization vs manual serialization
const serComp = findDivergence(jsdomSerialized, browserSerializedInsertionOrder);
if (serComp.firstDiv === null) {
  console.log('jQuery.param vs manual encodeURIComponent: IDENTICAL\n');
} else {
  console.log(`jQuery.param vs manual: DIFFER at index ${serComp.firstDiv} (${serComp.totalDiffs} total diffs)`);
  console.log(`  jsdom context:  ...${serComp.aContext}...`);
  console.log(`  manual context: ...${serComp.bContext}...\n`);

  // Show specific character differences around divergence
  const idx = serComp.firstDiv;
  console.log(`  At index ${idx}: jsdom='${jsdomSerialized[idx]}' (0x${jsdomSerialized.charCodeAt(idx).toString(16)}) vs manual='${browserSerializedInsertionOrder[idx]}' (0x${browserSerializedInsertionOrder.charCodeAt(idx).toString(16)})`);

  // Find which field the divergence is in
  let pos = 0;
  for (const key of Object.keys(postFields)) {
    const encoded = encodeURIComponent(key) + '=' + encodeURIComponent(postFields[key]);
    if (idx >= pos && idx < pos + encoded.length) {
      console.log(`  Divergence is in field: ${key} (field starts at index ${pos})`);
      break;
    }
    pos += encoded.length + 1; // +1 for '&'
  }
  console.log();
}

// Also check if jQuery.param encodes '+' differently than encodeURIComponent
// jQuery.param uses encodeURIComponent which turns '+' into '%2B'
// But some jQuery versions replace %20 with '+' (jQuery < 1.4 or with traditional mode)
const plusCheck = jsdomSerialized.includes('+');
const pctPlusCheck = jsdomSerialized.includes('%2B');
console.log(`jsdom serialized contains literal '+': ${plusCheck}`);
console.log(`jsdom serialized contains '%2B': ${pctPlusCheck}`);
const manualPlusCheck = browserSerializedInsertionOrder.includes('+');
const manualPctPlusCheck = browserSerializedInsertionOrder.includes('%2B');
console.log(`manual serialized contains literal '+': ${manualPlusCheck}`);
console.log(`manual serialized contains '%2B': ${manualPctPlusCheck}`);

// Check space encoding
const jsdomSpaceAsPct20 = (jsdomSerialized.match(/%20/g) || []).length;
const jsdomSpaceAsPlus = (jsdomSerialized.match(/\+/g) || []).length;
console.log(`jsdom: %20 count=${jsdomSpaceAsPct20}, '+' count=${jsdomSpaceAsPlus}`);

console.log();

// 6. Compare vData values
console.log('--- vData Comparison ---\n');
console.log(`Browser vData: ${browserVData.length} chars`);
console.log(`jsdom vData:   ${jsdomVData.length} chars`);

const vdataComp = findDivergence(jsdomVData, browserVData);
if (vdataComp.firstDiv === null) {
  console.log('vData: IDENTICAL');
} else {
  console.log(`vData: DIFFER at index ${vdataComp.firstDiv} (${vdataComp.totalDiffs} total diffs)`);
  console.log(`  jsdom:   ${jsdomVData.substring(0, 80)}...`);
  console.log(`  browser: ${browserVData.substring(0, 80)}...`);
  if (vdataComp.aContext) {
    console.log(`  jsdom context around divergence:   ...${vdataComp.aContext}...`);
    console.log(`  browser context around divergence: ...${vdataComp.bContext}...`);
  }
}

console.log(`\nBrowser vData value: ${browserVData}`);
console.log(`jsdom vData value:   ${jsdomVData}`);

// 7. Build result object
const serializationMatch = serComp.firstDiv === null;
const vDataMatch = vdataComp.firstDiv === null;

let conclusion;
if (serializationMatch && vDataMatch) {
  conclusion = 'Both jQuery serialization and vData are identical between jsdom and browser. The issue is likely elsewhere (TLS fingerprinting, timing, or other headers).';
} else if (!serializationMatch && !vDataMatch) {
  conclusion = 'Both jQuery serialization and vData differ. The serialization difference likely causes the vData difference (since vData is computed from the serialized body).';
} else if (!serializationMatch) {
  conclusion = 'jQuery serialization differs but vData matches (unexpected). Check if vData is computed independently of the serialized body.';
} else {
  conclusion = 'jQuery serialization matches but vData differs. The vm-slide VM produces different output in jsdom vs Chrome. This may be due to environment detection (navigator, screen, etc.) or vm-slide version mismatch.';
}

console.log(`\n=== Conclusion ===\n${conclusion}\n`);

const result = {
  timestamp: new Date().toISOString(),
  description: 'vData and jQuery serialization comparison: jsdom vs browser',
  vmSlideSource: {
    path: vmSlidePath,
    sizeBytes: vmSlideSource.length,
  },
  serialization: {
    jsdomLength: jsdomSerialized.length,
    manualLength: browserSerializedInsertionOrder.length,
    match: serializationMatch,
    firstDivergenceAt: serComp.firstDiv,
    jsdomContext: serComp.aContext,
    manualContext: serComp.bContext,
    totalDiffs: serComp.totalDiffs,
    jsdomHasLiteralPlus: plusCheck,
    jsdomHasPctEncodedPlus: pctPlusCheck,
    notes: serializationMatch
      ? 'jQuery.param in jsdom produces identical output to manual encodeURIComponent serialization.'
      : 'jQuery.param in jsdom differs from manual encodeURIComponent serialization. Check encoding of special characters (+, spaces, *, !).',
  },
  vData: {
    jsdomLength: jsdomVData.length,
    browserLength: browserVData.length,
    jsdomValue: jsdomVData,
    browserValue: browserVData,
    match: vDataMatch,
    firstDivergenceAt: vdataComp.firstDiv,
    totalDiffs: vdataComp.totalDiffs,
    notes: vDataMatch
      ? 'vData is identical between jsdom and browser.'
      : `vData differs. ${jsdomVData.length === browserVData.length ? 'Same length but different content.' : 'Different lengths.'} vm-slide may detect jsdom environment or depend on browser-specific APIs.`,
  },
  conclusion,
};

// 8. Write output
const outputPath = path.join(__dirname, '..', 'output', 'vdata-comparison.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(`Results written to: ${outputPath}`);
