import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { RightForm } from "@/components/right-form";
import { Card, PageTitle } from "@/components/ui";

export default async function NewRight({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireUser();
  const { t } = await getI18n();
  const { client } = await searchParams;
  const [clientsList, usersList] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)),
  ]);
  return (
    <>
      <PageTitle>{t("rights.new")}</PageTitle>
      <Card><RightForm clientsList={clientsList} usersList={usersList} defaultClientId={client ? Number(client) : undefined} t={t} /></Card>
    </>
  );
}
