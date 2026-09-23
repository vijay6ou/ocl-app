import path from "path";
import { promises as fs } from "fs";
import { ANDROID_APP } from "@/lib/android-app";

export const dynamic = "force-dynamic";

function apkPath() {
  return path.join(process.cwd(), "data", "releases", ANDROID_APP.apkFileName);
}

function originFrom(req: Request) {
  const url = new URL(req.url);
  let host = req.headers.get("host") ?? url.host;
  if (host.startsWith("0.0.0.0")) host = `127.0.0.1${host.slice("0.0.0.0".length)}`;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "") ?? "http";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const origin = originFrom(req);
  let apkBytes: number | null = null;
  try {
    const st = await fs.stat(apkPath());
    apkBytes = st.size;
  } catch {
    apkBytes = null;
  }
  return Response.json({
    versionCode: ANDROID_APP.versionCode,
    versionName: ANDROID_APP.versionName,
    url: `${origin}/api/app/ocl-maintenance.apk`,
    notes: ANDROID_APP.notes,
    apkAvailable: apkBytes !== null,
    apkBytes,
    server: "Plant server",
  });
}
