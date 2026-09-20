var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/@noble/ciphers/_assert.js
var require_assert = __commonJS({
  "node_modules/@noble/ciphers/_assert.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isBytes = isBytes;
    exports.number = number;
    exports.bool = bool;
    exports.bytes = bytes;
    exports.hash = hash;
    exports.exists = exists;
    exports.output = output;
    function number(n) {
      if (!Number.isSafeInteger(n) || n < 0)
        throw new Error(`positive integer expected, not ${n}`);
    }
    function bool(b) {
      if (typeof b !== "boolean")
        throw new Error(`boolean expected, not ${b}`);
    }
    function isBytes(a) {
      return a instanceof Uint8Array || a != null && typeof a === "object" && a.constructor.name === "Uint8Array";
    }
    function bytes(b, ...lengths) {
      if (!isBytes(b))
        throw new Error("Uint8Array expected");
      if (lengths.length > 0 && !lengths.includes(b.length))
        throw new Error(`Uint8Array expected of length ${lengths}, not of length=${b.length}`);
    }
    function hash(hash2) {
      if (typeof hash2 !== "function" || typeof hash2.create !== "function")
        throw new Error("hash must be wrapped by utils.wrapConstructor");
      number(hash2.outputLen);
      number(hash2.blockLen);
    }
    function exists(instance, checkFinished = true) {
      if (instance.destroyed)
        throw new Error("Hash instance has been destroyed");
      if (checkFinished && instance.finished)
        throw new Error("Hash#digest() has already been called");
    }
    function output(out, instance) {
      bytes(out);
      const min = instance.outputLen;
      if (out.length < min) {
        throw new Error(`digestInto() expects output buffer of length at least ${min}`);
      }
    }
    var assert = { number, bool, bytes, hash, exists, output };
    exports.default = assert;
  }
});

