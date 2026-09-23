// Обёртка над RTCPeerConnection. Всё WebRTC-мясо здесь.
// call.js вызывает функции отсюда, не трогая нативный API напрямую.

import { state } from "./state.js";
import { sendSignal } from "./callSignaling.js";

const DEFAULT_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ─── получение локального медиа ───

/**
 * Запрашивает камеру и микрофон. При недоступности камеры пробует только аудио.
 * Возвращает { stream, videoEnabled }.
 */
export async function getLocalStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia не поддерживается этим браузером");
  }

  // 1. Сначала пробуем видео + аудио
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    console.log("[webrtc] video+audio ok");
    return { stream, videoEnabled: true };
  } catch (e) {
    console.warn("[webrtc] video+audio failed:", e.name, e.message);
  }

  // 2. Fallback — только аудио
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.warn("[webrtc] audio-only mode");
    return { stream, videoEnabled: false };
  } catch (e2) {
    console.error("[webrtc] audio-only failed too:", e2.name, e2.message);
    throw e2;
  }
}

// ─── получение TURN-кредов ───

let cachedIce = null;
let cachedIceAt = 0;
const ICE_CACHE_MS = 50 * 60 * 1000; // 50 минут (TTL у нас 3600 сек)

async function getIceServers() {
  const now = Date.now();
  if (cachedIce && now - cachedIceAt < ICE_CACHE_MS) return cachedIce;

  try {
    const res = await fetch("/turn/credentials", {
      headers: { "Authorization": "Bearer " + state.token },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const creds = await res.json();

    const ice = [
      ...(creds.stun_uris || []).map((u) => ({ urls: u })),
      {
        urls: creds.uris,
        username: creds.username,
        credential: creds.credential,
      },
    ];
    cachedIce = ice;
    cachedIceAt = now;
    return ice;
  } catch (e) {
    console.warn("getIceServers failed, using default STUN only:", e);
    return DEFAULT_ICE;
  }
}

// ─── PeerConnection ───

/**
 * @typedef {Object} PeerHandle
 * @property {RTCPeerConnection} pc
 * @property {MediaStream|null} localStream
 * @property {boolean} videoEnabled
 * @property {() => void} close
 */

/**
 * Создаёт peer connection для звонка.
 *
 * @param {Object} opts
 * @param {string} opts.callId
 * @param {string} opts.peerEdPub  — edPub собеседника (для отправки сигналов)
 * @param {boolean} opts.initiator — true, если это исходящий звонок
 * @param {Object} opts.handlers
 * @param {(stream: MediaStream) => void} [opts.handlers.onRemoteStream]
 * @param {(state: string) => void} [opts.handlers.onConnectionState]
 * @param {(err: Error) => void} [opts.handlers.onError]
 * @returns {Promise<PeerHandle>}
 */
export async function createPeer({ callId, peerEdPub, initiator, handlers = {} }) {
  const { onRemoteStream, onConnectionState, onError } = handlers;

  // 1. Локальный медиапоток
  const { stream: localStream, videoEnabled } = await getLocalStream();

  // 2. ICE-серверы
  const iceServers = await getIceServers();

  // 3. RTCPeerConnection
  const pc = new RTCPeerConnection({ iceServers });

  // 4. Привязка локальных треков
  const audioTrack = localStream.getAudioTracks()[0];
  const videoTrack = localStream.getVideoTracks()[0];

  if (initiator) {
    // Инициатор объявляет секции явно.
    if (audioTrack) {
      pc.addTransceiver(audioTrack, { direction: "sendrecv", streams: [localStream] });
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    if (videoTrack) {
      pc.addTransceiver(videoTrack, { direction: "sendrecv", streams: [localStream] });
    } else {
      pc.addTransceiver("video", { direction: "recvonly" });
    }
  } else {
    // Отвечающий НЕ создаёт transceivers до offer. Сохраняем треки,
    // добавим их после setRemoteDescription(offer).
    // Если трек есть — сохраняем в handle для последующего addTrack.
    // Здесь ничего не делаем.
  }

  // 5. Обработчики

  // ICE-кандидаты → отправляем собеседнику
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal({
        type: "call-ice",
        to: peerEdPub,
        callId,
        candidate: {
          candidate: e.candidate.candidate,
          sdpMid: e.candidate.sdpMid,
          sdpMLineIndex: e.candidate.sdpMLineIndex,
        },
      });
    }
  };

  // Удалённые треки → в UI
  const remoteStream = new MediaStream();
  pc.ontrack = (e) => {
    for (const track of e.streams[0]?.getTracks() || [e.track]) {
      remoteStream.addTrack(track);
    }
    if (onRemoteStream) onRemoteStream(remoteStream);
  };

  // Состояние соединения
  pc.onconnectionstatechange = () => {
    if (onConnectionState) onConnectionState(pc.connectionState);
    if (pc.connectionState === "connected") {
        console.log("[webrtc] LOCAL SDP:\\n", pc.localDescription?.sdp);
        console.log("[webrtc] REMOTE SDP:\\n", pc.remoteDescription?.sdp);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log("[webrtc] iceConnectionState:", pc.iceConnectionState);
  };

  pc.onerror = (e) => {
    console.warn("[webrtc] pc error:", e);
    if (onError) onError(e.error || new Error("pc error"));
  };
  pc.onsignalingstatechange = () => {
    console.log("[webrtc] signaling state:", pc.signalingState);
  };


  // 6. Хэндл для управления
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { pc.getSenders().forEach((s) => s.track?.stop()); } catch {}
    try { localStream.getTracks().forEach((t) => t.stop()); } catch {}
    try { pc.close(); } catch {}
  };

  return { pc, localStream, videoEnabled, close, initiator };
}

// ─── SDP ───

/**
 * Создать offer (для инициатора) и установить как local description.
 * Возвращает SDP-строку для отправки.
 */
export async function createOffer(pc) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return pc.localDescription.sdp;
}

