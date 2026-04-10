'use strict';

const { JSDOM } = require('jsdom');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

/**
 * Generate vData by executing vm-slide.enc.js in a jsdom environment.
 *
 * The vm-slide VM (__TENCENT_CHAOS_STACK) hooks XMLHttpRequest.prototype.send.
 * When an XHR POST fires, the hook computes vData from the serialized body
 * and appends it before calling the original send. We exploit this by:
 *   1. Hooking XHR.send BEFORE loading the VM (so the VM saves our hook as "original")
 *   2. Loading jQuery + vm-slide into jsdom
 *   3. Firing a jQuery.ajax POST — the VM intercepts, adds vData, calls our hook
 *   4. Our hook captures the final body (with vData) without any network I/O
 *
 * @param {Object} postFields - The verify POST fields (object with string values)
 * @param {string} vmSlideSource - The vm-slide.enc.js (or decoded vm_slide.js) source code
 * @param {string} jquerySource - jQuery/Zepto source code string
 * @param {Object} [options]
 * @param {string} [options.userAgent] - navigator.userAgent to stub
 * @returns {{vData: string, serializedBody: string}}
 */
function generateVData(postFields, vmSlideSource, jquerySource, options) {
  const userAgent = (options && options.userAgent) || DEFAULT_USER_AGENT;

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://t.captcha.qq.com/cap_union_new_show',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    userAgent,
  });
  const { window } = dom;

  try {
    // Step 1: Hook XHR.send BEFORE loading the VM.
    // The VM will save this hook as the "original" send and wrap it.
    let capturedBody = null;
    window.XMLHttpRequest.prototype.send = function (body) {
      capturedBody = body;
    };

    // Step 2: Load jQuery into the jsdom window.
    window.eval(jquerySource);
    if (typeof window.jQuery !== 'function') {
      throw new Error('jQuery failed to load in jsdom');
    }

    // Step 3: Load vm-slide — this hooks XHR.prototype.send with the vData injector.
    window.eval(vmSlideSource);

    // Step 4: Fire a jQuery.ajax POST. jQuery serializes postFields via $.param(),
    // the VM hook intercepts XHR.send, computes vData, appends it to the body,
    // then calls our captured hook (step 1) which stores the final body.
    window.jQuery.ajax({
      type: 'POST',
      url: '/cap_union_new_verify',
      data: postFields,
      timeout: 15000,
    });

    if (!capturedBody) {
      throw new Error('XHR.send was never called — vm-slide may not have hooked correctly');
    }

    // Step 5: Extract vData from the captured body.
    const params = new URLSearchParams(capturedBody);
    const vData = params.get('vData');

    if (!vData) {
      throw new Error('vData not found in captured XHR body — VM hook may have failed');
    }

    // Build the serialized body WITHOUT vData (the original serialization).
    const serializedBody = window.jQuery.param(postFields);

    return { vData, serializedBody };
  } finally {
    dom.window.close();
  }
}

/**
 * Parse the vm-slide.enc.js URL from show page HTML.
 * Looks for a <script> tag with src matching vm-slide.*.enc.js or vm_slide.js.
 *
 * @param {string} html - Show page HTML
 * @returns {string|null} - Full or relative URL to vm-slide.enc.js, or null if not found
 */
function parseVmSlideUrl(html) {
  // Match src attributes containing vm-slide or vm_slide with optional hash and .enc
  const re = /src\s*=\s*["']([^"']*vm[-_]slide[^"']*\.js)["']/i;
  const match = html.match(re);
  return match ? match[1] : null;
}

module.exports = { generateVData, parseVmSlideUrl };
