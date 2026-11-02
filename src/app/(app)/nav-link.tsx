"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, badge }: { href: string; children: React.ReactNode; badge?: number }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${active ? "bg-primary-soft font-semibold text-primary" : "hover:bg-primary-soft/60"}`}
    >
      <span>{children}</span>
      {!!badge && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{badge}</span>}
    </Link>
  );
}
