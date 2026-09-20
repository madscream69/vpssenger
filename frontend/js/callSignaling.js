// Сигналинг через WS. Не содержит WebRTC — только обмен сообщениями.
import { state } from "./state.js";
import { b64e, b64d, canonicalSdpBytes, ed25519Sign, ed25519Verify } from "./crypto.js";

let wsRef = null;

// Регистрируемся на существующий WS.
export function attachSignaling(ws) {
  //temp
  console.log("[sig] attachSignaling called, readyState:", ws?.readyState);
  //temp
  wsRef = ws;
}

// Хендлеры входящих сообщений: тип → колбэк
const handlers = new Map();

export function onSignal(type, fn) {
  handlers.set(type, fn);
}

export function dispatchSignal(msg) {
  const fn = handlers.get(msg.type);
  if (fn) fn(msg);
}

// Отправка. Возвращает true, если соединение открыто.
export function sendSignal(msg) {
  //temp
  console.log("[sig] sendSignal, wsRef readyState:", wsRef?.readyState);
  //temp
  if (!wsRef || wsRef.readyState !== WebSocket.OPEN) {
    console.warn("WS not open, cannot send signal", msg.type);
    return false;
  }
  wsRef.send(JSON.stringify(msg));
  return true;
}

export function signSdp(payload) {
  if (!state.edSeed) throw new Error("no identity");
  const bytes = canonicalSdpBytes(payload);
  const sig = ed25519Sign(state.edSeed, bytes);
  return b64e(sig);
}

/**
 * Проверяет подпись SDP от указанного публичного ключа.
 * @param {object} payload — { from, to, callId, kind, sdp }
 * @param {string} signatureB64 — base64 подписи
 * @returns {boolean}
 */
export function verifySdp(payload, signatureB64) {
  try {
    const fromBytes = b64d(payload.from);
    const sigBytes = b64d(signatureB64);
    const bytes = canonicalSdpBytes(payload);
    return ed25519Verify(fromBytes, bytes, sigBytes);
  } catch (e) {
    console.warn("[sig] verifySdp error:", e);
    return false;
  }
}