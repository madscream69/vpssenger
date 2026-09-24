import { state, set, subscribe, reset } from "./state.js";
import {
  generateMnemonic, deriveKeys, validateMnemonic,
} from "./seed.js";
import {
  b64e, b64d,
  ed25519GetPublicKey, ed25519Sign, ed25519Verify,
  x25519GetPublicKey, deriveMessageKey,
  encryptMessage, decryptMessage,
  canonicalMessageBytes,
  randomId,
} from "./crypto.js";
import * as api from "./api.js";
import { connectWs, disconnectWs, onWsMessage } from "./ws.js";
import * as contacts from "./contacts.js";
import {
  wireCallUi,
  startOutgoingCall,
  handleIncomingInvite,
  handleIncomingAccept,
  handleIncomingDecline,
  handleIncomingSdp,
  handleIncomingIce,
  handleIncomingEnd,
  handleUnreachable,
  handleIncomingCallState,
} from "./call.js";
import {
  renderMyQr,
  buildMyContactString,
  startScan,
  stopScan,
} from "./qr.js";
import { onSignal, sendSignal } from "./callSignaling.js";
function setView(view) {
  document.body.classList.toggle("view-list", view === "list");
  document.body.classList.toggle("view-chat", view === "chat");
}
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- RegisterCallHandlers ------

// Регистрация обработчиков входящих сигналов звонка.
// Вызывается один раз из boot().
function registerCallHandlers() {
  onSignal("call-invite", (msg) => {
    console.log("INCOMING CALL", msg);
    handleIncomingInvite(msg);
  });

  onSignal("call-accept", (msg) => {
    console.log("CALL ACCEPTED", msg);
    handleIncomingAccept(msg);
  });

  onSignal("call-decline", (msg) => {
    console.log("CALL DECLINED", msg);
    handleIncomingDecline(msg);
  });

  onSignal("call-sdp", (msg) => {
    console.log("SDP", msg.kind, msg.from?.slice(0, 12));
    handleIncomingSdp(msg);
  });

  onSignal("call-ice", (msg) => {
    handleIncomingIce(msg);
  });

  onSignal("call-end", (msg) => {
    console.log("CALL ENDED", msg.reason);
    handleIncomingEnd(msg);
  });

  onSignal("call-unreachable", (msg) => {
    console.log("CALL UNREACHABLE", msg.to?.slice(0, 12));
    handleUnreachable(msg);
  });

  onSignal("call-rate-limited", () => {
    console.warn("Rate limited");
  });

  onSignal("call-error", (msg) => {
    console.warn("Call error:", msg.error);
  });

  onSignal("call-state", (msg) => {
    console.log("CALL STATE", msg);
    handleIncomingCallState(msg);
  });

  // Отладочный хелпер для тестов (как раньше).
  window.fsmCallDebug = window.fsmCallDebug || {};
  window.fsmCallDebug.testSignal = (toEdPub) => {
    const callId = "test-" + Math.random().toString(36).slice(2, 10);
    const ok = sendSignal({ type: "call-invite", to: toEdPub, callId });
    console.log("sent call-invite:", { ok, callId, toEdPub: toEdPub.slice(0, 12) });
    return callId;
  };
}

// ---------- Boot ----------

async function boot() {
  wireCallUi();
  registerCallHandlers();
  // contacts.loadContacts();
  wireUi();
  
  // Попытка восстановить из sessionStorage (если была галочка «запомнить»).
  const saved = sessionStorage.getItem("fsm.mnemonic");
  if (saved && validateMnemonic(saved)) {
    $("#mnemonic-input").value = saved;
    $("#remember").checked = true;
    await loginFromMnemonic(saved);
  }
  // в конце boot() или после wireCallUi():
  function attachCallDebug() {
    window.fsmCallDebug = window.fsmCallDebug || {};
    window.fsmCallDebug.testSignal = (toEdPub) => {
      const callId = "test-" + Math.random().toString(36).slice(2, 10);
      const ok = sendSignal({ type: "call-invite", to: toEdPub, callId });
      console.log("sent call-invite:", { ok, callId, toEdPub: toEdPub.slice(0, 12) });
      return callId;
    };
  }
  attachCallDebug();
  render();
}

subscribe(render);

// ---------- Auth ----------