// node_modules/@noble/ciphers/utils.js
var require_utils = __commonJS({
  "node_modules/@noble/ciphers/utils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.wrapCipher = exports.Hash = exports.nextTick = exports.isLE = exports.createView = exports.u32 = exports.u16 = exports.u8 = void 0;
    exports.bytesToHex = bytesToHex;
    exports.hexToBytes = hexToBytes;
    exports.hexToNumber = hexToNumber;
    exports.bytesToNumberBE = bytesToNumberBE;
    exports.numberToBytesBE = numberToBytesBE;
    exports.asyncLoop = asyncLoop;
    exports.utf8ToBytes = utf8ToBytes;
    exports.bytesToUtf8 = bytesToUtf8;
    exports.toBytes = toBytes;
    exports.concatBytes = concatBytes;
    exports.checkOpts = checkOpts;
    exports.equalBytes = equalBytes;
    exports.setBigUint64 = setBigUint64;
    exports.u64Lengths = u64Lengths;
    exports.isAligned32 = isAligned32;
    exports.copyBytes = copyBytes;
    exports.clean = clean;
    var _assert_js_1 = require_assert();
    var u8 = (arr) => new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    exports.u8 = u8;
    var u16 = (arr) => new Uint16Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 2));
    exports.u16 = u16;
    var u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
    exports.u32 = u32;
    var createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    exports.createView = createView;
    exports.isLE = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
    if (!exports.isLE)
      throw new Error("Non little-endian hardware is not supported");
    var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    function bytesToHex(bytes) {
      (0, _assert_js_1.bytes)(bytes);
      let hex = "";
      for (let i = 0; i < bytes.length; i++) {
        hex += hexes[bytes[i]];
      }
      return hex;
    }
    var asciis = { _0: 48, _9: 57, _A: 65, _F: 70, _a: 97, _f: 102 };
    function asciiToBase16(char) {
      if (char >= asciis._0 && char <= asciis._9)
        return char - asciis._0;
      if (char >= asciis._A && char <= asciis._F)
        return char - (asciis._A - 10);
      if (char >= asciis._a && char <= asciis._f)
        return char - (asciis._a - 10);
      return;
    }
    function hexToBytes(hex) {
      if (typeof hex !== "string")
        throw new Error("hex string expected, got " + typeof hex);
      const hl = hex.length;
      const al = hl / 2;
      if (hl % 2)
        throw new Error("padded hex string expected, got unpadded hex of length " + hl);
      const array = new Uint8Array(al);
      for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
        const n1 = asciiToBase16(hex.charCodeAt(hi));
        const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
        if (n1 === void 0 || n2 === void 0) {
          const char = hex[hi] + hex[hi + 1];
          throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
        }
        array[ai] = n1 * 16 + n2;
      }
      return array;
    }
    function hexToNumber(hex) {
      if (typeof hex !== "string")
        throw new Error("hex string expected, got " + typeof hex);
      return BigInt(hex === "" ? "0" : `0x${hex}`);
    }
    function bytesToNumberBE(bytes) {
      return hexToNumber(bytesToHex(bytes));
    }
    function numberToBytesBE(n, len) {
      return hexToBytes(n.toString(16).padStart(len * 2, "0"));
    }
    var nextTick = async () => {
    };
    exports.nextTick = nextTick;
    async function asyncLoop(iters, tick, cb) {
      let ts = Date.now();
      for (let i = 0; i < iters; i++) {
        cb(i);
        const diff = Date.now() - ts;
        if (diff >= 0 && diff < tick)
          continue;
        await (0, exports.nextTick)();
        ts += diff;
      }
    }
    function utf8ToBytes(str) {
      if (typeof str !== "string")
        throw new Error(`string expected, got ${typeof str}`);
      return new Uint8Array(new TextEncoder().encode(str));
    }
    function bytesToUtf8(bytes) {
      return new TextDecoder().decode(bytes);
    }
    function toBytes(data) {
      if (typeof data === "string")
        data = utf8ToBytes(data);
      else if ((0, _assert_js_1.isBytes)(data))
        data = copyBytes(data);
      else
        throw new Error(`Uint8Array expected, got ${typeof data}`);
      return data;
    }
    function concatBytes(...arrays) {
      let sum = 0;
      for (let i = 0; i < arrays.length; i++) {
        const a = arrays[i];
        (0, _assert_js_1.bytes)(a);
        sum += a.length;
      }
      const res = new Uint8Array(sum);
      for (let i = 0, pad = 0; i < arrays.length; i++) {
        const a = arrays[i];
        res.set(a, pad);
        pad += a.length;
      }
      return res;
    }
    function checkOpts(defaults, opts) {
      if (opts == null || typeof opts !== "object")
        throw new Error("options must be defined");
      const merged = Object.assign(defaults, opts);
      return merged;
    }
    function equalBytes(a, b) {
      if (a.length !== b.length)
        return false;
      let diff = 0;
      for (let i = 0; i < a.length; i++)
        diff |= a[i] ^ b[i];
      return diff === 0;
    }
    var Hash = class {
    };
    exports.Hash = Hash;
    var wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, c) => {
      Object.assign(c, params);
      return c;
    };
    exports.wrapCipher = wrapCipher;
    function setBigUint64(view, byteOffset, value, isLE) {
      if (typeof view.setBigUint64 === "function")
        return view.setBigUint64(byteOffset, value, isLE);
      const _32n = BigInt(32);
      const _u32_max = BigInt(4294967295);
      const wh = Number(value >> _32n & _u32_max);
      const wl = Number(value & _u32_max);
      const h = isLE ? 4 : 0;
      const l = isLE ? 0 : 4;
      view.setUint32(byteOffset + h, wh, isLE);
      view.setUint32(byteOffset + l, wl, isLE);
    }
    function u64Lengths(ciphertext, AAD) {
      const num = new Uint8Array(16);
      const view = (0, exports.createView)(num);
      setBigUint64(view, 0, BigInt(AAD ? AAD.length : 0), true);
      setBigUint64(view, 8, BigInt(ciphertext.length), true);
      return num;
    }
    function isAligned32(bytes) {
      return bytes.byteOffset % 4 === 0;
    }
    function copyBytes(bytes) {
      return Uint8Array.from(bytes);
    }
    function clean(...arrays) {
      for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
      }
    }
  }
});

