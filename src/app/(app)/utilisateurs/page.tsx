import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { saveUser } from "@/app/actions";
import { Button, Card, Field, PageTitle } from "@/components/ui";

const ROLES = ["admin", "avocat", "assistant"] as const;

export default async function UsersPage() {
  const me = await requireUser(["admin"]);
  const { t } = await getI18n();
  const list = await db.select().from(users).orderBy(asc(users.name));
  return (
    <>
      <PageTitle>{t("users.title")}</PageTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((u) => (
          <Card key={u.id} title={<span>{u.name} <span className="text-sm font-normal text-muted" dir="ltr">{u.email}</span></span>}>
            <form action={saveUser} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={u.id} />
              <Field label={t("users.name")}><input name="name" defaultValue={u.name} required /></Field>
              <Field label={t("users.role")}>
                <select name="role" defaultValue={u.role}>{ROLES.map((r) => <option key={r} value={r}>{t(`users.role.${r}`)}</option>)}</select>
              </Field>
              <Field label={t("users.locale")}>
                <select name="locale" defaultValue={u.locale}><option value="fr">Français</option><option value="ar">العربية</option></select>
              </Field>
              <Field label={t("login.password")}><input name="password" type="password" autoComplete="new-password" minLength={10} /></Field>
              <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={u.active} disabled={u.id === me.id} /> {t("users.active")}</label>
              <div className="sm:col-span-2"><Button>{t("common.save")}</Button></div>
            </form>
          </Card>
        ))}
        <Card title={t("users.new")}>
          <form action={saveUser} className="grid gap-3 sm:grid-cols-2">
            <Field label={t("users.name")}><input name="name" required /></Field>
            <Field label={t("login.email")}><input name="email" type="email" required dir="ltr" /></Field>
            <Field label={t("users.role")}>
              <select name="role" defaultValue="avocat">{ROLES.map((r) => <option key={r} value={r}>{t(`users.role.${r}`)}</option>)}</select>
            </Field>
            <Field label={t("users.locale")}>
              <select name="locale" defaultValue="fr"><option value="fr">Français</option><option value="ar">العربية</option></select>
            </Field>
            <Field label={t("login.password")} className="sm:col-span-2"><input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
            <div className="sm:col-span-2"><Button>{t("common.add")}</Button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