async function loginFromMnemonic(mnemonic) {
  const { edSeed, xSeed } = await deriveKeys(mnemonic);
  const edPub = ed25519GetPublicKey(edSeed);
  const xPub = x25519GetPublicKey(xSeed);

  set({ mnemonic, edSeed, xSeed, edPub, xPub });

  // ↓↓ новое: перезагружаем контакты с фильтром self
  contacts.migrateLegacyStorage(b64e(edPub));
  contacts.loadContacts();

  try {
    contacts.askMyNameIfMissing();
  } catch {
    // пользователь отказался вводить — просто оставим пустым
  }

  // challenge → sign → verify
  const pubkey = b64e(edPub);
  const { challenge } = await api.requestChallenge(pubkey);
  const sig = ed25519Sign(edSeed, b64d(challenge));
  const { token, expires_at } = await api.verifyChallenge({
    pubkey, challenge, signature: b64e(sig),
  });

  set({ token, tokenExpiresAt: expires_at });

  if ($("#remember").checked) {
    sessionStorage.setItem("fsm.mnemonic", mnemonic);
  } else {
    sessionStorage.removeItem("fsm.mnemonic");
  }

  // Забираем непрочитанное и подключаем WS.
  const inbox = await api.listMessages();
  set({ messages: inbox });
  await decryptAll();

  connectWs();
}

function doLogout() {
  api.logout();
  disconnectWs();
  sessionStorage.removeItem("fsm.mnemonic");
  reset();
}

// ---------- Decrypt incoming ----------

async function decryptAll({ retry = false } = {}) {
  const { xSeed, edPub } = state;
  let changed = false;

  for (const env of state.messages) {
    const alreadyOk = env._plain !== undefined && env._plain !== null;
    if (alreadyOk && !retry) continue;

    // Если retry=true — пытаемся заново даже для тех, у кого _error.
    // Если retry=false — обрабатываем только те, что ещё не пытались.
    if (!retry && env._plain !== undefined) continue;

    const hadError = !!env._error;
    try {
      await decryptOne(env);
      env._error = undefined;
      changed = true;
    } catch (e) {
      env._plain = null;
      env._error = e.message;
      if (!hadError) changed = true;
    }
  }

  if (changed) set({ messages: [...state.messages] });
}

async function decryptOne(env) {
  const myEd = b64e(state.edPub);
  const isMine = env.from === myEd;

  // Собеседник — это «другая сторона» сообщения.
  const peerEdB64 = isMine ? env.to : env.from;
  const peer = contacts.findContact(peerEdB64);
  if (!peer) {
    throw new Error(isMine ? "unknown recipient" : "unknown sender");
  }

  const peerXPub = b64d(peer.xPub);
  const key = await deriveMessageKey(state.xSeed, peerXPub);

  const id = env.id;
  const nonce = b64d(env.nonce);
  const ct = b64d(env.ct);
  const fromPub = b64d(env.from);
  const toPub = b64d(env.to);
  const ts = env.ts;

  // AD = canonical без ct (та же формула, что у отправителя).
  const adBytes = buildAd({ id, fromPub, toPub, ts, nonce });

  const plaintext = decryptMessage({ key, nonce, ad: adBytes, ct });
  env._plain = plaintext;
  env._mine = isMine;
  env._error = undefined;

  // Подпись проверяем всегда — независимо от того, чьё это сообщение.
  const toSign = canonicalMessageBytes(
    new TextEncoder().encode(id), fromPub, toPub, ts, nonce, ct,
  );
  env._sig_ok = ed25519Verify(fromPub, toSign, b64d(env.sig));
}