// node_modules/@noble/ciphers/_arx.js
var require_arx = __commonJS({
  "node_modules/@noble/ciphers/_arx.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sigma = void 0;
    exports.rotl = rotl;
    exports.createCipher = createCipher;
    var _assert_js_1 = require_assert();
    var utils_js_1 = require_utils();
    var _utf8ToBytes = (str) => Uint8Array.from(str.split("").map((c) => c.charCodeAt(0)));
    var sigma16 = _utf8ToBytes("expand 16-byte k");
    var sigma32 = _utf8ToBytes("expand 32-byte k");
    var sigma16_32 = (0, utils_js_1.u32)(sigma16);
    var sigma32_32 = (0, utils_js_1.u32)(sigma32);
    exports.sigma = sigma32_32.slice();
    function rotl(a, b) {
      return a << b | a >>> 32 - b;
    }
    function isAligned32(b) {
      return b.byteOffset % 4 === 0;
    }
    var BLOCK_LEN = 64;
    var BLOCK_LEN32 = 16;
    var MAX_COUNTER = 2 ** 32 - 1;
    var U32_EMPTY = new Uint32Array();
    function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
      const len = data.length;
      const block = new Uint8Array(BLOCK_LEN);
      const b32 = (0, utils_js_1.u32)(block);
      const isAligned = isAligned32(data) && isAligned32(output);
      const d32 = isAligned ? (0, utils_js_1.u32)(data) : U32_EMPTY;
      const o32 = isAligned ? (0, utils_js_1.u32)(output) : U32_EMPTY;
      for (let pos = 0; pos < len; counter++) {
        core(sigma, key, nonce, b32, counter, rounds);
        if (counter >= MAX_COUNTER)
          throw new Error("arx: counter overflow");
        const take = Math.min(BLOCK_LEN, len - pos);
        if (isAligned && take === BLOCK_LEN) {
          const pos32 = pos / 4;
          if (pos % 4 !== 0)
            throw new Error("arx: invalid block position");
          for (let j = 0, posj; j < BLOCK_LEN32; j++) {
            posj = pos32 + j;
            o32[posj] = d32[posj] ^ b32[j];
          }
          pos += BLOCK_LEN;
          continue;
        }
        for (let j = 0, posj; j < take; j++) {
          posj = pos + j;
          output[posj] = data[posj] ^ block[j];
        }
        pos += take;
      }
    }
    function createCipher(core, opts) {
      const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = (0, utils_js_1.checkOpts)({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
      if (typeof core !== "function")
        throw new Error("core must be a function");
      (0, _assert_js_1.number)(counterLength);
      (0, _assert_js_1.number)(rounds);
      (0, _assert_js_1.bool)(counterRight);
      (0, _assert_js_1.bool)(allowShortKeys);
      return (key, nonce, data, output, counter = 0) => {
        (0, _assert_js_1.bytes)(key);
        (0, _assert_js_1.bytes)(nonce);
        (0, _assert_js_1.bytes)(data);
        const len = data.length;
        if (output === void 0)
          output = new Uint8Array(len);
        (0, _assert_js_1.bytes)(output);
        (0, _assert_js_1.number)(counter);
        if (counter < 0 || counter >= MAX_COUNTER)
          throw new Error("arx: counter overflow");
        if (output.length < len)
          throw new Error(`arx: output (${output.length}) is shorter than data (${len})`);
        const toClean = [];
        let l = key.length, k, sigma;
        if (l === 32) {
          toClean.push(k = (0, utils_js_1.copyBytes)(key));
          sigma = sigma32_32;
        } else if (l === 16 && allowShortKeys) {
          k = new Uint8Array(32);
          k.set(key);
          k.set(key, 16);
          sigma = sigma16_32;
          toClean.push(k);
        } else {
          throw new Error(`arx: invalid 32-byte key, got length=${l}`);
        }
        if (!isAligned32(nonce))
          toClean.push(nonce = (0, utils_js_1.copyBytes)(nonce));
        const k32 = (0, utils_js_1.u32)(k);
        if (extendNonceFn) {
          if (nonce.length !== 24)
            throw new Error(`arx: extended nonce must be 24 bytes`);
          extendNonceFn(sigma, k32, (0, utils_js_1.u32)(nonce.subarray(0, 16)), k32);
          nonce = nonce.subarray(16);
        }
        const nonceNcLen = 16 - counterLength;
        if (nonceNcLen !== nonce.length)
          throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
        if (nonceNcLen !== 12) {
          const nc = new Uint8Array(12);
          nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
          nonce = nc;
          toClean.push(nonce);
        }
        const n32 = (0, utils_js_1.u32)(nonce);
        runCipher(core, sigma, k32, n32, data, output, counter, rounds);
        (0, utils_js_1.clean)(...toClean);
        return output;
      };
    }
  }
});

