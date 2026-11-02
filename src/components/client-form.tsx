import type { Client } from "@/db/schema";
import type { T } from "@/lib/i18n";
import { saveClient } from "@/app/actions";
import { Button, Field } from "./ui";

export function ClientForm({ client, t }: { client?: Client; t: T }) {
  return (
    <form action={saveClient} className="grid gap-3 sm:grid-cols-2">
      {client && <input type="hidden" name="id" value={client.id} />}
      <Field label={t("clients.name")}><input name="name" required defaultValue={client?.name} /></Field>
      <Field label={t("clients.nameAr")}><input name="nameAr" dir="rtl" lang="ar" defaultValue={client?.nameAr ?? ""} /></Field>
      <Field label={t("clients.email")}><input name="email" type="email" dir="ltr" defaultValue={client?.email ?? ""} /></Field>
      <Field label={t("clients.phone")}><input name="phone" dir="ltr" defaultValue={client?.phone ?? ""} /></Field>
      <Field label={t("clients.rc")}><input name="rcNumber" dir="ltr" defaultValue={client?.rcNumber ?? ""} /></Field>
      <Field label={t("common.notes")} className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={client?.notes ?? ""} /></Field>
      <div className="sm:col-span-2"><Button>{t("common.save")}</Button></div>
    </form>
  );
}
