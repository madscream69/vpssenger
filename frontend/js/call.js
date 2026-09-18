// Логика звонка поверх webrtc.js.
// Управляет состоянием UI + вызывает WebRTC.

import { state } from "./state.js";
import { sendSignal, onSignal } from "./callSignaling.js";
import * as rtc from "./webrtc.js";

const $ = (sel) => document.querySelector(sel);

// ─── состояние ───

export const callState = {
  active: false,
  direction: null,       // "outgoing" | "incoming"
  peerEdPub: null,
  peerName: null,
  callId: null,
  phase: "idle",         // "idle" | "ringing" | "connecting" | "active" | "ended"
  micEnabled: true,
  camEnabled: true,
  // WebRTC
  peer: null,            // PeerHandle из webrtc.js
  remoteStream: null,
  incomingOffer: null,   // для случая, когда offer приходит раньше, чем accept
};

let disconnectedTimer = null;

function clearDisconnectedTimer() {
  if (disconnectedTimer) {
    clearTimeout(disconnectedTimer);
    disconnectedTimer = null;
  }
}

function startDisconnectedTimer() {
  clearDisconnectedTimer();
  setCallState({ phase: "reconnecting" });
  disconnectedTimer = setTimeout(() => {
    disconnectedTimer = null;
    const pc = callState.peer?.pc;
    if (
      pc &&
      (pc.connectionState === "disconnected" ||
        pc.iceConnectionState === "disconnected")
    ) {
      console.warn("[call] still disconnected after 20s, ending");
      endCall("network");
    }
  }, 20000);
}

