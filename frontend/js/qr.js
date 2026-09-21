// QR-генерация и сканирование контактов.

import QRCode from "../vendor/qrcode.bundle.mjs";
import jsQR from "../vendor/jsqr.bundle.mjs";
import { state } from "./state.js";
import { b64e } from "./crypto.js";
import * as contacts from "./contacts.js";

// ─── Генерация QR ───

/**
 * Рисует QR с моим контактом в canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string} contactString — строка fsm1:name:edPub:xPub
 */
export async function renderMyQr(canvas, contactString) {
  await QRCode.toCanvas(canvas, contactString, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#0e1116",
      light: "#e6e8ec",
    },
  });
}

/**
 * Возвращает строку моего контакта.
 */
export function buildMyContactString() {
  const myName = contacts.getMyName() || "me";
  return contacts.exportContact({
    name: myName,
    edPub: b64e(state.edPub),
    xPub: b64e(state.xPub),
  });
}

// ─── Сканирование QR ───

let scanState = null;

/**
 * Запускает сканирование через камеру.
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas — скрытый, используется для обработки кадров
 * @param {(result: string) => void} onResult — вызывается один раз при распознавании
 */
export async function startScan(video, canvas, onResult) {
  if (scanState) {
    stopScan();
  }

  // Запрашиваем камеру — сзади, если есть.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 640 } },
    audio: false,
  });

  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play();

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let stopped = false;

  const tick = () => {
    if (stopped) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        console.log("[qr] decoded:", code.data.slice(0, 40) + "...");
        stopped = true;
        stopScan();
        onResult(code.data);
        return;
      }
    }

    requestAnimationFrame(tick);
  };

  scanState = { stream, stopped, tick };
  tick();
}

/**
 * Останавливает сканирование и освобождает камеру.
 */
export function stopScan() {
  if (!scanState) return;
  scanState.stopped = true;
  try {
    scanState.stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    console.warn("[qr] stopScan:", e);
  }
  scanState = null;
}