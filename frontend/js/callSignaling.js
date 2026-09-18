// Сигналинг через WS. Не содержит WebRTC — только обмен сообщениями.

import { state } from "./state.js";

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