import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { LangToggle } from "@/components/lang-toggle";
import { LoginForm } from "./form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const { t, locale } = await getI18n();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-primary">{t("app.name")}</h1>
            <p className="mt-1 text-sm text-muted">{t("app.tagline")}</p>
          </div>
          <LangToggle locale={locale} label={t("lang.switch")} anonymous />
        </div>
        <h2 className="mb-4 font-semibold">{t("login.title")}</h2>
        <LoginForm labels={{ email: t("login.email"), password: t("login.password"), submit: t("login.submit"), error: t("login.error") }} />
      </div>
    </main>
  );
}