/**
 * Обработать входящий offer: setRemoteDescription + createAnswer.
 * Возвращает SDP-строку answer для отправки.
 */
export async function handleOffer(pc, sdp, localStream = null) {
  await pc.setRemoteDescription({ type: "offer", sdp });

  // Привязываем свои локальные треки к transceivers, созданным offer'ом.
  if (localStream) {
    attachLocalTracks(pc, localStream);
  }

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return pc.localDescription.sdp;
}

/**
 * Обработать входящий answer (для инициатора).
 */
export async function handleAnswer(pc, sdp) {
  await pc.setRemoteDescription({ type: "answer", sdp });
}

/**
 * Добавить ICE-кандидата от собеседника.
 */
export async function handleRemoteIce(pc, candidate) {
  try {
    await pc.addIceCandidate({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
    });
  } catch (e) {
    console.warn("[webrtc] addIceCandidate failed:", e);
  }
}
/**
 * Для отвечающего: после setRemoteDescription(offer) — привязать
 * свои локальные треки к уже существующим transceiver'ам.
 */
export function attachLocalTracks(pc, localStream) {
  const audio = localStream.getAudioTracks()[0];
  const video = localStream.getVideoTracks()[0];

  if (audio) {
    const t = pc.getTransceivers().find((t) => t.receiver.track?.kind === "audio" || t.mid === "0");
    if (t && !t.sender.track) {
      t.sender.replaceTrack(audio);
      t.direction = "sendrecv";
    } else if (!t) {
      pc.addTrack(audio, localStream);
    }
  }

  if (video) {
    const t = pc.getTransceivers().find((t) => t.receiver.track?.kind === "video" || t.mid === "1");
    if (t && !t.sender.track) {
      t.sender.replaceTrack(video);
      t.direction = "sendrecv";
    } else if (!t) {
      pc.addTrack(video, localStream);
    }
  }
}