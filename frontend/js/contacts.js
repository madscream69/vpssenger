import { state, set } from "./state.js";
import { b64e } from "./crypto.js";

const LS_KEY = "fsm.contacts.v1";

export function loadContacts(selfEdPubB64 = null) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const clean = list.filter((c) =>
      c && c.edPub && c.xPub && c.name &&
      (!selfEdPubB64 || c.edPub !== selfEdPubB64)
    );
    set({ contacts: clean });
    if (clean.length !== list.length) persist();
  } catch (e) {
    console.warn("contacts load failed:", e);
  }
}

function persist() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.contacts));
}

export function addContact({ name, edPub, xPub }) {
  if (!name || !edPub || !xPub) throw new Error("нужны name, edPub и xPub");
  const self = state.edPub ? b64e(state.edPub) : null;
  if (self && edPub === self) throw new Error("это твой собственный ключ — добавлять себя не нужно");
  if (state.contacts.some((c) => c.edPub === edPub)) {
    throw new Error("контакт уже добавлен");
  }
  const cleanName = String(name).trim().slice(0, 32) || "без имени";
  const next = [...state.contacts, { name: cleanName, edPub, xPub }];
  set({ contacts: next });
  persist();
}

export function renameContact(edPub, newName) {
  const c = state.contacts.find((x) => x.edPub === edPub);
  if (!c) throw new Error("контакт не найден");
  const clean = String(newName).trim().slice(0, 32);
  if (!clean) throw new Error("имя не может быть пустым");
  c.name = clean;
  set({ contacts: [...state.contacts] });
  persist();
}

export function removeContact(edPub) {
  set({ contacts: state.contacts.filter((c) => c.edPub !== edPub) });
  persist();
}

export function findContact(edPub) {
  return state.contacts.find((c) => c.edPub === edPub) || null;
}

// ── своё имя (только локально, попадает в визитку) ──

const LS_MY_NAME = "fsm.myName.v1";

export function getMyName() {
  return localStorage.getItem(LS_MY_NAME) || "";
}

export function setMyName(name) {
  const clean = String(name).trim().slice(0, 32);
  if (!clean) throw new Error("имя не может быть пустым");
  localStorage.setItem(LS_MY_NAME, clean);
  return clean;
}

export function askMyNameIfMissing() {
  let name = getMyName();
  if (name) return name;
  name = prompt("Как тебя показывать другим? (1–32 символа)");
  if (!name) throw new Error("имя не задано");
  return setMyName(name);
}

// ── визитка ──

export function exportContact(c) {
  return `fsm1:${encodeURIComponent(c.name)}:${c.edPub}:${c.xPub}`;
}

export function importContactString(s) {
  const parts = s.trim().split(":");
  if (parts.length !== 4 || parts[0] !== "fsm1") {
    throw new Error("неверный формат (ожидается fsm1:name:edPub:xPub)");
  }
  return {
    name: decodeURIComponent(parts[1]),
    edPub: parts[2],
    xPub: parts[3],
  };
}