import { plantSlotKey, PLANT_TIME_ZONE_LABEL } from "@/lib/submit-time";
import type { LocationPing, PublicUser } from "@/lib/types";

const APP_UA = "OCLMaintenance/1.10.0";

function locationWebhook() {
  return (process.env.LOCATION_DISCORD_WEBHOOK_URL ?? "").trim();
}

function mapsKey() {
  return (process.env.GOOGLE_MAPS_STATIC_KEY ?? "").trim();
}

export function mapsSatelliteUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}&t=k`;
}

export function formatLocationDiscord(ping: LocationPing) {
  const acc =
    ping.accuracy != null && Number.isFinite(ping.accuracy)
      ? `${Math.round(ping.accuracy)} m`
      : "unknown";
  const snap = ping.satelliteAttached
    ? "Satellite snapshot attached."
    : "Satellite snapshot not attached (Maps key not set on the plant server). Open the map link.";
  return [
    `Location check-in · ${ping.slot}`,
    `${ping.name} (${ping.username})`,
    `Lat ${ping.lat.toFixed(6)}  Lng ${ping.lng.toFixed(6)}  ±${acc}`,
    `Map (satellite): ${ping.mapUrl}`,
    snap,
  ].join("\n");
}

async function fetchSatelliteJpeg(lat: number, lng: number): Promise<Buffer | null> {
  const key = mapsKey();
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("center", `${lat},${lng}`);
  url.searchParams.set("zoom", "18");
  url.searchParams.set("size", "640x420");
  url.searchParams.set("maptype", "satellite");
  url.searchParams.set("markers", `color:red|${lat},${lng}`);
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url.toString(), { headers: { "User-Agent": APP_UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200 || buf.length > 7_500_000) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function notifyLocationDiscord(ping: LocationPing, jpeg: Buffer | null) {
  const hook = locationWebhook();
  if (!hook) return { status: "skipped" as const, attached: false };
  const form = new FormData();
  const payload = {
    username: "Adani Cements location",
    content: formatLocationDiscord({ ...ping, satelliteAttached: Boolean(jpeg) }).slice(0, 1900),
  };
  form.append("payload_json", JSON.stringify(payload));
  if (jpeg) {
    form.append("files[0]", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "satellite.jpg");
  }
  const url = new URL(hook);
  url.searchParams.set("wait", "true");
  const res = await fetch(url.toString(), {
    method: "POST",
    body: form,
    headers: { "User-Agent": APP_UA },
  });
  if (!res.ok) return { status: "failed" as const, attached: Boolean(jpeg) };
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

export function mapsKeyConfigured() {
  return Boolean(mapsKey());
}
