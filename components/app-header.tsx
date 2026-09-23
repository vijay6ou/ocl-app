"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/lib/types";

const BASE_LINKS = [
  { href: "/days", label: "Plant sections" },
  { href: "/history", label: "Records" },
];

function NavLinks({
  links,
  pathname,
  onClick,
}: {
  links: { href: string; label: string }[];
  pathname: string;
  onClick?: () => void;
}) {
  return (
    <>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onClick}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white",
            pathname === link.href || pathname.startsWith(`${link.href}/`)
              ? "bg-white/15 text-white"
              : ""
          )}
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

export function AppHeader({ initialUser }: { initialUser?: PublicUser | null }) {
  const auth = useAuth();
  const user = auth.user ?? initialUser ?? null;
  const pathname = usePathname();
  if (!user) return null;

  const links = [
    ...BASE_LINKS,
    ...(user.role === "admin"
      ? [
          { href: "/admin/catalogue", label: "Catalogue" },
          { href: "/admin/people", label: "People" },
        ]
      : []),
    { href: "/update", label: "Update" },
  ];

  return (
    <header className="app-shell sticky top-0 z-40 border-b border-white/10 bg-[oklch(0.28_0.06_155)] text-white print:hidden">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/days" className="flex min-w-0 items-center gap-2">
          <BrandMark size={32} className="size-8 rounded-lg" />
          <span className="min-w-0">
            <span className="block truncate font-heading text-sm font-semibold tracking-wide">
              ADANI CEMENTS
            </span>
            <span className="block truncate text-[11px] text-white/70">
              Electrical maintenance
            </span>
          </span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          <NavLinks links={links} pathname={pathname} />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-tight">{user.name}</div>
            <div className="text-[11px] text-white/70">
              {user.role === "admin" ? "Admin" : "Technician"} · {user.username}
            </div>
          </div>
          <form action="/api/auth/logout" method="post" className="hidden sm:block">
            <button
              type="submit"
              className="inline-flex h-7 items-center rounded-lg border border-white/30 px-2.5 text-sm text-white hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10 md:hidden"
                />
              }
            >
              <Menu className="size-5" />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="bg-[oklch(0.28_0.06_155)] text-white">
              <SheetHeader>
                <SheetTitle className="text-white">
                  {user.name}
                  <span className="mt-1 block text-sm font-normal text-white/70">
                    {user.role === "admin" ? "Admin" : "Technician"} · {user.username}
                  </span>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-1">
                <NavLinks links={links} pathname={pathname} />
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="mt-4 inline-flex h-8 w-full items-center justify-center rounded-lg border border-white/30 px-2.5 text-sm text-white"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
