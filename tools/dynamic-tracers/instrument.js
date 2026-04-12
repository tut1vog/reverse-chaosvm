'use strict';

/**
 * instrument.js — Browser-side instrumentation layer for TDC token capture.
 *
 * This script is injected into the page BEFORE tdc.js loads. It:
 * 1. Defines the required global Date helper hooks
 * 2. Monkey-patches window.TDC after tdc.js sets it up
 * 3. Captures the sd/cd data structures before encoding
 * 4. Captures browser environment info
 * 5. (Task 6.2) Hooks Function.prototype.call/apply ONLY when activated
 *    via window.__CD_CAPTURE_ACTIVE flag — this prevents breaking the VM
 *    interpreter during initialization
 * 6. Hooks String.prototype.substr/replace for sd extraction
 *
 * The captured data is stored on window.__TDC_CAPTURE for the harness to retrieve.
 */

(function () {
  // ── Storage for captured data ──
  window.__TDC_CAPTURE = {
    consoleLogs: [],
    consoleErrors: [],
    setDataCalls: [],
    getInfoResults: [],
    getDataResults: [],
    clearTcCalls: [],
    interceptedSD: null,
    interceptedCD: null,
    preEncodingData: null,
    networkRequests: [],
    timestamps: {},
    environment: null,
    errors: [],

    // Task 6.2: Extended capture fields
    cdCaptures: [],       // All strings containing "cd":[ seen via hooks
    cdString: null,       // The final complete cd JSON string
    sdSubstrCaptures: [], // sd JSON extraction via substr
    replaceCaptures: [],  // URL-encoding detections
    btoaCaptures: [],     // btoa() calls
    stringifyOutputs: [], // Full stringify outputs when keys include cd/sd
    challengeEncryptInputs: [], // Inputs to ChallengeEncrypt if hooked
    sanitizedValues: []   // Control-char sanitizer hits from func_276
  };

  var cap = window.__TDC_CAPTURE;

  // ── Gate flag: heavy hooks only active when this is true ──
  // Set to true from harness BEFORE calling getData()
  window.__CD_CAPTURE_ACTIVE = false;

  // ── 1. Capture console output ──
  var origLog = console.log.bind(console);
  var origError = console.error.bind(console);
  var origWarn = console.warn.bind(console);

  console.log = function () {
    var args = Array.prototype.slice.call(arguments);
    cap.consoleLogs.push({ ts: Date.now(), args: args.map(String) });
    origLog.apply(console, args);
  };
  console.error = function () {
    var args = Array.prototype.slice.call(arguments);
    cap.consoleErrors.push({ ts: Date.now(), args: args.map(String) });
    origError.apply(console, args);
  };
  console.warn = function () {
    var args = Array.prototype.slice.call(arguments);
    cap.consoleLogs.push({ ts: Date.now(), type: 'warn', args: args.map(String) });
    origWarn.apply(console, args);
  };

  // ── 2. Capture network requests (XHR + fetch) ──
  var origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    cap.networkRequests.push({ type: 'xhr', method: method, url: url, ts: Date.now() });
    return origXHROpen.apply(this, arguments);
  };

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (url, opts) {
      cap.networkRequests.push({
        type: 'fetch',
        url: typeof url === 'string' ? url : url.url || String(url),
        method: (opts && opts.method) || 'GET',
        ts: Date.now()
      });
      return origFetch.apply(this, arguments);
    };
  }

  // ── 3. Capture browser environment ──
  cap.environment = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages ? Array.from(navigator.languages) : [],
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    hardwareConcurrency: navigator.hardwareConcurrency,
    maxTouchPoints: navigator.maxTouchPoints,
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight
    },
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset()
  };

  // ── 4. Define the required global Date helper hooks ──
  window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF = function () {
    return new Date();
  };
  window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO = function (a, b) {
    return Date[a].apply(Date, b);
  };

  // ── 5. Intercept JSON.stringify to capture pre-encoding data ──
  var origStringify = JSON.stringify;
  var stringifyCallCount = 0;
  cap.allStringifyCalls = [];
  JSON.stringify = function (value) {
    stringifyCallCount++;
    if (value && typeof value === 'object' && stringifyCallCount <= 100) {
      try {
        var result = origStringify.apply(JSON, arguments);
        var keys = Array.isArray(value) ? ['[array:' + value.length + ']'] : Object.keys(value);
        cap.allStringifyCalls.push({
          callNumber: stringifyCallCount,
          ts: Date.now(),
          keys: keys,
          isArray: Array.isArray(value),
          length: Array.isArray(value) ? value.length : keys.length
        });

        // Check for cd/sd payload object
        if (!Array.isArray(value) && (keys.indexOf('cd') >= 0 || keys.indexOf('sd') >= 0)) {
          var clone = JSON.parse(result);

          // Capture the full stringify output and the raw cd value
          cap.stringifyOutputs.push({
            callNumber: stringifyCallCount,
            ts: Date.now(),
            keys: keys,
            output: result,
            rawCdType: typeof value.cd,
            rawCdValue: typeof value.cd === 'string' ? value.cd : String(value.cd),
            rawCdLength: typeof value.cd === 'string' ? value.cd.length : 0,
            hasCd: value.cd !== undefined && value.cd !== null,
            hasSd: value.sd !== undefined && value.sd !== null
          });

          cap.preEncodingData = {
            callNumber: stringifyCallCount,
            ts: Date.now(),
            data: clone
          };

          if (value.cd && typeof value.cd === 'object') {
            cap.interceptedCD = JSON.parse(origStringify.call(JSON, value.cd));
          }
          if (value.sd) {
            cap.interceptedSD = JSON.parse(origStringify.call(JSON, value.sd));
          }

          // If cd is a string (the hand-rolled JSON), capture it directly!
          if (typeof value.cd === 'string' && value.cd.length > 5) {
            cap.cdString = value.cd;
            cap.cdCaptures.push({
              source: 'stringify-cd-property',
              ts: Date.now(),
              value: value.cd,
              length: value.cd.length
            });
          }
        }

        // Capture large objects
        if (!Array.isArray(value) && keys.length >= 3) {
          cap.largeObjects = cap.largeObjects || [];
          cap.largeObjects.push({
            callNumber: stringifyCallCount,
            ts: Date.now(),
            data: JSON.parse(result)
          });
        }

        return result;
      } catch (e) {
        cap.errors.push({ stage: 'stringify-intercept', error: String(e), ts: Date.now() });
      }
    }
    return origStringify.apply(JSON, arguments);
  };

  // ── 6. Hook Function.prototype.call — GATED ──
  // Only active when window.__CD_CAPTURE_ACTIVE is true (set by harness
  // right before calling getData()). This prevents breaking the VM
  // interpreter during its initialization loop.
  //
  // NOTE: We do NOT hook Function.prototype.apply — hooking both .call
  // and .apply causes infinite recursion since each needs the other.
  // We use Reflect.apply to invoke the original safely.
  var origFnCall = Function.prototype.call;
  var fnCallGuard = false;

  Function.prototype.call = function () {
    // Use Reflect.apply to invoke the original .call() safely
    var args = [];
    for (var j = 0; j < arguments.length; j++) args[j] = arguments[j];
    var result = Reflect.apply(origFnCall, this, args);

    if (window.__CD_CAPTURE_ACTIVE && !fnCallGuard) {
      fnCallGuard = true;
      try {
        // Check ALL arguments (including thisArg at index 0) for strings
        // containing the cd payload or being suspiciously long
        cap.longStringArgs = cap.longStringArgs || [];
        for (var i = 0; i < args.length; i++) {
          var arg = args[i];
          if (typeof arg === 'string') {
            var cdIdx = arg.indexOf('"cd":[');
            if (cdIdx >= 0 && arg.length > 50) {
              cap.cdCaptures.push({
                source: 'fn-call-arg',
                ts: Date.now(),
                value: arg,
                length: arg.length,
                cdIndex: cdIdx,
                argIndex: i,
                hasSd: arg.indexOf('"sd"') >= 0,
                preview: arg.substring(0, 200)
              });
              if (!cap.cdString || arg.length > cap.cdString.length) {
                cap.cdString = arg;
              }
            }
            // Log unique long strings for analysis (deduplicated by length+prefix)
            if (arg.length > 200 && cap.longStringArgs.length < 100) {
              var fingerprint = arg.length + ':' + arg.substring(0, 50);
              if (!cap._seenFingerprints) cap._seenFingerprints = {};
              if (!cap._seenFingerprints[fingerprint]) {
                cap._seenFingerprints[fingerprint] = true;
                cap.longStringArgs.push({
                  ts: Date.now(),
                  length: arg.length,
                  argIndex: i,
                  value: arg.length < 20000 ? arg : arg.substring(0, 20000),
                  hasCd: cdIdx >= 0,
                  hasSd: arg.indexOf('"sd"') >= 0
                });
              }
            }
          }
        }

        // Check RETURN VALUE for cd property containing raw JSON.
        // func_276 returns an object; its .cd might contain the raw cd JSON string.
        // We specifically check for the "cd":[ pattern to distinguish raw JSON
        // from the encoded token which also gets stored on .cd later.
        if (result && typeof result === 'object') {
          var cdVal;
          try { cdVal = result.cd; } catch (e2) { cdVal = undefined; }
          if (typeof cdVal === 'string' && cdVal.length > 20 && cdVal.indexOf('"cd":[') >= 0) {
            cap.cdCaptures.push({
              source: 'fn-call-return-cd',
              ts: Date.now(),
              value: cdVal,
              length: cdVal.length,
              hasSd: false,
              preview: cdVal.substring(0, 200)
            });
            if (!cap.cdString || cdVal.length > cap.cdString.length) {
              cap.cdString = cdVal;
            }
          }
        }
      } catch (e) {
        // Silent — don't break VM execution
      }
      fnCallGuard = false;
    }
    return result;
  };

  // ── 7. Hook String.prototype.substr — always active (low overhead) ──
  var origSubstr = String.prototype.substr;
  String.prototype.substr = function () {
    var args = [];
    for (var k = 0; k < arguments.length; k++) args[k] = arguments[k];
    var result = Reflect.apply(origSubstr, this, args);
    if (args[0] === 1 && this.length > 30 &&
        (this.charAt(0) === '{' || this.charAt(0) === '[')) {
      var str = String(this);
      if (str.indexOf('"sd"') >= 0 || str.indexOf('"cd"') >= 0) {
        cap.sdSubstrCaptures.push({
          ts: Date.now(),
          original: str,
          originalLength: str.length,
          result: result,
          resultLength: result.length,
          args: args
        });
      }
    }
    return result;
  };

  // ── 8. Hook String.prototype.replace — always active (selective) ──
  var origReplace = String.prototype.replace;
  var sanitizerHits = 0;

  String.prototype.replace = function () {
    var pattern = arguments[0];
    var replacement = arguments[1];
    var rArgs = [];
    for (var m = 0; m < arguments.length; m++) rArgs[m] = arguments[m];
    var result = Reflect.apply(origReplace, this, rArgs);

    // Detect control-char sanitizer regex from func_276
    if (pattern instanceof RegExp) {
      var src = pattern.source || '';
      if (src.indexOf('\\u0000') >= 0 && src.indexOf('\\u001F') >= 0) {
        sanitizerHits++;
        if (sanitizerHits <= 200) {
          cap.sanitizedValues.push({
            ts: Date.now(),
            hitNumber: sanitizerHits,
            input: String(this).substring(0, 500),
            inputLength: this.length,
            result: result.substring(0, 500),
            resultLength: result.length
          });
        }
      }
    }

    // Detect URL-safe encoding (function replacer producing %2B/%2F/%3D)
    if (typeof replacement === 'function' && typeof this === 'string' && this.length > 100) {
      if (result.indexOf('%2B') >= 0 || result.indexOf('%2F') >= 0 || result.indexOf('%3D') >= 0) {
        if (cap.replaceCaptures.length < 10) {
          cap.replaceCaptures.push({
            ts: Date.now(),
            type: 'url-safe-encoding',
            inputLength: this.length,
            inputPreview: String(this).substring(0, 200),
            resultLength: result.length,
            resultPreview: result.substring(0, 200)
          });
        }
      }
    }

    return result;
  };

  // ── 9. Hook window.btoa — always active (rarely called) ──
  var origBtoa = window.btoa;
  if (origBtoa) {
    window.btoa = function (str) {
      var result = Reflect.apply(origBtoa, window, [str]);
      if (typeof str === 'string' && str.length > 50) {
        cap.btoaCaptures.push({
          ts: Date.now(),
          inputLength: str.length,
          inputPreview: str.substring(0, 200),
          outputLength: result.length,
          outputPreview: result.substring(0, 200)
        });
      }
      return result;
    };
  }

  // ── 10. Watch for ChallengeEncrypt on window ──
  var ceCheckCount = 0;
  var ceInterval = setInterval(function () {
    ceCheckCount++;
    if (ceCheckCount > 200) {
      clearInterval(ceInterval);
      return;
    }
    if (typeof window.ChallengeEncrypt === 'function') {
      clearInterval(ceInterval);
      var origCE = window.ChallengeEncrypt;
      window.ChallengeEncrypt = function () {
        var args = Array.prototype.slice.call(arguments);
        cap.challengeEncryptInputs.push({
          ts: Date.now(),
          argTypes: args.map(function (a) { return typeof a; }),
          argLengths: args.map(function (a) {
            return typeof a === 'string' ? a.length : (a && a.length) || 0;
          }),
          argPreviews: args.map(function (a) {
            if (typeof a === 'string') return a.substring(0, 500);
            if (typeof a === 'object' && a !== null) {
              try { return origStringify.call(JSON, a).substring(0, 500); } catch (e) { return '[obj]'; }
            }
            return String(a);
          })
        });
        for (var i = 0; i < args.length; i++) {
          if (typeof args[i] === 'string' && args[i].indexOf('"cd":[') >= 0) {
            if (!cap.cdString || args[i].length > cap.cdString.length) {
              cap.cdString = args[i];
            }
            cap.cdCaptures.push({
              source: 'ChallengeEncrypt',
              ts: Date.now(),
              value: args[i],
              length: args[i].length
            });
          }
        }
        return origCE.apply(this, arguments);
      };
      cap.timestamps.challengeEncryptHooked = Date.now();
    }
  }, 50);

  // ── 11. Watch for TDC to appear and monkey-patch it ──
  var patchAttempts = 0;
  var patchInterval = setInterval(function () {
    patchAttempts++;
    if (patchAttempts > 200) {
      clearInterval(patchInterval);
      cap.errors.push({ stage: 'patch', error: 'TDC never appeared after 10s', ts: Date.now() });
      return;
    }

    if (!window.TDC) return;
    clearInterval(patchInterval);

    cap.timestamps.tdcDetected = Date.now();

    var origGetInfo = window.TDC.getInfo;
    var origSetData = window.TDC.setData;
    var origGetData = window.TDC.getData;
    var origClearTc = window.TDC.clearTc;

    if (origSetData) {
      window.TDC.setData = function () {
        var args = Array.prototype.slice.call(arguments);
        var callRecord = {
          ts: Date.now(),
          args: JSON.parse(origStringify.call(JSON, args))
        };
        cap.setDataCalls.push(callRecord);
        var result = origSetData.apply(this, arguments);
        callRecord.result = result;
        return result;
      };
    }

    if (origGetInfo) {
      window.TDC.getInfo = function () {
        cap.timestamps.getInfoCalled = Date.now();
        var result = origGetInfo.apply(this, arguments);
        cap.getInfoResults.push({
          ts: Date.now(),
          result: typeof result === 'object'
            ? JSON.parse(origStringify.call(JSON, result))
            : result
        });
        return result;
      };
    }

    if (origGetData) {
      window.TDC.getData = function () {
        cap.timestamps.getDataCalled = Date.now();
        var result = origGetData.apply(this, arguments);
        cap.getDataResults.push({
          ts: Date.now(),
          result: typeof result === 'string' ? result : String(result),
          length: typeof result === 'string' ? result.length : 0
        });
        return result;
      };
    }

    if (origClearTc) {
      window.TDC.clearTc = function () {
        cap.clearTcCalls.push({ ts: Date.now() });
        return origClearTc.apply(this, arguments);
      };
    }

    cap.timestamps.patchComplete = Date.now();
    cap.tdcMethods = {
      hasGetInfo: typeof origGetInfo === 'function',
      hasSetData: typeof origSetData === 'function',
      hasGetData: typeof origGetData === 'function',
      hasClearTc: typeof origClearTc === 'function'
    };
  }, 50);

  // ── 12. Capture unhandled errors ──
  window.addEventListener('error', function (e) {
    cap.errors.push({
      stage: 'runtime',
      error: e.message,
      filename: e.filename,
      lineno: e.lineno,
      ts: Date.now()
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    cap.errors.push({
      stage: 'promise',
      error: String(e.reason),
      ts: Date.now()
    });
  });
})();
