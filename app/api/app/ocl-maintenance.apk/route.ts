import path from "path";
import { promises as fs } from "fs";
import { ANDROID_APP } from "@/lib/android-app";

export const dynamic = "force-dynamic";

export async function GET() {
  const file = path.join(process.cwd(), "data", "releases", ANDROID_APP.apkFileName);
  try {
    const bytes = await fs.readFile(file);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${ANDROID_APP.apkFileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "The technician APK is not on this plant server yet. Build android/ and copy the release APK to data/releases/ocl-maintenance.apk.",
      },
      { status: 404 }
    );
  }
}
