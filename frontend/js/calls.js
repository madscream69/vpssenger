// UI-каркас звонков. Реальный WebRTC подключается в 6.3.
// Этот модуль управляет только состоянием интерфейса и событиями кнопок.

import { state } from "./state.js";

const $ = (sel) => document.querySelector(sel);

// ─── состояние ───

export const callState = {
  active: false,        // открыт ли экран звонка
  direction: null,      // "outgoing" | "incoming" | null
  peerEdPub: null,      // edPub собеседника
  peerName: null,       // отображаемое имя
  phase: "idle",        // "idle" | "ringing" | "connecting" | "active" | "ended"
  micEnabled: true,
  camEnabled: true,
};

// Подписчики на изменения состояния (для рендера)
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

// ─── публичное API ───

/**
 * Инициировать исходящий звонок (пока только UI).
 * @param {{edPub: string, name: string}} peer
 */
export function startOutgoingCall(peer) {
  if (callState.active) return;
  setCallState({
    active: true,
    direction: "outgoing",
    peerEdPub: peer.edPub,
    peerName: peer.name,
    phase: "ringing",
    micEnabled: true,
    camEnabled: true,
  });
  // TODO (6.3): отправить `call-invite` через WS.
}

/**
 * Показать попап входящего звонка. Пока вызывается вручную для отладки.
 * @param {{edPub: string, name: string}} peer
 */
export function showIncomingCall(peer) {
  if (callState.active) return;
  setCallState({
    active: false,           // экран звонка ещё не открыт — только попап
    direction: "incoming",
    peerEdPub: peer.edPub,
    peerName: peer.name,
    phase: "ringing",
  });
  $("#incoming-overlay").hidden = false;
  $("#incoming-name").textContent = peer.name;
  $("#incoming-overlay").dataset.peerEdPub = peer.edPub;
}

/** Принять входящий звонок (пока только UI). */
export function acceptIncomingCall() {
  $("#incoming-overlay").hidden = true;
  setCallState({
    active: true,
    direction: "incoming",
    phase: "connecting",
  });
  // TODO (6.3): отправить `call-accept` через WS, получить SDP offer,
  // поднять RTCPeerConnection.
  // Пока симулируем успешное соединение через 1.5 секунды:
  setTimeout(() => {
    if (callState.active && callState.phase === "connecting") {
      setCallState({ phase: "active" });
    }
  }, 1500);
}

/** Отклонить входящий звонок (пока только UI). */
export function declineIncomingCall() {
  $("#incoming-overlay").hidden = true;
  setCallState({
    active: false,
    direction: null,
    peerEdPub: null,
    peerName: null,
    phase: "idle",
  });
  // TODO (6.3): отправить `call-decline` через WS.
}

/** Завершить активный звонок (пока только UI). */
export function endCall() {
  // TODO (6.3): закрыть RTCPeerConnection, остановить треки, отправить `call-end`.
  setCallState({
    active: false,
    direction: null,
    peerEdPub: null,
    peerName: null,
    phase: "idle",
  });
  // Прячем оверлей
  $("#call-overlay").hidden = true;
}

/** Переключить микрофон (визуально). */
export function toggleMic() {
  setCallState({ micEnabled: !callState.micEnabled });
  // TODO (6.3): enabled/disabled на audio-треке.
}

/** Переключить камеру (визуально). */
export function toggleCam() {
  setCallState({ camEnabled: !callState.camEnabled });
  // TODO (6.3): enabled/disabled на video-треке.
}

// ─── рендер ───

function renderCallUi() {
  const overlay = $("#call-overlay");

  if (callState.active) {
    overlay.hidden = false;
    $("#call-peer-name").textContent = callState.peerName || "—";

    // Фаза
    const phaseText = {
      ringing: callState.direction === "outgoing" ? "звоним…" : "входящий…",
      connecting: "соединение…",
      active: "звонок",
      ended: "завершён",
      idle: "",
    }[callState.phase] || "";
    $("#call-state").textContent = phaseText;

    // Кнопки mic/cam — показываем состояние
    $("#call-toggle-mic").classList.toggle("off", !callState.micEnabled);
    $("#call-toggle-cam").classList.toggle("off", !callState.camEnabled);
  } else {
    overlay.hidden = true;
  }
}

// ─── привязка обработчиков ───

export function wireCallUi() {
  $("#call-toggle-mic").onclick = toggleMic;
  $("#call-toggle-cam").onclick = toggleCam;
  $("#call-hangup").onclick = endCall;

  $("#incoming-accept").onclick = acceptIncomingCall;
  $("#incoming-decline").onclick = declineIncomingCall;
}

// ─── отладочные хелперы (в консоли) ───

// В консоли браузера можно вызвать:
//   fsmCallDebug.incoming()
//   fsmCallDebug.startOutgoing()
//   fsmCallDebug.end()
//   fsmCallDebug.accept()
window.fsmCallDebug = {
  incoming() {
    showIncomingCall({
      edPub: "debug-peer-edpub",
      name: "Тестовый звонящий",
    });
  },
  startOutgoing() {
    startOutgoingCall({
      edPub: "debug-peer-edpub",
      name: "Тестовый собеседник",
    });
  },
  accept: acceptIncomingCall,
  decline: declineIncomingCall,
  end: endCall,
};