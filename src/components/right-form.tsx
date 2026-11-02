import type { Client, Right, User } from "@/db/schema";
import type { T } from "@/lib/i18n";
import { saveRight } from "@/app/actions";
import { Button, Field } from "./ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-primary">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function RightForm({
  right,
  clientsList,
  usersList,
  defaultClientId,
  t,
}: {
  right?: Right;
  clientsList: Pick<Client, "id" | "name">[];
  usersList: Pick<User, "id" | "name">[];
  defaultClientId?: number;
  t: T;
}) {
  const r = right;
  return (
    <form action={saveRight} className="flex flex-col gap-4">
      {r && <input type="hidden" name="id" value={r.id} />}

      <Section title={t("rights.section.identification")}>
        <Field label={t("rights.client")}>
          <select name="clientId" required defaultValue={r?.clientId ?? defaultClientId ?? ""}>
            <option value="" disabled>—</option>
            {clientsList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t("rights.type")}>
          <select name="type" defaultValue={r?.type ?? "marque"}>
            <option value="marque">{t("rights.type.marque")}</option>
            <option value="brevet">{t("rights.type.brevet")}</option>
            <option value="dessin">{t("rights.type.dessin")}</option>
          </select>
        </Field>
        <Field label={t("rights.holder")}><input name="holder" required defaultValue={r?.holder} /></Field>
        <Field label={t("rights.holderAr")}><input name="holderAr" dir="rtl" lang="ar" defaultValue={r?.holderAr ?? ""} /></Field>
        <Field label={t("rights.applicationNumber")}><input name="applicationNumber" dir="ltr" defaultValue={r?.applicationNumber ?? ""} /></Field>
        <Field label={t("rights.registrationNumber")}><input name="registrationNumber" dir="ltr" defaultValue={r?.registrationNumber ?? ""} /></Field>
      </Section>

      <Section title={t("rights.section.scope")}>
        <Field label={t("rights.name")}><input name="name" required defaultValue={r?.name} /></Field>
        <Field label={t("rights.nameAr")}><input name="nameAr" dir="rtl" lang="ar" defaultValue={r?.nameAr ?? ""} /></Field>
        <Field label={t("rights.country")}><input name="country" defaultValue={r?.country ?? "MA"} /></Field>
        <Field label={t("rights.niceClasses")}><input name="niceClasses" dir="ltr" defaultValue={r?.niceClasses.join(", ") ?? ""} /></Field>
        <Field label={t("rights.image")} className="sm:col-span-2"><input name="imageUrl" type="url" dir="ltr" defaultValue={r?.imageUrl ?? ""} /></Field>
        <Field label={t("rights.goodsServices")} className="sm:col-span-2"><textarea name="goodsServices" rows={3} defaultValue={r?.goodsServices ?? ""} /></Field>
      </Section>

      <Section title={t("rights.section.dates")}>
        <Field label={t("rights.filingDate")}><input type="date" name="filingDate" defaultValue={r?.filingDate ?? ""} /></Field>
        <Field label={t("rights.priorityDate")}><input type="date" name="priorityDate" defaultValue={r?.priorityDate ?? ""} /></Field>
        <Field label={t("rights.publicationDate")}><input type="date" name="publicationDate" defaultValue={r?.publicationDate ?? ""} /></Field>
        <Field label={t("rights.registrationDate")}><input type="date" name="registrationDate" defaultValue={r?.registrationDate ?? ""} /></Field>
        <Field label={t("rights.expiryDate")}><input type="date" name="expiryDate" defaultValue={r?.expiryDate ?? ""} /></Field>
      </Section>

      <Section title={t("rights.section.followup")}>
        <Field label={t("rights.status")}><input name="status" defaultValue={r?.status ?? "déposée"} list="status-list" /></Field>
        <datalist id="status-list">
          {["déposée", "publiée", "en opposition", "enregistrée", "renouvelée", "rejetée", "radiée", "expirée"].map((s) => <option key={s} value={s} />)}
        </datalist>
        <Field label={t("rights.responsible")}>
          <select name="responsibleId" defaultValue={r?.responsibleId ?? ""}>
            <option value="">—</option>
            {usersList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label={t("rights.nextAction")} className="sm:col-span-2"><input name="nextAction" defaultValue={r?.nextAction ?? ""} /></Field>
        <Field label={t("common.notes")} className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={r?.notes ?? ""} /></Field>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="watch" defaultChecked={r?.watch ?? true} /> {t("rights.watch")}
        </label>
      </Section>

      <Section title={t("rights.section.proof")}>
        <Field label={t("rights.sourceUrl")} className="sm:col-span-2"><input name="sourceUrl" type="url" dir="ltr" defaultValue={r?.sourceUrl ?? ""} /></Field>
        <Field label={t("rights.catalogRef")}><input name="catalogRef" dir="ltr" defaultValue={r?.catalogRef ?? ""} /></Field>
        <Field label={t("rights.catalogPage")}><input name="catalogPage" type="number" min={1} defaultValue={r?.catalogPage ?? ""} /></Field>
        <Field label={t("rights.lastVerified")}><input type="date" name="lastVerifiedAt" defaultValue={r?.lastVerifiedAt ?? ""} /></Field>
      </Section>

      <p className="text-xs text-muted">{t("rights.notice.dates")}</p>
      <div><Button>{t("common.save")}</Button></div>
    </form>
  );
}