// node_modules/@noble/ciphers/_poly1305.js
var require_poly1305 = __commonJS({
  "node_modules/@noble/ciphers/_poly1305.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.poly1305 = void 0;
    exports.wrapConstructorWithKey = wrapConstructorWithKey;
    var _assert_js_1 = require_assert();
    var utils_js_1 = require_utils();
    var u8to16 = (a, i) => a[i++] & 255 | (a[i++] & 255) << 8;
    var Poly1305 = class {
      constructor(key) {
        this.blockLen = 16;
        this.outputLen = 16;
        this.buffer = new Uint8Array(16);
        this.r = new Uint16Array(10);
        this.h = new Uint16Array(10);
        this.pad = new Uint16Array(8);
        this.pos = 0;
        this.finished = false;
        key = (0, utils_js_1.toBytes)(key);
        (0, _assert_js_1.bytes)(key, 32);
        const t0 = u8to16(key, 0);
        const t1 = u8to16(key, 2);
        const t2 = u8to16(key, 4);
        const t3 = u8to16(key, 6);
        const t4 = u8to16(key, 8);
        const t5 = u8to16(key, 10);
        const t6 = u8to16(key, 12);
        const t7 = u8to16(key, 14);
        this.r[0] = t0 & 8191;
        this.r[1] = (t0 >>> 13 | t1 << 3) & 8191;
        this.r[2] = (t1 >>> 10 | t2 << 6) & 7939;
        this.r[3] = (t2 >>> 7 | t3 << 9) & 8191;
        this.r[4] = (t3 >>> 4 | t4 << 12) & 255;
        this.r[5] = t4 >>> 1 & 8190;
        this.r[6] = (t4 >>> 14 | t5 << 2) & 8191;
        this.r[7] = (t5 >>> 11 | t6 << 5) & 8065;
        this.r[8] = (t6 >>> 8 | t7 << 8) & 8191;
        this.r[9] = t7 >>> 5 & 127;
        for (let i = 0; i < 8; i++)
          this.pad[i] = u8to16(key, 16 + 2 * i);
      }
      process(data, offset, isLast = false) {
        const hibit = isLast ? 0 : 1 << 11;
        const { h, r } = this;
        const r0 = r[0];
        const r1 = r[1];
        const r2 = r[2];
        const r3 = r[3];
        const r4 = r[4];
        const r5 = r[5];
        const r6 = r[6];
        const r7 = r[7];
        const r8 = r[8];
        const r9 = r[9];
        const t0 = u8to16(data, offset + 0);
        const t1 = u8to16(data, offset + 2);
        const t2 = u8to16(data, offset + 4);
        const t3 = u8to16(data, offset + 6);
        const t4 = u8to16(data, offset + 8);
        const t5 = u8to16(data, offset + 10);
        const t6 = u8to16(data, offset + 12);
        const t7 = u8to16(data, offset + 14);
        let h0 = h[0] + (t0 & 8191);
        let h1 = h[1] + ((t0 >>> 13 | t1 << 3) & 8191);
        let h2 = h[2] + ((t1 >>> 10 | t2 << 6) & 8191);
        let h3 = h[3] + ((t2 >>> 7 | t3 << 9) & 8191);
        let h4 = h[4] + ((t3 >>> 4 | t4 << 12) & 8191);
        let h5 = h[5] + (t4 >>> 1 & 8191);
        let h6 = h[6] + ((t4 >>> 14 | t5 << 2) & 8191);
        let h7 = h[7] + ((t5 >>> 11 | t6 << 5) & 8191);
        let h8 = h[8] + ((t6 >>> 8 | t7 << 8) & 8191);
        let h9 = h[9] + (t7 >>> 5 | hibit);
        let c = 0;
        let d0 = c + h0 * r0 + h1 * (5 * r9) + h2 * (5 * r8) + h3 * (5 * r7) + h4 * (5 * r6);
        c = d0 >>> 13;
        d0 &= 8191;
        d0 += h5 * (5 * r5) + h6 * (5 * r4) + h7 * (5 * r3) + h8 * (5 * r2) + h9 * (5 * r1);
        c += d0 >>> 13;
        d0 &= 8191;
        let d1 = c + h0 * r1 + h1 * r0 + h2 * (5 * r9) + h3 * (5 * r8) + h4 * (5 * r7);
        c = d1 >>> 13;
        d1 &= 8191;
        d1 += h5 * (5 * r6) + h6 * (5 * r5) + h7 * (5 * r4) + h8 * (5 * r3) + h9 * (5 * r2);
        c += d1 >>> 13;
        d1 &= 8191;
        let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * (5 * r9) + h4 * (5 * r8);
        c = d2 >>> 13;
        d2 &= 8191;
        d2 += h5 * (5 * r7) + h6 * (5 * r6) + h7 * (5 * r5) + h8 * (5 * r4) + h9 * (5 * r3);
        c += d2 >>> 13;
        d2 &= 8191;
        let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * (5 * r9);
        c = d3 >>> 13;
        d3 &= 8191;
        d3 += h5 * (5 * r8) + h6 * (5 * r7) + h7 * (5 * r6) + h8 * (5 * r5) + h9 * (5 * r4);
        c += d3 >>> 13;
        d3 &= 8191;
        let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0;
        c = d4 >>> 13;
        d4 &= 8191;
        d4 += h5 * (5 * r9) + h6 * (5 * r8) + h7 * (5 * r7) + h8 * (5 * r6) + h9 * (5 * r5);
        c += d4 >>> 13;
        d4 &= 8191;
        let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1;
        c = d5 >>> 13;
        d5 &= 8191;
        d5 += h5 * r0 + h6 * (5 * r9) + h7 * (5 * r8) + h8 * (5 * r7) + h9 * (5 * r6);
        c += d5 >>> 13;
        d5 &= 8191;
        let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2;
        c = d6 >>> 13;
        d6 &= 8191;
        d6 += h5 * r1 + h6 * r0 + h7 * (5 * r9) + h8 * (5 * r8) + h9 * (5 * r7);
        c += d6 >>> 13;
        d6 &= 8191;
        let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3;
        c = d7 >>> 13;
        d7 &= 8191;
        d7 += h5 * r2 + h6 * r1 + h7 * r0 + h8 * (5 * r9) + h9 * (5 * r8);
        c += d7 >>> 13;
        d7 &= 8191;
        let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4;
        c = d8 >>> 13;
        d8 &= 8191;
        d8 += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * (5 * r9);
        c += d8 >>> 13;
        d8 &= 8191;
        let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5;
        c = d9 >>> 13;
        d9 &= 8191;
        d9 += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
        c += d9 >>> 13;
        d9 &= 8191;
        c = (c << 2) + c | 0;
        c = c + d0 | 0;
        d0 = c & 8191;
        c = c >>> 13;
        d1 += c;
        h[0] = d0;
        h[1] = d1;
        h[2] = d2;
        h[3] = d3;
        h[4] = d4;
        h[5] = d5;
        h[6] = d6;
        h[7] = d7;
        h[8] = d8;
        h[9] = d9;
      }
      finalize() {
        const { h, pad } = this;
        const g = new Uint16Array(10);
        let c = h[1] >>> 13;
        h[1] &= 8191;
        for (let i = 2; i < 10; i++) {
          h[i] += c;
          c = h[i] >>> 13;
          h[i] &= 8191;
        }
        h[0] += c * 5;
        c = h[0] >>> 13;
        h[0] &= 8191;
        h[1] += c;
        c = h[1] >>> 13;
        h[1] &= 8191;
        h[2] += c;
        g[0] = h[0] + 5;
        c = g[0] >>> 13;
        g[0] &= 8191;
        for (let i = 1; i < 10; i++) {
          g[i] = h[i] + c;
          c = g[i] >>> 13;
          g[i] &= 8191;
        }
        g[9] -= 1 << 13;
        let mask = (c ^ 1) - 1;
        for (let i = 0; i < 10; i++)
          g[i] &= mask;
        mask = ~mask;
        for (let i = 0; i < 10; i++)
          h[i] = h[i] & mask | g[i];
        h[0] = (h[0] | h[1] << 13) & 65535;
        h[1] = (h[1] >>> 3 | h[2] << 10) & 65535;
        h[2] = (h[2] >>> 6 | h[3] << 7) & 65535;
        h[3] = (h[3] >>> 9 | h[4] << 4) & 65535;
        h[4] = (h[4] >>> 12 | h[5] << 1 | h[6] << 14) & 65535;
        h[5] = (h[6] >>> 2 | h[7] << 11) & 65535;
        h[6] = (h[7] >>> 5 | h[8] << 8) & 65535;
        h[7] = (h[8] >>> 8 | h[9] << 5) & 65535;
        let f = h[0] + pad[0];
        h[0] = f & 65535;
        for (let i = 1; i < 8; i++) {
          f = (h[i] + pad[i] | 0) + (f >>> 16) | 0;
          h[i] = f & 65535;
        }
        (0, utils_js_1.clean)(g);
      }
      update(data) {
        (0, _assert_js_1.exists)(this);
        const { buffer, blockLen } = this;
        data = (0, utils_js_1.toBytes)(data);
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(data, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(buffer, 0, false);
            this.pos = 0;
          }
        }
        return this;
      }
      destroy() {
        (0, utils_js_1.clean)(this.h, this.r, this.buffer, this.pad);
      }
      digestInto(out) {
        (0, _assert_js_1.exists)(this);
        (0, _assert_js_1.output)(out, this);
        this.finished = true;
        const { buffer, h } = this;
        let { pos } = this;
        if (pos) {
          buffer[pos++] = 1;
          for (; pos < 16; pos++)
            buffer[pos] = 0;
          this.process(buffer, 0, true);
        }
        this.finalize();
        let opos = 0;
        for (let i = 0; i < 8; i++) {
          out[opos++] = h[i] >>> 0;
          out[opos++] = h[i] >>> 8;
        }
        return out;
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
    };
    function wrapConstructorWithKey(hashCons) {
      const hashC = (msg, key) => hashCons(key).update((0, utils_js_1.toBytes)(msg)).digest();
      const tmp = hashCons(new Uint8Array(32));
      hashC.outputLen = tmp.outputLen;
      hashC.blockLen = tmp.blockLen;
      hashC.create = (key) => hashCons(key);
      return hashC;
    }
    exports.poly1305 = wrapConstructorWithKey((key) => new Poly1305(key));
  }
});

