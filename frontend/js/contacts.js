import { state, set } from "./state.js";
import { b64e } from "./crypto.js";

// ── ключи localStorage (v2: привязаны к edPub) ──

function contactsKey() {
  const self = b64e(state.edPub);
  return `fsm.${self}.contacts.v1`;
}

function myNameKey() {
  const self = b64e(state.edPub);
  return `fsm.${self}.myName.v1`;
}

// ── миграция v1 → v2 ──
// v1-ключи не были привязаны к аккаунту; переносим их в v2 при первом
// логине после апгрейда. Флаг в localStorage, чтобы не гонять миграцию вечно.

const MIGRATION_FLAG = "fsm.migrated.v2";

export function migrateLegacyStorage(edPubB64) {
  if (localStorage.getItem(MIGRATION_FLAG) === "1") return;

  const legacyContacts = localStorage.getItem("fsm.contacts.v1");
  const legacyName = localStorage.getItem("fsm.myName.v1");

  if (legacyContacts) {
    // На всякий случай: не перетираем уже существующий v2-ключ.
    const target = `fsm.${edPubB64}.contacts.v1`;
    if (!localStorage.getItem(target)) localStorage.setItem(target, legacyContacts);
    localStorage.removeItem("fsm.contacts.v1");
  }

  if (legacyName) {
    const target = `fsm.${edPubB64}.myName.v1`;
    if (!localStorage.getItem(target)) localStorage.setItem(target, legacyName);
    localStorage.removeItem("fsm.myName.v1");
  }

  localStorage.setItem(MIGRATION_FLAG, "1");
  console.info("[fsm] migrated localStorage v1 → v2");
}

// ── CRUD контактов ──

export function loadContacts() {
  if (!state.edPub) return; // ещё не залогинены
  try {
    const self = b64e(state.edPub);
    const raw = localStorage.getItem(contactsKey());
    const list = raw ? JSON.parse(raw) : [];
    const clean = list.filter((c) =>
      c && c.edPub && c.xPub && c.name && c.edPub !== self
    );
    set({ contacts: clean });
    if (clean.length !== list.length) persist();
  } catch (e) {
    console.warn("contacts load failed:", e);
  }
}

function persist() {
  if (!state.edPub) return;
  localStorage.setItem(contactsKey(), JSON.stringify(state.contacts));
}

export function addContact({ name, edPub, xPub }) {
  if (!name || !edPub || !xPub) throw new Error("нужны name, edPub и xPub");
  const self = b64e(state.edPub);
  if (edPub === self) throw new Error("это твой собственный ключ");
  if (state.contacts.some((c) => c.edPub === edPub)) {
    throw new Error("контакт уже добавлен");
  }
  const cleanName = String(name).trim().slice(0, 32) || "без имени";
  set({ contacts: [...state.contacts, { name: cleanName, edPub, xPub }] });
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

// ── своё имя ──

export function getMyName() {
  if (!state.edPub) return "";
  return localStorage.getItem(myNameKey()) || "";
}

export function setMyName(name) {
  const clean = String(name).trim().slice(0, 32);
  if (!clean) throw new Error("имя не может быть пустым");
  localStorage.setItem(myNameKey(), clean);
  return clean;
}

export function askMyNameIfMissing() {
  let name = getMyName();
  if (name) return name;
  name = prompt("Как тебя показывать другим? (1–32 символа)");
  if (!name) throw new Error("имя не задано");
  return setMyName(name);
}

// ── визитки ──

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