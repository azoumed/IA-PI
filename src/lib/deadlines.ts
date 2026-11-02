/**
 * Règles de calcul des délais. Tout délai calculé reste « à confirmer » tant que
 * l'avocat n'a pas vérifié les documents et notifications (cahier des charges §5).
 */

export const OPPOSITION_RULE = {
  months: 2,
  legalBasis:
    "Loi n° 17-97 relative à la protection de la propriété industrielle (telle que modifiée), art. 148-2 : opposition dans un délai de deux mois à compter de la publication de la demande d'enregistrement.",
  legalBasisAr:
    "القانون رقم 17-97 المتعلق بحماية الملكية الصناعية (كما تم تغييره)، المادة 148-2: التعرض داخل أجل شهرين من تاريخ نشر طلب التسجيل.",
};

export const RENEWAL_RULE = {
  years: 10,
  legalBasis:
    "Loi n° 17-97, art. 152 : l'enregistrement de la marque produit ses effets pour dix ans à compter de la date de dépôt, renouvelable.",
  legalBasisAr: "القانون رقم 17-97، المادة 152: يسري مفعول تسجيل العلامة لمدة عشر سنوات ابتداء من تاريخ الإيداع، قابلة للتجديد.",
};

/** Rappels internes proposés par le cabinet, distincts du délai légal. */
export const INTERNAL_REMINDERS = [30, 15, 7] as const;

export function toISO(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(s: string) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Ajoute des mois en restant sur la même date ou, à défaut, sur le dernier jour du mois. */
export function addMonths(iso: string, months: number) {
  const d = parseISO(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toISO(target);
}

export function addYears(iso: string, years: number) {
  return addMonths(iso, years * 12);
}

export function todayISO() {
  return toISO(new Date());
}

export function daysUntil(iso: string, from = todayISO()) {
  return Math.round((parseISO(iso).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export function oppositionDeadline(publicationDate: string) {
  return { start: publicationDate, due: addMonths(publicationDate, OPPOSITION_RULE.months) };
}

/** Rappel interne actif (30, 15 ou 7) pour un délai, ou null. */
export function activeReminder(dueISO: string, from = todayISO()) {
  const left = daysUntil(dueISO, from);
  if (left < 0) return null;
  for (const r of [...INTERNAL_REMINDERS].reverse()) if (left <= r) return r;
  return null;
}
