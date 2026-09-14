import { state } from "./state.js";
import { b64e } from "./crypto.js";

const BASE = ""; // тот же origin; если фронт на другом — задать явно http://127.0.0.1:8000

async function request(method, path, { body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function requestChallenge(pubkeyB64) {
  return request("POST", "/auth/challenge", { body: { pubkey: pubkeyB64 }, auth: false });
}

export async function verifyChallenge({ pubkey, challenge, signature }) {
  return request("POST", "/auth/verify", { body: { pubkey, challenge, signature }, auth: false });
}

export async function logout() {
  try { await request("POST", "/auth/logout"); } catch {}
}

export async function sendMessage(envelope) {
  return request("POST", "/messages", { body: envelope });
}

export async function listMessages() {
  return request("GET", "/messages");
}

export async function deleteMessage(id) {
  return request("DELETE", `/messages/${encodeURIComponent(id)}`);
}