// AD = канонический префикс без ct (совпадает с клиентом-отправителем).
function buildAd({ id, fromPub, toPub, ts, nonce }) {
  const enc = new TextEncoder();
  const idB = enc.encode(id);
  const parts = [
    enc.encode("fsm-msg-v1\0"),
    new Uint8Array([(idB.length >>> 8) & 0xff, idB.length & 0xff]),
    idB,
    fromPub, toPub,
    (() => { const o = new Uint8Array(8); new DataView(o.buffer).setBigUint64(0, BigInt(ts), false); return o; })(),
    new Uint8Array([nonce.length]),
    nonce,
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0; for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ---------- Send ----------

async function sendText(toEdPubB64, text) {
  const contact = contacts.findContact(toEdPubB64);
  if (!contact) throw new Error("unknown contact");
  const toXPub = b64d(contact.xPub);

  const id = randomId();
  const ts = Math.floor(Date.now() / 1000);
  const nonce = crypto.getRandomValues(new Uint8Array(24));

  const key = await deriveMessageKey(state.xSeed, toXPub);
  const fromPub = state.edPub;
  const toPub = b64d(toEdPubB64);

  const adBytes = buildAd({ id, fromPub, toPub, ts, nonce });
  const { ct } = encryptMessage({ key, nonce, ad: adBytes, plaintext: text });

  const toSign = canonicalMessageBytes(
    new TextEncoder().encode(id), fromPub, toPub, ts, nonce, ct,
  );
  const sig = ed25519Sign(state.edSeed, toSign);

  const envelope = {
    id, to: toEdPubB64, ts,
    nonce: b64e(nonce), ct: b64e(ct), sig: b64e(sig),
  };

  await api.sendMessage(envelope);

  // Локально отображаем как отправленное.
  state.messages.push({
    ...envelope,
    from: b64e(fromPub),
    _plain: text,
    _sig_ok: true,
    _mine: true,
  });
  set({ messages: [...state.messages] });
}

// ---------- WS ----------

onWsMessage(async (msg) => {
  if (msg.type === "message" && msg.message) {
    const env = msg.message;
    if (state.messages.some((m) => m.id === env.id)) return;
    try { await decryptOne(env); } catch (e) { env._error = e.message; }
    state.messages.push(env);
    set({ messages: [...state.messages] });
  }
});

// ---------- UI ----------

function wireUi() {
  wireCallUi();
  // ─── QR: мой контакт ───
  const qrShow = $("#qr-show-overlay");
  const qrShowCanvas = $("#qr-show-canvas");

  $("#qr-show-close").onclick = () => {
    qrShow.hidden = true;
  };

  $("#qr-copy-string").onclick = async () => {
    const s = buildMyContactString();
    try {
      await navigator.clipboard.writeText(s);
      alert("Строка контакта скопирована");
    } catch {
      prompt("Скопируй вручную:", s);
    }
  };

  // ─── QR: сканирование ───
  const qrScan = $("#qr-scan-overlay");
  const qrScanVideo = $("#qr-scan-video");
  const qrScanCanvas = $("#qr-scan-canvas");
  const qrScanStatus = $("#qr-scan-status");

  $("#qr-scan-cancel").onclick = () => {
    stopScan();
    qrScan.hidden = true;
  };

  $("#back-btn").onclick = () => setView("list");

  $("#start-call").onclick = () => {
    if (!state.activePeer) return alert("Выбери контакт");
    const peer = contacts.findContact(state.activePeer);
    if (!peer) return alert("Контакт не найден");
    startOutgoingCall({ edPub: peer.edPub, name: peer.name });
  };
  $("#gen-seed").onclick = () => {
    $("#mnemonic-input").value = generateMnemonic();
  };

  $("#login").onclick = async () => {
    const m = $("#mnemonic-input").value.trim().toLowerCase().replace(/\s+/g, " ");
    if (!validateMnemonic(m)) return alert("Invalid mnemonic");
    try { await loginFromMnemonic(m); }
    catch (e) { alert("Login failed: " + e.message); }
  };

  $("#logout").onclick = doLogout;

  $("#add-contact").onclick = async () => {
  // Спрашиваем способ
    const useScanner = confirm(
      "Добавить контакт:\n\n" +
      "OK — сканировать QR\n" +
      "Отмена — вставить строку вручную"
    );

    if (useScanner) {
      qrScan.hidden = false;
      qrScanStatus.textContent = "Наведи камеру на QR-код";
      try {
        await startScan(qrScanVideo, qrScanCanvas, (scanned) => {
          qrScan.hidden = true;
          handleIncomingContactString(scanned);
        });
      } catch (e) {
        qrScan.hidden = true;
        alert("Не удалось открыть камеру: " + e.message);
      }
    } else {
      const raw = prompt("Вставь строку контакта (fsm1:name:edPub:xPub):");
      if (!raw) return;
      handleIncomingContactString(raw.trim());
    }
  };

  $("#copy-my-contact").onclick = async () => {
    const contactString = buildMyContactString();
    await renderMyQr(qrShowCanvas, contactString);
    $("#qr-my-name").textContent = contacts.getMyName() || "(без имени)";
    qrShow.hidden = false;
  };

  $("#send").onclick = async () => {
    const text = $("#composer").value.trim();
    if (!text) return;
    if (!state.activePeer) return alert("Выбери контакт");
    try {
      await sendText(state.activePeer, text);
      $("#composer").value = "";
    } catch (e) { alert("Send failed: " + e.message); }
  };

  $("#composer").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#send").click();
    }
  });

  $("#change-my-name").onclick = () => {
  const cur = contacts.getMyName();
  const next = prompt("Твоё новое имя:", cur);
  if (!next) return;
  try {
    const saved = contacts.setMyName(next);
    alert(`Готово. Теперь ты «${saved}». Не забудь раздать новую визитку (📋).`);
    render(); // на случай, если отображаем имя в UI
  } catch (e) { alert(e.message); }
};
}
async function handleIncomingContactString(raw) {
  try {
    const c = contacts.importContactString(raw);
    contacts.addContact(c);
    await decryptAll({ retry: true });
    alert(`Контакт «${c.name}» добавлен`);
  } catch (e) {
    alert("Ошибка: " + e.message);
  }
}
// ---------- Render ----------

