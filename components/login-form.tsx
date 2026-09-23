import { BrandMark } from "@/components/brand-mark";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DEPT_NAME, PLANT_NAME } from "@/lib/constants";
import { sanitizePublicText } from "@/lib/public-text";

export function LoginForm({
  error,
  nextPath,
}: {
  error?: string | null;
  nextPath?: string | null;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_20%_-10%,oklch(0.55_0.1_155/_0.35),transparent_55%),radial-gradient(900px_circle_at_100%_100%,oklch(0.78_0.12_95/_0.28),transparent_45%),linear-gradient(180deg,oklch(0.28_0.06_155),oklch(0.22_0.04_155))]" />
      <Card className="relative w-full max-w-md border-white/20 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur">
        <CardHeader className="items-center gap-3 text-center">
          <BrandMark size={56} className="size-14 rounded-2xl shadow-md" />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Weekly electrical PM
            </p>
            <h1 className="font-heading mt-1 text-2xl font-semibold tracking-wide">
              {PLANT_NAME.toUpperCase()}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{DEPT_NAME}</p>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" method="post" action="/api/auth/login">
            {nextPath && nextPath.startsWith("/") ? (
              <input type="hidden" name="next" value={nextPath} />
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="Your plant account"
                required
                className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {sanitizePublicText(error, "Sign-in failed.")}
              </p>
            ) : null}
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-2.5 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Sign in
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Authorised electrical staff only
          </p>
          <p className="mt-2 text-center text-xs">
            <a className="font-medium text-primary underline-offset-4 hover:underline" href="/download">
              Technician Android app
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
