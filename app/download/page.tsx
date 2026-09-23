import { ANDROID_APP } from "@/lib/android-app";
import { DEPT_NAME, PLANT_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default function DownloadPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
        Technician app
      </p>
      <h1 className="font-heading mt-1 text-3xl font-semibold">Android app</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {PLANT_NAME} · {DEPT_NAME}. Portrait WebView of the plant log — not Play Store.
      </p>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-base">
        <li>On the phone, allow installs from this browser (Chrome: Settings → Install unknown apps).</li>
        <li>
          Download{" "}
          <a className="font-medium text-primary underline" href="/api/app/ocl-maintenance.apk">
            {ANDROID_APP.apkFileName}
          </a>{" "}
          ({ANDROID_APP.displayName} {ANDROID_APP.versionName}).
        </li>
        <li>Open the file and install. Sign in with your plant account, not a shared APK password.</li>
        <li>If the log does not load, check plant Wi-Fi or mobile data, then tap Retry.</li>
      </ol>
      <p className="mt-8 text-sm text-muted-foreground">
        Later updates come from the plant server. On launch the app checks for a newer versionCode
        and installs it when an APK is hosted there.
      </p>
      <p className="mt-4">
        <a className="text-primary underline" href="/login">
          Back to sign in
        </a>
      </p>
    </main>
  );
}
