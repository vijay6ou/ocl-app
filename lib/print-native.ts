export type OclNative = {
  available: () => boolean;
  printHtml: (html: string, jobName?: string) => void;
  appVersionName?: () => string;
  appVersionCode?: () => number;
  checkUpdate?: () => void;
  installUpdate?: (url: string) => void;
  capturePhoto?: (facing: "environment" | "user") => void;
  pickGallery?: () => void;
  takeLastCapture?: () => string | null;
  requestLocationPermission?: () => void;
  hasLocationPermission?: () => boolean;
};

declare global {
  interface Window {
    OCLNative?: OclNative;
    __oclOnCaptureReady?: () => void;
  }
}

export function isOclNative() {
  try {
    return Boolean(window.OCLNative?.available?.());
  } catch {
    return false;
  }
}

export type CameraFacing = "environment" | "user";

export function captureWithNative(facing: CameraFacing): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const native = window.OCLNative;
    if (!native?.capturePhoto || !native.takeLastCapture) {
      reject(new Error("In-app camera is not available."));
      return;
    }
    const timer = window.setTimeout(() => {
      window.__oclOnCaptureReady = undefined;
      reject(new Error("Camera timed out."));
    }, 120_000);
    window.__oclOnCaptureReady = () => {
      window.clearTimeout(timer);
      window.__oclOnCaptureReady = undefined;
      try {
        const dataUrl = native.takeLastCapture?.() ?? "";
        const blob = dataUrlToBlob(dataUrl);
        if (!blob) throw new Error("Camera did not return a photo.");
        resolve(blob);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Camera capture failed."));
      }
    };
    native.capturePhoto(facing);
  });
}

export function pickFromGallery(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const native = window.OCLNative;
    if (!native?.pickGallery || !native.takeLastCapture) {
      reject(new Error("Gallery is not available."));
      return;
    }
    const timer = window.setTimeout(() => {
      window.__oclOnCaptureReady = undefined;
      reject(new Error("Gallery timed out."));
    }, 120_000);
    window.__oclOnCaptureReady = () => {
      window.clearTimeout(timer);
      window.__oclOnCaptureReady = undefined;
      try {
        const dataUrl = native.takeLastCapture?.() ?? "";
        const blob = dataUrlToBlob(dataUrl);
        if (!blob) throw new Error("No photo was selected.");
        resolve(blob);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Gallery pick failed."));
      }
    };
    native.pickGallery();
  });
}

export async function captureWithGetUserMedia(facing: CameraFacing): Promise<Blob> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Live camera needs a secure browser session.");
  }
  const stream = await openFacingStream(facing);
  try {
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => window.setTimeout(r, 250));
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not snapshot the camera.");
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.86)
    );
    if (!blob) throw new Error("Could not snapshot the camera.");
    return blob;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export async function openFacingStream(facing: CameraFacing) {
  const constraints: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { exact: facing }, width: { ideal: 1280 } } },
    { audio: false, video: { facingMode: facing, width: { ideal: 1280 } } },
    { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 } } },
  ];
  let lastError: unknown;
  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint);
    } catch (err) {
      lastError = err;
    }
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const pick =
      facing === "user"
        ? cams.find((d) => /front|user|selfie/i.test(d.label)) ?? cams[0]
        : cams.find((d) => /back|rear|environment|wide/i.test(d.label)) ??
          cams[cams.length - 1];
    if (pick?.deviceId) {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: pick.deviceId }, width: { ideal: 1280 } },
      });
    }
  } catch (err) {
    lastError = err;
  }
  throw lastError instanceof Error ? lastError : new Error("Could not open the requested camera.");
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: match[1] || "image/jpeg" });
}

const PRINT_CSS = `
  body { font-family: sans-serif; color: #1a1a1a; margin: 12mm; }
  .report { font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; }
  img { max-width: 40mm; }
  header.app-shell, .print-hidden, .print\\:hidden { display: none !important; }
  .report-banner { display: block !important; border-bottom: 1px solid #ccc; padding-bottom: 8pt; margin-bottom: 10pt; }
`;

export function printReport() {
  if (isOclNative() && window.OCLNative?.printHtml) {
    const report = document.querySelector(".report");
    const body = report ? report.outerHTML : document.body.innerHTML;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
    window.OCLNative.printHtml(html, "Adani Cements Maintenance Report");
    return;
  }
  window.print();
}
