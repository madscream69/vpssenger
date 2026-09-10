import { generateMnemonic, deriveKeys, validateMnemonic } from "./seed.js";
import {
  b64e, b64d,
  ed25519GetPublicKey, ed25519Sign, ed25519Verify,
  x25519GetPublicKey, deriveMessageKey,
  encryptMessage, decryptMessage,
  canonicalMessageBytes,
  randomId,
} from "./crypto.js";

const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const el = $("log");
  el.textContent += (typeof msg === "string" ? msg : JSON.stringify(msg, null, 2)) + "\n";
  el.scrollTop = el.scrollHeight;
};

$("gen").onclick = () => {
  $("mnemonic").value = generateMnemonic();
};

$("derive").onclick = async () => {
  try {
    const m = $("mnemonic").value;
    if (!validateMnemonic(m)) return log("❌ invalid mnemonic");
    const { edSeed, xSeed } = await deriveKeys(m);
    const edPub = ed25519GetPublicKey(edSeed);
    const xPub = x25519GetPublicKey(xSeed);
    $("keys").innerHTML = `
      <div><b>Ed25519 pub</b> (id): <code>${b64e(edPub)}</code></div>
      <div><b>X25519 pub</b> (enc): <code>${b64e(xPub)}</code></div>
    `;
    log("✅ keys derived");
  } catch (e) {
    log("❌ " + e.message);
  }
};

async function makeUser(label) {
  const mnemonic = generateMnemonic();
  const { edSeed, xSeed } = await deriveKeys(mnemonic);
  const edPub = await ed25519GetPublicKey(edSeed);
  const xPub = x25519GetPublicKey(xSeed);
  return { label, mnemonic, edSeed, xSeed, edPub, xPub };
}

$("demo").onclick = async () => {
  try {
    log("── E2E demo ──");
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    log(`alice id  = ${b64e(alice.edPub)}`);
    log(`bob   id  = ${b64e(bob.edPub)}`);

    const plaintext = "Привет, bob!";
    const id = randomId();
    const ts = Math.floor(Date.now() / 1000);
    const nonce = crypto.getRandomValues(new Uint8Array(24));

    // 1) симметричный ключ из ECDH(alice.x, bob.x)
    const key = await deriveMessageKey(alice.xSeed, bob.xPub);
    log(`shared key (b64) = ${b64e(key)}`);

    // 2) AD = canonical без ct — клиент и сервер знают эти поля в plaintext
    //    Мы связываем ciphertext с (id, from, to, ts).
    const adFull = canonicalMessageBytes(
      new TextEncoder().encode(id),
      alice.edPub,
      bob.edPub,
      ts,
      nonce,
      new Uint8Array(), // ct будет подставлен отдельно в подпись; в AD берём без ct
    );
    // Правильнее: AD = префикс + метаданные без ct. Используем ту же функцию, но
    // при AEAD передаём полный набор полей, а в подпись — тот же canonical с ct.
    // Для чистоты AD соберём вручную:
    const adBytes = (() => {
      const e = new TextEncoder();
      const parts = [
        e.encode("fsm-msg-v1\0"),
        new Uint8Array([0, id.length]), // u16be для коротких id (<256) — допустимо
        e.encode(id),
        alice.edPub,
        bob.edPub,
        (() => { const o = new Uint8Array(8); new DataView(o.buffer).setBigUint64(0, BigInt(ts), false); return o; })(),
        new Uint8Array([nonce.length]),
        nonce,
      ];
      const total = parts.reduce((s, p) => s + p.length, 0);
      const out = new Uint8Array(total);
      let off = 0; for (const p of parts) { out.set(p, off); off += p.length; }
      return out;
    })();

    // 3) шифруем
    const { ct } = encryptMessage({ key, nonce, ad: adBytes, plaintext });
    log(`ciphertext (${ct.length}B) = ${b64e(ct)}`);

    // 4) подпись над canonical(...ct)
    const toSign = canonicalMessageBytes(
      new TextEncoder().encode(id),
      alice.edPub,
      bob.edPub,
      ts,
      nonce,
      ct,
    );
    const sig = ed25519Sign(alice.edSeed, toSign);
    log(`signature = ${b64e(sig)}`);

    // 5) получатель проверяет подпись
    const sigOk = ed25519Verify(alice.edPub, toSign, sig);
    log(`signature valid = ${sigOk}`);

    // 6) получатель деривирует тот же ключ через ECDH(bob.x, alice.x)
    const keyBob = await deriveMessageKey(bob.xSeed, alice.xPub);
    if (b64e(keyBob) !== b64e(key)) throw new Error("shared key mismatch!");

    // 7) расшифровка
    const pt = decryptMessage({ key: keyBob, nonce, ad: adBytes, ct });
    log(`decrypted = ${pt}`);
    if (pt !== plaintext) throw new Error("decrypt mismatch!");

    log("✅ full E2E cycle OK");
    // debug: копируем в debug_payload.json для кросс-проверки с Python
    log("── COPY FROM HERE ──");
    log(JSON.stringify({
      id:    id,
      ts:    ts,
      from_pub: b64e(alice.edPub),
      to_pub:   b64e(bob.edPub),
      nonce: b64e(nonce),
      ct:    b64e(ct),
      sig:   b64e(sig),
    }, null, 2));
    log("── TO HERE ──");
  } catch (e) {
    log("❌ " + e.message + "\n" + e.stack);
  }
};
// debug
const m = generateMnemonic();
const { edSeed, xSeed } = await deriveKeys(m);
console.log("edSeed type:", Object.prototype.toString.call(edSeed), "len:", edSeed.length, edSeed);
console.log("xSeed  type:", Object.prototype.toString.call(xSeed),  "len:", xSeed.length,  xSeed);