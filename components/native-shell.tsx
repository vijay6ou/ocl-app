"use client";

import { useEffect } from "react";
import { isOclNative } from "@/lib/print-native";

export function NativeShell() {
  useEffect(() => {
    const native =
      isOclNative() ||
      (typeof navigator !== "undefined" && /OCLMaintenance\//.test(navigator.userAgent));
    if (!native) return;
    document.documentElement.classList.add("ocl-native");
  }, []);
  return null;
}
