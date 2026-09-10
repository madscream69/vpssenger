// Глобальное состояние приложения. Держится в памяти.
// Сид/приватные ключи НИКОГДА не пишутся на диск, кроме опционального sessionStorage.

export const state = {
  // identity
  mnemonic: null,     // string | null
  edSeed: null,       // Uint8Array(32) | null
  xSeed: null,        // Uint8Array(32) | null
  edPub: null,        // Uint8Array(32) | null (identity, base64 на проводе)
  xPub: null,         // Uint8Array(32) | null (encryption)

  // session
  token: null,
  tokenExpiresAt: 0,

  // data
  contacts: [],       // [{name, edPub (b64), xPub (b64)}]
  messages: [],       // [{id, from, to, ts, nonce, ct, sig, _plain?}]
  activePeer: null,   // edPub (b64) выбранного собеседника

  // runtime
  wsConnected: false,
};

const subs = new Set();

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function set(patch) {
  Object.assign(state, patch);
  for (const fn of subs) fn(state);
}

export function reset() {
  set({
    mnemonic: null, edSeed: null, xSeed: null, edPub: null, xPub: null,
    token: null, tokenExpiresAt: 0, messages: [], activePeer: null,
  });
}