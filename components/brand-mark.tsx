"use client";

import { PLANT_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/adani-mark.png"
      alt={PLANT_NAME}
      width={size}
      height={size}
      className={cn("rounded-lg object-cover", className)}
    />
  );
}