// node_modules/@noble/ciphers/chacha.js
var require_chacha = __commonJS({
  "node_modules/@noble/ciphers/chacha.js"(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.xchacha20poly1305 = exports.chacha20poly1305 = exports._poly1305_aead = exports.chacha12 = exports.chacha8 = exports.xchacha20 = exports.chacha20 = exports.chacha20orig = void 0;
    exports.hchacha = hchacha;
    var _arx_js_1 = require_arx();
    var _assert_js_1 = require_assert();
    var _poly1305_js_1 = require_poly1305();
    var utils_js_1 = require_utils();
    function chachaCore(s, k, n, out, cnt, rounds = 20) {
      let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2];
      let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
      for (let r = 0; r < rounds; r += 2) {
        x00 = x00 + x04 | 0;
        x12 = (0, _arx_js_1.rotl)(x12 ^ x00, 16);
        x08 = x08 + x12 | 0;
        x04 = (0, _arx_js_1.rotl)(x04 ^ x08, 12);
        x00 = x00 + x04 | 0;
        x12 = (0, _arx_js_1.rotl)(x12 ^ x00, 8);
        x08 = x08 + x12 | 0;
        x04 = (0, _arx_js_1.rotl)(x04 ^ x08, 7);
        x01 = x01 + x05 | 0;
        x13 = (0, _arx_js_1.rotl)(x13 ^ x01, 16);
        x09 = x09 + x13 | 0;
        x05 = (0, _arx_js_1.rotl)(x05 ^ x09, 12);
        x01 = x01 + x05 | 0;
        x13 = (0, _arx_js_1.rotl)(x13 ^ x01, 8);
        x09 = x09 + x13 | 0;
        x05 = (0, _arx_js_1.rotl)(x05 ^ x09, 7);
        x02 = x02 + x06 | 0;
        x14 = (0, _arx_js_1.rotl)(x14 ^ x02, 16);
        x10 = x10 + x14 | 0;
        x06 = (0, _arx_js_1.rotl)(x06 ^ x10, 12);
        x02 = x02 + x06 | 0;
        x14 = (0, _arx_js_1.rotl)(x14 ^ x02, 8);
        x10 = x10 + x14 | 0;
        x06 = (0, _arx_js_1.rotl)(x06 ^ x10, 7);
        x03 = x03 + x07 | 0;
        x15 = (0, _arx_js_1.rotl)(x15 ^ x03, 16);
        x11 = x11 + x15 | 0;
        x07 = (0, _arx_js_1.rotl)(x07 ^ x11, 12);
        x03 = x03 + x07 | 0;
        x15 = (0, _arx_js_1.rotl)(x15 ^ x03, 8);
        x11 = x11 + x15 | 0;
        x07 = (0, _arx_js_1.rotl)(x07 ^ x11, 7);
        x00 = x00 + x05 | 0;
        x15 = (0, _arx_js_1.rotl)(x15 ^ x00, 16);
        x10 = x10 + x15 | 0;
        x05 = (0, _arx_js_1.rotl)(x05 ^ x10, 12);
        x00 = x00 + x05 | 0;
        x15 = (0, _arx_js_1.rotl)(x15 ^ x00, 8);
        x10 = x10 + x15 | 0;
        x05 = (0, _arx_js_1.rotl)(x05 ^ x10, 7);
        x01 = x01 + x06 | 0;
        x12 = (0, _arx_js_1.rotl)(x12 ^ x01, 16);
        x11 = x11 + x12 | 0;
        x06 = (0, _arx_js_1.rotl)(x06 ^ x11, 12);
        x01 = x01 + x06 | 0;
        x12 = (0, _arx_js_1.rotl)(x12 ^ x01, 8);
        x11 = x11 + x12 | 0;
        x06 = (0, _arx_js_1.rotl)(x06 ^ x11, 7);
        x02 = x02 + x07 | 0;
        x13 = (0, _arx_js_1.rotl)(x13 ^ x02, 16);
        x08 = x08 + x13 | 0;
        x07 = (0, _arx_js_1.rotl)(x07 ^ x08, 12);
        x02 = x02 + x07 | 0;
        x13 = (0, _arx_js_1.rotl)(x13 ^ x02, 8);
        x08 = x08 + x13 | 0;
        x07 = (0, _arx_js_1.rotl)(x07 ^ x08, 7);
        x03 = x03 + x04 | 0;
        x14 = (0, _arx_js_1.rotl)(x14 ^ x03, 16);
        x09 = x09 + x14 | 0;
        x04 = (0, _arx_js_1.rotl)(x04 ^ x09, 12);
        x03 = x03 + x04 | 0;
        x14 = (0, _arx_js_1.rotl)(x14 ^ x03, 8);
        x09 = x09 + x14 | 0;
        x04 = (0, _arx_js_1.rotl)(x04 ^ x09, 7);
      }
      let oi = 0;
      out[oi++] = y00 + x00 | 0;
      out[oi++] = y01 + x01 | 0;
      out[oi++] = y02 + x02 | 0;
      out[oi++] = y03 + x03 | 0;
      out[oi++] = y04 + x04 | 0;
      out[oi++] = y05 + x05 | 0;
      out[oi++] = y06 + x06 | 0;
      out[oi++] = y07 + x07 | 0;
      out[oi++] = y08 + x08 | 0;
      out[oi++] = y09 + x09 | 0;
      out[oi++] = y10 + x10 | 0;
      out[oi++] = y11 + x11 | 0;
      out[oi++] = y12 + x12 | 0;
      out[oi++] = y13 + x13 | 0;
      out[oi++] = y14 + x14 | 0;
      out[oi++] = y15 + x15 | 0;
    }
    function hchacha(s, k, i, o32) {
      let x00 = s[0], x01 = s[1], x02 = s[2], x03 = s[3], x04 = k[0], x05 = k[1], x06 = k[2], x07 = k[3], x08 = k[4], x09 = k[5], x10 = k[6], x11 = k[7], x12 = i[0], x13 = i[1], x14 = i[2], x15 = i[3];
      for (let r = 0; r < 20; r += 2) {
        x00 = x00 + x04 | 0;
        x12 = (0, _arx_js_1.rotl)(x12 ^ x00, 16);
        x08 = x08 + x12 | 0;
        x04 = (0, _arx_js_1.rotl)(x04 ^ x08, 12);
        x00 = x00 + x04 | 0;
        x12 = (0, _arx_js_1.rotl)(x12 ^ x00, 8);
        x08 = x08 + x12 | 0;
        x04 = (0, _arx_js_1.rotl)(x04 ^ x08, 7);
        x01 = x01 + x05 | 0;
        x13 = (0, _arx_js_1.rotl)(x13 ^ x01, 16);
        x09 = x09 + x13 | 0;
        x05 = (0, _arx_js_1.rotl)(x05 ^ x09, 12);
        x01 = x01 + x05 | 0;
        x13 = (0, _arx_js_1.rotl)(x13 ^ x01, 8);
        x09 = x09 + x13 | 0;
        x05 = (0, _arx_js_1.rotl)(x05 ^ x09, 7);
        x02 = x02 + x06 | 0;
        x14 = (0, _arx_js_1.rotl)(x14 ^ x02, 16);
        x10 = x10 + x14 | 0;
        x06 = (0, _arx_js_1.rotl)(x06 ^ x10, 12);
        x02 = x02 + x06 | 0;
        x14 = (0, _arx_js_1.rotl)(x14 ^ x02, 8);
        x10 = x10 + x14 | 0;
        x06 = (0, _arx_js_1.rotl)(x06 ^ x10, 7);
        x03 = x03 + x07 | 0;
        x15 = (0, _arx_js_1.rotl)(x15 ^ x03, 16);
        x11 = x11 + x15 | 0;
        x07 = (0, _arx_js_1.rotl)(x07 ^ x11, 12);
        x03 = x03 + x07 | 0;
        x15 = (0, _arx_js_1.rotl)(x15 ^ x03, 8);
        x11 = x11 + x15 | 0;
        x07 = (0, _arx_js_1.rotl)(x07 ^ x11, 7);
        x00 = x00 + x05 | 0;
        x15 = (0, _arx_js_1.rotl)(x15 ^ x00, 16);
        x10 = x10 + x15 | 0;
        x05 = (0, _arx_js_1.rotl)(x05 ^ x10, 12);
        x00 = x00 + x05 | 0;
        x15 = (0, _arx_js_1.rotl)(x15 ^ x00, 8);
        x10 = x10 + x15 | 0;
        x05 = (0, _arx_js_1.rotl)(x05 ^ x10, 7);
        x01 = x01 + x06 | 0;
        x12 = (0, _arx_js_1.rotl)(x12 ^ x01, 16);
        x11 = x11 + x12 | 0;
        x06 = (0, _arx_js_1.rotl)(x06 ^ x11, 12);
        x01 = x01 + x06 | 0;
        x12 = (0, _arx_js_1.rotl)(x12 ^ x01, 8);
        x11 = x11 + x12 | 0;
        x06 = (0, _arx_js_1.rotl)(x06 ^ x11, 7);
        x02 = x02 + x07 | 0;
        x13 = (0, _arx_js_1.rotl)(x13 ^ x02, 16);
        x08 = x08 + x13 | 0;
        x07 = (0, _arx_js_1.rotl)(x07 ^ x08, 12);
        x02 = x02 + x07 | 0;
        x13 = (0, _arx_js_1.rotl)(x13 ^ x02, 8);
        x08 = x08 + x13 | 0;
        x07 = (0, _arx_js_1.rotl)(x07 ^ x08, 7);
        x03 = x03 + x04 | 0;
        x14 = (0, _arx_js_1.rotl)(x14 ^ x03, 16);
        x09 = x09 + x14 | 0;
        x04 = (0, _arx_js_1.rotl)(x04 ^ x09, 12);
        x03 = x03 + x04 | 0;
        x14 = (0, _arx_js_1.rotl)(x14 ^ x03, 8);
        x09 = x09 + x14 | 0;
        x04 = (0, _arx_js_1.rotl)(x04 ^ x09, 7);
      }
      let oi = 0;
      o32[oi++] = x00;
      o32[oi++] = x01;
      o32[oi++] = x02;
      o32[oi++] = x03;
      o32[oi++] = x12;
      o32[oi++] = x13;
      o32[oi++] = x14;
      o32[oi++] = x15;
    }
    exports.chacha20orig = (0, _arx_js_1.createCipher)(chachaCore, {
      counterRight: false,
      counterLength: 8,
      allowShortKeys: true
    });
    exports.chacha20 = (0, _arx_js_1.createCipher)(chachaCore, {
      counterRight: false,
      counterLength: 4,
      allowShortKeys: false
    });
    exports.xchacha20 = (0, _arx_js_1.createCipher)(chachaCore, {
      counterRight: false,
      counterLength: 8,
      extendNonceFn: hchacha,
      allowShortKeys: false
    });
    exports.chacha8 = (0, _arx_js_1.createCipher)(chachaCore, {
      counterRight: false,
      counterLength: 4,
      rounds: 8
    });
    exports.chacha12 = (0, _arx_js_1.createCipher)(chachaCore, {
      counterRight: false,
      counterLength: 4,
      rounds: 12
    });
    var ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
    var updatePadded = (h, msg) => {
      h.update(msg);
      const left = msg.length % 16;
      if (left)
        h.update(ZEROS16.subarray(left));
    };
    var ZEROS32 = /* @__PURE__ */ new Uint8Array(32);
    function computeTag(fn, key, nonce, data, AAD) {
      const authKey = fn(key, nonce, ZEROS32);
      const h = _poly1305_js_1.poly1305.create(authKey);
      if (AAD)
        updatePadded(h, AAD);
      updatePadded(h, data);
      const num = new Uint8Array(16);
      const view = (0, utils_js_1.createView)(num);
      (0, utils_js_1.setBigUint64)(view, 0, BigInt(AAD ? AAD.length : 0), true);
      (0, utils_js_1.setBigUint64)(view, 8, BigInt(data.length), true);
      h.update(num);
      const res = h.digest();
      (0, utils_js_1.clean)(authKey, num);
      return res;
    }
    var _poly1305_aead = (xorStream) => (key, nonce, AAD) => {
      const tagLength = 16;
      (0, _assert_js_1.bytes)(key, 32);
      (0, _assert_js_1.bytes)(nonce);
      return {
        encrypt(plaintext, output) {
          const plength = plaintext.length;
          const clength = plength + tagLength;
          if (output) {
            (0, _assert_js_1.bytes)(output, clength);
          } else {
            output = new Uint8Array(clength);
          }
          xorStream(key, nonce, plaintext, output, 1);
          const tag = computeTag(xorStream, key, nonce, output.subarray(0, -tagLength), AAD);
          output.set(tag, plength);
          (0, utils_js_1.clean)(tag);
          return output;
        },
        decrypt(ciphertext, output) {
          const clength = ciphertext.length;
          const plength = clength - tagLength;
          if (clength < tagLength)
            throw new Error(`encrypted data must be at least ${tagLength} bytes`);
          if (output) {
            (0, _assert_js_1.bytes)(output, plength);
          } else {
            output = new Uint8Array(plength);
          }
          const data = ciphertext.subarray(0, -tagLength);
          const passedTag = ciphertext.subarray(-tagLength);
          const tag = computeTag(xorStream, key, nonce, data, AAD);
          if (!(0, utils_js_1.equalBytes)(passedTag, tag))
            throw new Error("invalid tag");
          xorStream(key, nonce, data, output, 1);
          (0, utils_js_1.clean)(tag);
          return output;
        }
      };
    };
    exports._poly1305_aead = _poly1305_aead;
    exports.chacha20poly1305 = (0, utils_js_1.wrapCipher)({ blockSize: 64, nonceLength: 12, tagLength: 16 }, (0, exports._poly1305_aead)(exports.chacha20));
    exports.xchacha20poly1305 = (0, utils_js_1.wrapCipher)({ blockSize: 64, nonceLength: 24, tagLength: 16 }, (0, exports._poly1305_aead)(exports.xchacha20));
  }
});
export default require_chacha();
/*! Bundled license information:

@noble/ciphers/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)
*/
