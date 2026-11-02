/**
 * Moteur de similarité des marques (cahier des charges §4) :
 * - recherche en arabe et en français, avec différentes graphies et prononciations ;
 * - comparaison visuelle (orthographe), phonétique et par squelette consonantique ;
 * - comparaison des produits et services via les classes de Nice.
 * Le résultat est un signal soumis à examen juridique, jamais un constat d'atteinte.
 */

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

const AR_TO_LATIN: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ٱ": "a", "ء": "", "ئ": "i", "ؤ": "ou",
  "ب": "b", "ت": "t", "ث": "t", "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "d",
  "ر": "r", "ز": "z", "س": "s", "ش": "ch", "ص": "s", "ض": "d", "ط": "t", "ظ": "z",
  "ع": "a", "غ": "gh", "ف": "f", "ق": "k", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "ة": "a", "و": "ou", "ي": "i", "ى": "a", "پ": "p", "ڤ": "v", "ڥ": "v", "گ": "g", "ݣ": "g", "چ": "ch",
};

const ARABIC_RE = /[؀-ۿ]/;

export function hasArabic(s: string) {
  return ARABIC_RE.test(s);
}

/** Normalisation de l'arabe : sans voyelles brèves, formes d'alif unifiées, ة→ه, ى→ي. */
export function normalizeArabic(s: string) {
  return s
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^ء-ي\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function transliterateArabic(s: string) {
  const n = s.replace(ARABIC_DIACRITICS, "");
  let out = "";
  for (const ch of n) out += AR_TO_LATIN[ch] ?? (ARABIC_RE.test(ch) ? "" : ch);
  // l'article « al » et les « ou » successifs
  return out.replace(/ouou/g, "ou").toLowerCase();
}

/** Normalisation latine : minuscules, sans accents ni ponctuation, chiffres conservés. */
export function normalizeLatin(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(["sarl", "sa", "sas", "ste", "societe", "group", "groupe", "the", "le", "la", "les", "de", "du", "des", "et", "al", "el"]);

/** Clé phonétique simplifiée (prononciations françaises et maghrébines courantes). */
export function phoneticKey(s: string) {
  let w = normalizeLatin(s)
    .split(" ")
    .filter((x) => x && !STOP_WORDS.has(x))
    .join("");
  const rules: [RegExp, string][] = [
    [/sch/g, "ch"], [/sh/g, "ch"], [/ph/g, "f"], [/th/g, "t"], [/kh/g, "k"], [/gh/g, "g"],
    [/ck/g, "k"], [/qu/g, "k"], [/q/g, "k"], [/c(?=[eiy])/g, "s"], [/c/g, "k"],
    [/x/g, "ks"], [/z/g, "s"], [/w/g, "ou"], [/y/g, "i"],
    [/eau/g, "o"], [/au/g, "o"], [/oo/g, "ou"], [/ou/g, "u"], [/(ai|ei|ay|ey)/g, "e"],
    [/ee/g, "i"], [/h/g, ""], [/([a-z])\1+/g, "$1"], [/e$/g, ""],
  ];
  for (const [re, rep] of rules) w = w.replace(re, rep);
  return w;
}

/** Squelette consonantique : robuste aux voyelles absentes de l'arabe translittéré. */
export function skeleton(s: string) {
  return phoneticKey(s).replace(/[aeiou]/g, "");
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function levRatio(a: string, b: string) {
  if (!a && !b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function trigrams(s: string) {
  const p = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
  return set;
}

export function dice(a: string, b: string) {
  if (!a || !b) return 0;
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** Toutes les formes latines comparables d'un nom (latin + translittération de l'arabe). */
export function latinVariants(...names: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const n of names) {
    if (!n) continue;
    if (hasArabic(n)) {
      const tr = transliterateArabic(n);
      if (tr.trim()) out.add(normalizeLatin(tr));
      const latinPart = n.replace(/[؀-ۿ]/g, " ");
      if (normalizeLatin(latinPart)) out.add(normalizeLatin(latinPart));
    } else {
      const v = normalizeLatin(n);
      if (v) out.add(v);
    }
  }
  return [...out];
}

export function arabicVariants(...names: (string | null | undefined)[]) {
  return names.filter((n): n is string => !!n && hasArabic(n)).map(normalizeArabic).filter(Boolean);
}

export type NameMatch = {
  score: number;
  visual: number;
  phonetic: number;
  skeleton: number;
  containment: boolean;
  arabic: number;
  pair: [string, string];
};

export function compareNames(
  a: { name?: string | null; nameAr?: string | null },
  b: { name?: string | null; nameAr?: string | null },
): NameMatch {
  const la = latinVariants(a.name, a.nameAr);
  const lb = latinVariants(b.name, b.nameAr);
  let best: NameMatch = { score: 0, visual: 0, phonetic: 0, skeleton: 0, containment: false, arabic: 0, pair: ["", ""] };

  for (const x of la) {
    for (const y of lb) {
      const xs = x.replace(/ /g, "");
      const ys = y.replace(/ /g, "");
      const visual = Math.max(levRatio(xs, ys), dice(x, y));
      const px = phoneticKey(x);
      const py = phoneticKey(y);
      const phonetic = px && py ? levRatio(px, py) : 0;
      const sx = skeleton(x);
      const sy = skeleton(y);
      const skel = sx.length >= 2 && sy.length >= 2 ? levRatio(sx, sy) : 0;
      const short = xs.length <= ys.length ? xs : ys;
      const long = xs.length <= ys.length ? ys : xs;
      const containment = short.length >= 4 && long.includes(short);
      let score = Math.max(visual, phonetic * 0.97, skel * 0.9);
      if (containment) score = Math.max(score, 0.82);
      if (score > best.score) best = { score, visual, phonetic, skeleton: skel, containment, arabic: 0, pair: [x, y] };
    }
  }

  const aa = arabicVariants(a.name, a.nameAr);
  const ab = arabicVariants(b.name, b.nameAr);
  for (const x of aa) {
    for (const y of ab) {
      const r = levRatio(x.replace(/ /g, ""), y.replace(/ /g, ""));
      if (r > best.score) best = { ...best, score: r, arabic: r, pair: [x, y] };
      else if (r > best.arabic) best = { ...best, arabic: r };
    }
  }
  return best;
}

/** Classes de Nice voisines (produits/services souvent jugés similaires). */
const RELATED_CLASSES: number[][] = [
  [3, 5, 44], [5, 10, 44], [9, 38, 42], [16, 35, 41], [25, 18, 14, 26], [29, 30, 31, 32, 43],
  [30, 43], [32, 33], [35, 36], [37, 19, 6], [39, 12], [41, 9, 38], [43, 29, 30],
];

export function compareClasses(a: number[], b: number[]) {
  if (!a.length || !b.length) return { score: 0.5, common: [] as number[], related: false, unknown: true };
  const common = a.filter((c) => b.includes(c));
  if (common.length) return { score: 1, common, related: false, unknown: false };
  const related = RELATED_CLASSES.some((g) => a.some((c) => g.includes(c)) && b.some((c) => g.includes(c)));
  return { score: related ? 0.55 : 0, common, related, unknown: false };
}

export type MatchResult = {
  total: number;
  name: NameMatch;
  classes: ReturnType<typeof compareClasses>;
  flagged: boolean;
};

export const NAME_THRESHOLD = 0.72;
export const TOTAL_THRESHOLD = 0.66;

export function scoreMatch(
  right: { name: string; nameAr?: string | null; niceClasses: number[] },
  pub: { markName: string; markNameAr?: string | null; niceClasses: number[] },
): MatchResult {
  const name = compareNames(right, { name: pub.markName, nameAr: pub.markNameAr });
  const classes = compareClasses(right.niceClasses, pub.niceClasses);
  const total = Math.round((0.7 * name.score + 0.3 * classes.score) * 1000) / 1000;
  // Un nom quasi identique est signalé même sans recoupement de classes (marque renommée, art. 137).
  const flagged = (name.score >= NAME_THRESHOLD && total >= TOTAL_THRESHOLD) || name.score >= 0.93;
  return { total, name, classes, flagged };
}

/** Recherche plein texte tolérante (arabe/français) : renvoie un score 0..1. */
export function searchScore(query: string, fields: (string | null | undefined)[]) {
  const q = query.trim();
  if (!q) return 1;
  let best = 0;
  const qn = hasArabic(q) ? normalizeArabic(q) : normalizeLatin(q);
  for (const f of fields) {
    if (!f) continue;
    const fn = hasArabic(f) && hasArabic(q) ? normalizeArabic(f) : normalizeLatin(hasArabic(f) ? transliterateArabic(f) : f);
    if (fn.includes(qn)) return 1;
  }
  for (const f of fields) {
    if (!f) continue;
    best = Math.max(best, compareNames({ name: q }, { name: f }).score);
  }
  return best;
}
