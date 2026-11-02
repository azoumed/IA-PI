import type { T } from "@/lib/i18n";
import { activeReminder, daysUntil } from "@/lib/deadlines";
import { Badge } from "./ui";

export function RemainingBadge({ due, t, done }: { due: string; t: T; done?: boolean }) {
  if (done) return <Badge tone="green">✓</Badge>;
  const left = daysUntil(due);
  if (left < 0) return <Badge tone="red">{t("common.overdue", { n: -left })}</Badge>;
  const r = activeReminder(due);
  const tone = r === 7 ? "red" : r === 15 ? "orange" : r === 30 ? "blue" : "gray";
  return <Badge tone={tone}>{t("common.dayLeft", { n: left })}</Badge>;
}

export function RunStatusBadge({ status, t }: { status: "running" | "success" | "partial" | "error"; t: T }) {
  const tone = status === "success" ? "green" : status === "error" ? "red" : status === "partial" ? "orange" : "blue";
  return <Badge tone={tone}>{t(`run.status.${status}`)}</Badge>;
}

export function AlertStatusBadge({ status, t }: { status: "new" | "validated" | "dismissed" | "done"; t: T }) {
  const tone = status === "new" ? "red" : status === "validated" ? "orange" : status === "done" ? "green" : "gray";
  return <Badge tone={tone}>{t(`alerts.status.${status}`)}</Badge>;
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  return <Badge tone={pct >= 85 ? "red" : pct >= 72 ? "orange" : "gray"}>{pct} %</Badge>;
}
