import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { hasApiKey } from "@/lib/agent/claude";
import { Card, PageTitle } from "@/components/ui";
import { Chat } from "./chat";

export default async function AssistantPage() {
  await requireUser();
  const { t } = await getI18n();
  return (
    <>
      <PageTitle>{t("assistant.title")}</PageTitle>
      <p className="-mt-3 mb-4 text-sm text-muted">{t("assistant.intro")}</p>
      {!hasApiKey() && <p className="mb-4 rounded-md bg-warning/15 p-2 text-sm text-warning">{t("assistant.noKey")}</p>}
      <Card>
        <Chat
          labels={{
            placeholder: t("assistant.placeholder"),
            send: t("assistant.send"),
            thinking: t("assistant.thinking"),
            noKey: t("assistant.noKey"),
            error: t("assistant.error"),
          }}
        />
      </Card>
    </>
  );
}
