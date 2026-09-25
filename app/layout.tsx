import type { Metadata } from "next";
import { Barlow_Condensed, Outfit } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
import { AppHeader } from "@/components/app-header";
import { NativeShell } from "@/components/native-shell";
import { LocationPing } from "@/components/location-ping";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const condensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Adani Cements Weekly Electrical Maintenance",
  description:
    "Adani Cements electrical weekly PM — cloud-backed technician log for Chittapur.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${condensed.variable} light h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <TooltipProvider>
            <AuthProvider initialUser={user}>
            <AppHeader initialUser={user} />
            <NativeShell />
            <LocationPing />
            {children}
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
