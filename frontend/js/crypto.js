// Подписи и AEAD. Публичные ключи — base64 (совместимо с backend).
// Всё через @noble/curves — Ed25519, X25519 и SHA-512 встроены.

import { ed25519, x25519 } from "https://esm.sh/@noble/curves@1.6.0/ed25519";
import { xchacha20poly1305 } from "https://esm.sh/@noble/ciphers@1.0.0/chacha";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toU8(x) {
  if (x instanceof Uint8Array) return x;
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  throw new Error("cannot coerce to Uint8Array: " + Object.prototype.toString.call(x));
}

// ---------- base64 ----------

export function b64e(bytes) {
  const arr = toU8(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

export function b64d(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- canonical bytes (должно совпадать с backend/crypto.py) ----------

function u16be(n) { return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]); }
function u64be(n) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(n), false);
  return out;
}

export function canonicalMessageBytes(msgIdBytes, fromPub, toPub, ts, nonce, ct) {
  fromPub = toU8(fromPub); toPub = toU8(toPub);
  nonce = toU8(nonce); ct = toU8(ct); msgIdBytes = toU8(msgIdBytes);
  if (fromPub.length !== 32 || toPub.length !== 32) throw new Error("pubkey must be 32B");
  if (nonce.length > 255) throw new Error("nonce too long");
  const parts = [
    enc.encode("fsm-msg-v1\0"),
    u16be(msgIdBytes.length),
    msgIdBytes,
    fromPub,
    toPub,
    u64be(ts),
    new Uint8Array([nonce.length]),
    nonce,
    ct,
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ---------- Ed25519 ----------

export function ed25519GetPublicKey(seed32) {
  return ed25519.getPublicKey(toU8(seed32));
}

export function ed25519Sign(seed32, message) {
  return ed25519.sign(toU8(message), toU8(seed32));
}

export function ed25519Verify(pub32, message, sig64) {
  try {
    return ed25519.verify(toU8(sig64), toU8(message), toU8(pub32));
  } catch {
    return false;
  }
}

// ---------- X25519 + HKDF ----------

export function x25519GetPublicKey(priv32) {
  return x25519.getPublicKey(toU8(priv32));
}

async function hkdfSha256(ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", toU8(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function deriveMessageKey(xPriv32, peerXPub32) {
  const shared = x25519.getSharedSecret(toU8(xPriv32), toU8(peerXPub32));
  return await hkdfSha256(shared, "fsm/msg/x25519/v1", 32);
}

// ---------- AEAD ----------

export function encryptMessage({ key, nonce, ad, plaintext }) {
  const aead = xchacha20poly1305(toU8(key), toU8(nonce), toU8(ad));
  return { ct: aead.encrypt(enc.encode(plaintext)) };
}

export function decryptMessage({ key, nonce, ad, ct }) {
  const aead = xchacha20poly1305(toU8(key), toU8(nonce), toU8(ad));
  return dec.decode(aead.decrypt(toU8(ct)));
}

// ---------- ID ----------

export function randomId(bytes = 9) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return b64e(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}