function render() {
  const logged = !!state.token;
  document.body.classList.toggle("auth-mode", !logged);
  const myName = contacts.getMyName() || "(без имени)";
  $("#me-name").textContent = myName;
  $("#me-id").textContent = state.edPub ? b64e(state.edPub).slice(0, 24) + "…" : "";
  $("#me-id").title = state.edPub ? b64e(state.edPub) : "";
  $("#screen-login").style.display = logged ? "none" : "block";
  $("#screen-chat").style.display = logged ? "grid" : "none";

  if (!logged) return;

  // свой контакт
  $("#me-id").textContent = myName;
  $("#me-id").title = b64e(state.edPub); // наведение покажет полный ключ

  // статус ws
  $("#ws-status").className = state.wsConnected ? "on" : "off";
  $("#ws-status").title = state.wsConnected ? "онлайн" : "оффлайн";

  // контакты
  const list = $("#contacts");
  list.innerHTML = "";
  for (const c of state.contacts) {
    const el = document.createElement("div");
    el.className = "contact" + (state.activePeer === c.edPub ? " active" : "");
    const last = [...state.messages].reverse().find((m) => m.from === c.edPub || m.to === c.edPub);
    el.innerHTML = `<div class="name">${escapeHtml(c.name)}</div>
                    <div class="last">${last ? escapeHtml((last._plain ?? "🔒").slice(0, 40)) : ""}</div>`;
    el.onclick = () => {
      set({ activePeer: c.edPub });
      setView("chat"); // на мобилке переключит на чат
    };
    list.appendChild(el);
    // somnevaus
    el.onclick = () => {
      set({ activePeer: c.edPub });
      setView("chat"); // на мобилке переключит на чат
    };
    let pressTimer = null;
    el.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        const next = prompt("Новое имя для контакта:", c.name);
        if (next == null) return;
        try { contacts.renameContact(c.edPub, next); } catch (e) { alert(e.message); }
      }, 600);
    }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
    el.addEventListener("touchmove", () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
    el.ondblclick = (ev) => {
      ev.preventDefault();
      const next = prompt("Новое имя для контакта:", c.name);
      if (next == null) return;
      try {
        contacts.renameContact(c.edPub, next);
      } catch (e) { alert(e.message); }
    };
    el.title = "Двойной клик — переименовать";
  }

  // чат
  const peer = state.activePeer ? contacts.findContact(state.activePeer) : null;
  $("#chat-title").textContent = peer ? peer.name : "Выбери контакт";
  $("#chat-status").textContent = peer ? "" : "";
  const log = $("#messages");
  log.innerHTML = "";
  if (peer) {
    const thread = state.messages
      .filter((m) => m.from === peer.edPub || m.to === peer.edPub)
      .sort((a, b) => a.ts - b.ts);
    for (const m of thread) {
      const mine = m.from === b64e(state.edPub);
      const el = document.createElement("div");
      el.className = "msg " + (mine ? "mine" : "peer");
      const time = new Date(m.ts * 1000).toLocaleTimeString();
      const txt = m._plain ?? (m._error ? "⚠ не удалось расшифровать" : "…");
      const warn = m._sig_ok === false ? " ⚠" : "";
      el.innerHTML = `<div class="bubble">${escapeHtml(txt)}${warn}</div>
                      <div class="time">${time}</div>`;
      log.appendChild(el);
    }
    log.scrollTop = log.scrollHeight;
  }
  if (state.activePeer === null && window.innerWidth <= 720) {
    setView("list");
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((e) =>
    console.warn("SW register failed:", e)
  );
}
boot();