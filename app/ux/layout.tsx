"use client";

import type { ReactNode } from "react";
import { UxProvider } from "@/components/ux/store";
import { UxChrome } from "@/components/ux/chrome";

export default function UxLayout({ children }: { children: ReactNode }) {
  return (
    <UxProvider>
      <UxChrome>{children}</UxChrome>
    </UxProvider>
  );
}