// Подписчики
const subs = new Set();
function emit() { for (const fn of subs) fn(callState); }
export function subscribeCall(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function setCallState(patch) {
  Object.assign(callState, patch);
  renderCallUi();
  emit();
}

function newCallId() {
  return "c-" + Math.random().toString(36).slice(2, 12);
}

// ─── публичное API ───

export function startOutgoingCall(peer) {
  if (callState.active) return;
  if (!state.wsConnected) {
    alert("Нет соединения с сервером. Попробуй позже.");
    return;
  }

  const callId = newCallId();

  setCallState({
    active: true,
    direction: "outgoing",
    peerEdPub: peer.edPub,
    peerName: peer.name,
    callId,
    phase: "ringing",
    micEnabled: true,
    camEnabled: true,
    peer: null,
    remoteStream: null,
    incomingOffer: null,
  });

  initOutgoing().catch((e) => {
    console.error("[call] outgoing failed:", e);
    endCall("error");
  });
}

async function initOutgoing() {
  const { peerEdPub, callId } = callState;
  if (!peerEdPub || !callId) return;
  
  // 1. Локальный стрим + peer
  const handle = await rtc.createPeer({
    callId,
    peerEdPub,
    initiator: true,
    handlers: {
      onRemoteStream: (stream) => {
        callState.remoteStream = stream;
        const video = $("#call-remote");
        if (video) video.srcObject = stream;
      },
      onConnectionState: (s) => {
        console.log("[call] pc state:", s);
        if (s === "connected") {
          setCallState({ phase: "active" });
          clearDisconnectedTimer();
        }
        if (s === "failed" || s === "closed") {
          endCall("hangup");
        }
        if (s === "disconnected") {
          console.warn("[call] disconnected, waiting for recovery...");
          startDisconnectedTimer();
        }
      },
      onError: (e) => console.error("[call] outgoing pc error:", e),
    },
  });

  setCallState({ peer: handle, camEnabled: handle.videoEnabled });

  // Показываем локальное видео
  const localVideo = $("#call-local");
  if (localVideo) localVideo.srcObject = handle.localStream;

  // 2. Отправляем invite
  sendSignal({ type: "call-invite", to: peerEdPub, callId });
}

export function showIncomingCall(peer, callId) {
  // Если уже в звонке — отклоняем нового.
  if (callState.active) {
    sendSignal({ type: "call-decline", to: peer.edPub, callId, reason: "busy" });
    return;
  }

  setCallState({
    active: false,          // UI активного звонка пока не открыт
    direction: "incoming",
    peerEdPub: peer.edPub,
    peerName: peer.name,
    callId,
    phase: "ringing",
    micEnabled: true,
    camEnabled: true,
    peer: null,
    remoteStream: null,
    incomingOffer: null,
  });

  const overlay = $("#incoming-overlay");
  if (overlay) {
    overlay.hidden = false;
    $("#incoming-name").textContent = peer.name;
    overlay.dataset.peerEdPub = peer.edPub;
  }
}

export async function acceptIncomingCall() {
  const overlay = $("#incoming-overlay");
  if (overlay) overlay.hidden = true;

  const { peerEdPub, callId } = callState;
  if (!peerEdPub || !callId) return;

  setCallState({
    active: true,
    phase: "connecting",
  });

  try {
    const handle = await rtc.createPeer({
      callId,
      peerEdPub,
      initiator: false,
      handlers: {
        onRemoteStream: (stream) => {
          callState.remoteStream = stream;
          const video = $("#call-remote");
          if (video) video.srcObject = stream;
        },
        onConnectionState: (s) => {
          console.log("[call] pc state:", s);
          if (s === "connected") {
            setCallState({ phase: "active" });
            clearDisconnectedTimer();
          }
          if (s === "failed" || s === "closed") {
            endCall("hangup");
          }
          if (s === "disconnected") {
            console.warn("[call] disconnected, waiting for recovery...");
            startDisconnectedTimer();
          }
        },
        onError: (e) => console.error("[call] incoming pc error:", e),
      },
    });

    setCallState({ peer: handle, camEnabled: handle.videoEnabled });

    const localVideo = $("#call-local");
    if (localVideo) localVideo.srcObject = handle.localStream;

    // Отправляем accept
    sendSignal({ type: "call-accept", to: peerEdPub, callId });

    // Если offer уже пришёл — обрабатываем сразу.
    if (callState.incomingOffer) {
      await processIncomingOffer(callState.incomingOffer);
    }
  } catch (e) {
    console.error("[call] accept failed:", e);
    endCall("error");
  }
}

async function processIncomingOffer(sdp) {
  const { peer, peerEdPub, callId } = callState;
  if (!peer || !peerEdPub) return;

  try {
    const answerSdp = await rtc.handleOffer(peer.pc, sdp);
    sendSignal({
      type: "call-sdp",
      to: peerEdPub,
      callId,
      kind: "answer",
      sdp: answerSdp,
    });
  } catch (e) {
    console.error("[call] handleOffer failed:", e);
    endCall("error");
  }
}

export function declineIncomingCall() {
  const overlay = $("#incoming-overlay");
  if (overlay) overlay.hidden = true;

  const { peerEdPub, callId } = callState;
  if (peerEdPub && callId) {
    sendSignal({ type: "call-decline", to: peerEdPub, callId, reason: "decline" });
  }

  setCallState({
    active: false,
    direction: null,
    peerEdPub: null,
    peerName: null,
    callId: null,
    phase: "idle",
    peer: null,
    remoteStream: null,
    incomingOffer: null,
  });
}

export function endCall(reason = "hangup") {
  clearDisconnectedTimer();
  const { peer, peerEdPub, callId } = callState;

  if (peerEdPub && callId) {
    sendSignal({ type: "call-end", to: peerEdPub, callId, reason });
  }

  if (peer) {
    try { peer.close(); } catch (e) { console.warn("peer.close:", e); }
  }

  // Останавливаем видео-элементы
  const remote = $("#call-remote");
  const local = $("#call-local");
  if (remote) remote.srcObject = null;
  if (local) local.srcObject = null;

  setCallState({
    active: false,
    direction: null,
    peerEdPub: null,
    peerName: null,
    callId: null,
    phase: "idle",
    peer: null,
    remoteStream: null,
    incomingOffer: null,
  });

  const overlay = $("#call-overlay");
  if (overlay) overlay.hidden = true;
}

export function toggleMic() {
  const next = !callState.micEnabled;
  const tracks = callState.peer?.localStream?.getAudioTracks() || [];
  for (const t of tracks) t.enabled = next;
  setCallState({ micEnabled: next });
}

export function toggleCam() {
  const next = !callState.camEnabled;
  const tracks = callState.peer?.localStream?.getVideoTracks() || [];
  for (const t of tracks) t.enabled = next;
  setCallState({ camEnabled: next });
}

// ─── обработчики входящих сигналов ───
// Вызываются из app.js через registerCallHandlers()

export function handleIncomingInvite(msg) {
  const { from, callId } = msg;
  // Найдём имя контакта.
  const contact = state.contacts.find((c) => c.edPub === from);
  const name = contact ? contact.name : "Неизвестный";
  showIncomingCall({ edPub: from, name }, callId);
}

export async function handleIncomingAccept(msg) {
  // Для инициатора: собеседник принял. Создаём offer.
  const { peer, peerEdPub, callId } = callState;
  if (!peer || !peerEdPub || msg.callId !== callId) return;

  try {
    const offerSdp = await rtc.createOffer(peer.pc);
    sendSignal({
      type: "call-sdp",
      to: peerEdPub,
      callId,
      kind: "offer",
      sdp: offerSdp,
    });
    setCallState({ phase: "connecting" });
  } catch (e) {
    console.error("[call] createOffer failed:", e);
    endCall("error");
  }
}

export function handleIncomingDecline(msg) {
  if (msg.callId !== callState.callId) return;
  console.log("[call] declined:", msg.reason);
  endCall(msg.reason || "decline");
}

export async function handleIncomingSdp(msg) {
  const { peer, peerEdPub, callId } = callState;
  if (msg.callId !== callId) return;

  if (msg.kind === "offer") {
    // Если peer ещё нет — сохраняем offer до accept.
    if (!peer) {
      setCallState({ incomingOffer: msg.sdp });
      return;
    }
    await processIncomingOffer(msg.sdp);
  } else if (msg.kind === "answer") {
    if (!peer) return;
    try {
      await rtc.handleAnswer(peer.pc, msg.sdp);
    } catch (e) {
      console.error("[call] handleAnswer failed:", e);
      endCall("error");
    }
  }
}

export async function handleIncomingIce(msg) {
  const { peer, callId } = callState;
  if (!peer || msg.callId !== callId) return;
  await rtc.handleRemoteIce(peer.pc, msg.candidate);
}

export function handleIncomingEnd(msg) {
  if (msg.callId !== callState.callId) return;
  endCall(msg.reason || "hangup");
}

export function handleUnreachable(msg) {
  if (msg.callId !== callState.callId) return;
  console.warn("[call] unreachable");
  // Показываем в UI, что не дозвонились
  const stateEl = $("#call-state");
  if (stateEl) stateEl.textContent = "не удалось дозвониться";
  setTimeout(() => endCall("unreachable"), 1500);
}

// ─── UI ───

function renderCallUi() {
  const overlay = $("#call-overlay");

  if (callState.active) {
    if (overlay) overlay.hidden = false;
    const nameEl = $("#call-peer-name");
    if (nameEl) nameEl.textContent = callState.peerName || "—";

    const phaseText = {
      ringing: callState.direction === "outgoing" ? "звоним…" : "входящий…",
      connecting: "соединение…",
      active: "звонок",
      reconnecting: "проблема с сетью, восстанавливаем…",
      ended: "завершён",
      idle: "",
    }[callState.phase] || "";
    const stateEl = $("#call-state");
    if (stateEl) {
      stateEl.textContent = phaseText;
      stateEl.classList.toggle("warn", callState.phase === "reconnecting");
    }

    const micBtn = $("#call-toggle-mic");
    const camBtn = $("#call-toggle-cam");
    if (micBtn) micBtn.classList.toggle("off", !callState.micEnabled);
    if (camBtn) camBtn.classList.toggle("off", !callState.camEnabled);
  } else {
    if (overlay) overlay.hidden = true;
  }
}

export function wireCallUi() {
  const micBtn = $("#call-toggle-mic");
  const camBtn = $("#call-toggle-cam");
  const hangupBtn = $("#call-hangup");
  const acceptBtn = $("#incoming-accept");
  const declineBtn = $("#incoming-decline");

  if (micBtn) micBtn.onclick = toggleMic;
  if (camBtn) camBtn.onclick = toggleCam;
  if (hangupBtn) hangupBtn.onclick = () => endCall("hangup");
  if (acceptBtn) acceptBtn.onclick = acceptIncomingCall;
  if (declineBtn) declineBtn.onclick = declineIncomingCall;
}

// ─── отладочные хелперы ───

window.fsmCallDebug = window.fsmCallDebug || {};

window.fsmCallDebug.incoming = () => {
  showIncomingCall(
    { edPub: "debug-peer-edpub-000000000000000000000000000", name: "Тестовый звонящий" },
    "debug-call-id"
  );
};

window.fsmCallDebug.startOutgoing = () => {
  startOutgoingCall({
    edPub: "debug-peer-edpub-000000000000000000000000000",
    name: "Тестовый собеседник",
  });
};

window.fsmCallDebug.accept = acceptIncomingCall;
window.fsmCallDebug.decline = declineIncomingCall;
window.fsmCallDebug.end = endCall;