import { state, set } from "./state.js";

let ws = null;
let reconnectTimer = null;
let onMessageCb = () => {};

export function onWsMessage(fn) { onMessageCb = fn; }

export function connectWs() {
  if (!state.token) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `ws://127.0.0.1:8000/ws?token=${encodeURIComponent(state.token)}`;
  ws = new WebSocket(url);

  ws.onopen = () => set({ wsConnected: true });

  ws.onclose = () => {
    set({ wsConnected: false });
    // Автоматический реконнект с backoff.
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWs, 2000);
  };

  ws.onerror = () => { /* close сработает следом */ };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    onMessageCb(msg);
  };
}

export function disconnectWs() {
  clearTimeout(reconnectTimer);
  if (ws) { try { ws.close(); } catch {} ws = null; }
  set({ wsConnected: false });
}