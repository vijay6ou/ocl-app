import { decode, encode } from "jpeg-js";
import { getLocationDiscordThread, saveLocationDiscordThread } from "@/lib/store";
import { plantSlotKey, PLANT_TIME_ZONE_LABEL } from "@/lib/submit-time";
import type { LocationPing, PublicUser } from "@/lib/types";

const APP_UA = "OCLMaintenance/1.11.0";

/** Esri ArcGIS Online World Imagery MapServer (no API key). */
const ESRI_WORLD_IMAGERY_EXPORT =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";

const SNAP_W = 640;
const SNAP_H = 420;

function locationWebhook() {
  return (process.env.LOCATION_DISCORD_WEBHOOK_URL ?? "").trim();
}

export function mapsSatelliteUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

export function formatLocationDiscord(ping: LocationPing) {
  const acc =
    ping.accuracy != null && Number.isFinite(ping.accuracy)
      ? `${Math.round(ping.accuracy)} m`
      : "unknown";
  const snap = ping.satelliteAttached
    ? "Satellite snapshot attached."
    : "Satellite snapshot not attached (imagery fetch failed). Open the map link.";
  return [
    `Location check-in · ${ping.slot}`,
    `${ping.name} (${ping.username})`,
    `Lat ${ping.lat.toFixed(6)}  Lng ${ping.lng.toFixed(6)}  ±${acc}`,
    `Map: ${ping.mapUrl}`,
    snap,
  ].join("\n");
}

function imageryBbox(lat: number, lng: number) {
  const halfLat = 0.0018;
  const cos = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const halfLng = 0.0018 / cos;
  const minLng = lng - halfLng;
  const minLat = lat - halfLat;
  const maxLng = lng + halfLng;
  const maxLat = lat + halfLat;
  return `${minLng},${minLat},${maxLng},${maxLat}`;
}

function stampCenterPin(jpeg: Buffer): Buffer {
  try {
    const img = decode(jpeg, { maxMemoryUsageInMB: 32, useTArray: true });
    const w = img.width;
    const h = img.height;
    const data = img.data as Uint8Array;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2) - 6;
    const setPx = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      const srcA = a / 255;
      data[i] = Math.round(r * srcA + data[i] * (1 - srcA));
      data[i + 1] = Math.round(g * srcA + data[i + 1] * (1 - srcA));
      data[i + 2] = Math.round(b * srcA + data[i + 2] * (1 - srcA));
      data[i + 3] = 255;
    };
    const fillCircle = (ox: number, oy: number, radius: number, r: number, g: number, b: number) => {
      const rr = radius * radius;
      for (let y = -radius; y <= radius; y += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          if (x * x + y * y <= rr) setPx(ox + x, oy + y, r, g, b);
        }
      }
    };
    fillCircle(cx, cy, 11, 255, 255, 255);
    fillCircle(cx, cy, 8, 220, 38, 38);
    fillCircle(cx, cy, 3, 255, 255, 255);
    for (let y = 8; y <= 22; y += 1) {
      for (let x = -2; x <= 2; x += 1) {
        const t = (y - 8) / 14;
        const taper = Math.max(0, 2 - Math.floor(t * 2));
        if (Math.abs(x) <= taper) setPx(cx + x, cy + y, 220, 38, 38);
      }
    }
    const encoded = encode({ data: Buffer.from(data), width: w, height: h }, 85);
    return Buffer.from(Uint8Array.from(encoded.data));
  } catch {
    return jpeg;
  }
}

export async function fetchSatelliteJpeg(lat: number, lng: number): Promise<Buffer | null> {
  const bbox = imageryBbox(lat, lng);
  const url = `${ESRI_WORLD_IMAGERY_EXPORT}?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${SNAP_W},${SNAP_H}&format=jpg&f=image`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": APP_UA, Accept: "image/jpeg" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200 || buf.length > 7_500_000) return null;
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    return stampCenterPin(buf);
  } catch {
    return null;
  }
}

export async function notifyLocationDiscord(ping: LocationPing, jpeg: Buffer | null) {
  const hook = locationWebhook();
  if (!hook) return { status: "skipped" as const, attached: false };
  const date = ping.slot.slice(0, 10);
  const existing = await getLocationDiscordThread(date);
  const form = new FormData();
  const payload: Record<string, unknown> = {
    username: "Adani Cements location",
    content: formatLocationDiscord({ ...ping, satelliteAttached: Boolean(jpeg) }).slice(0, 1900),
  };
  if (!existing?.threadId) payload.thread_name = `Location · ${date}`;
  form.append("payload_json", JSON.stringify(payload));
  if (jpeg) {
    form.append("files[0]", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "satellite.jpg");
  }
  const url = new URL(hook);
  url.searchParams.set("wait", "true");
  if (existing?.threadId) url.searchParams.set("thread_id", existing.threadId);
  const res = await fetch(url.toString(), {
    method: "POST",
    body: form,
    headers: { "User-Agent": APP_UA },
  });
  const raw = await res.text();
  if (!res.ok) return { status: "failed" as const, attached: Boolean(jpeg) };
  try {
    const msg = JSON.parse(raw) as { channel_id?: string };
    if (msg.channel_id) await saveLocationDiscordThread(date, String(msg.channel_id));
  } catch {
    /* thread id is optional for a successful post */
  }
  return { status: "ok" as const, attached: Boolean(jpeg) };
}

export async function buildLocationPing(
  user: PublicUser,
  lat: number,
  lng: number,
  accuracy?: number
): Promise<{ ping: LocationPing; jpeg: Buffer | null }> {
  const jpeg = await fetchSatelliteJpeg(lat, lng);
  const ping: LocationPing = {
    id: crypto.randomUUID(),
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    lat,
    lng,
    accuracy,
    slot: plantSlotKey(),
    recordedAt: new Date().toISOString(),
    mapUrl: mapsSatelliteUrl(lat, lng),
    satelliteAttached: Boolean(jpeg),
  };
  void PLANT_TIME_ZONE_LABEL;
  return { ping, jpeg };
}

export const SATELLITE_IMAGERY_SOURCE = "Esri World Imagery";
