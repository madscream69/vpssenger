// BIP39 + деривация Ed25519/X25519 из сид-фразы.
// Все ключи выводятся детерминированно; ничего не сохраняется.

import bip39 from "../vendor/bip39.bundle.mjs";
import wordlistMod from "../vendor/bip39-wordlist-english.bundle.mjs";

// esbuild упаковал всё в default. Достаём нужное оттуда.
const wordlist = wordlistMod.wordlist || wordlistMod.default || wordlistMod;

if (!Array.isArray(wordlist) || wordlist.length < 100) {
  throw new Error(
    "wordlist не загрузился: type=" + typeof wordlist +
    " keys=" + Object.keys(wordlistMod).join(",")
  );
}

if (typeof bip39.generateMnemonic !== "function") {
  throw new Error(
    "bip39 не загрузился: keys=" + Object.keys(bip39).join(",")
  );
}

const enc = new TextEncoder();

async function hkdf(ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export function generateMnemonic() {
  // 128 бит энтропии = 12 слов.
  return bip39.generateMnemonic(wordlist, 128);
}

export function validateMnemonic(mnemonic) {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

export async function deriveKeys(mnemonic) {
  const clean = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
  if (!bip39.validateMnemonic(clean, wordlist)) {
    throw new Error("invalid mnemonic");
  }
  // Стандартный BIP39 seed: PBKDF2-HMAC-SHA512, 2048 итераций, salt="mnemonic"+passphrase.
  const seed = await bip39.mnemonicToSeed(clean); // 64 байта

  const edSeed = await hkdf(seed, "fsm/identity/ed25519/v1", 32);
  const xSeed  = await hkdf(seed, "fsm/encryption/x25519/v1", 32);

  return { seed, edSeed, xSeed };
}