import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { ClientForm } from "@/components/client-form";
import { Card, PageTitle } from "@/components/ui";

export default async function NewClient() {
  await requireUser();
  const { t } = await getI18n();
  return (
    <>
      <PageTitle>{t("clients.new")}</PageTitle>
      <Card><ClientForm t={t} /></Card>
    </>
  );
}
