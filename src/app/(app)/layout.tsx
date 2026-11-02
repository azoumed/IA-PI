import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { logout } from "@/app/actions";
import { LangToggle } from "@/components/lang-toggle";
import { NavLink } from "./nav-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const [{ n }] = await db.select({ n: count() }).from(alerts).where(eq(alerts.status, "new"));
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-e">
        <div className="flex items-center justify-between gap-2 p-4">
          <div>
            <div className="font-bold text-primary">{t("app.name")}</div>
            <div className="text-xs text-muted">{user.name}</div>
          </div>
          <LangToggle locale={locale} label={t("lang.switch")} />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          <NavLink href="/">{t("nav.dashboard")}</NavLink>
          <NavLink href="/alertes" badge={n}>{t("nav.alerts")}</NavLink>
          <NavLink href="/delais">{t("nav.deadlines")}</NavLink>
          <NavLink href="/clients">{t("nav.clients")}</NavLink>
          <NavLink href="/droits">{t("nav.rights")}</NavLink>
          <NavLink href="/veille">{t("nav.watch")}</NavLink>
          <NavLink href="/assistant">{t("nav.assistant")}</NavLink>
          <NavLink href="/journal">{t("nav.journal")}</NavLink>
          {user.role === "admin" && <NavLink href="/utilisateurs">{t("nav.users")}</NavLink>}
          <form action={logout} className="md:mt-4">
            <button className="w-full whitespace-nowrap rounded-md px-3 py-2 text-start text-sm text-muted hover:bg-primary-soft/60">{t("nav.logout")}</button>
          </form>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
