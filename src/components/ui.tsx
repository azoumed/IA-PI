import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{children}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-4 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const variants = {
  primary: "bg-primary text-white hover:opacity-90",
  secondary: "border border-border bg-surface hover:bg-primary-soft",
  danger: "border border-danger text-danger hover:bg-danger hover:text-white",
  ghost: "text-primary hover:underline",
};

export function Button({ variant = "primary", className = "", ...p }: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return <button className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${variants[variant]} ${className}`} {...p} />;
}

export function LinkButton({ variant = "primary", className = "", ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return <Link className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${variants[variant]} ${className}`} {...p} />;
}

const tones = {
  gray: "bg-border/60 text-foreground",
  blue: "bg-primary-soft text-primary",
  red: "bg-danger/15 text-danger",
  orange: "bg-warning/15 text-warning",
  green: "bg-success/15 text-success",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Stat({ label, value, href, tone }: { label: string; value: ReactNode; href?: string; tone?: "red" | "orange" }) {
  const body = (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm hover:border-primary">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tone === "red" ? "text-danger" : tone === "orange" ? "text-warning" : ""}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4">{children}</div>;
}
