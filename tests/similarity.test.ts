import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreMatch, compareNames, transliterateArabic, phoneticKey, searchScore } from "../src/lib/similarity";
import { addMonths, oppositionDeadline, activeReminder } from "../src/lib/deadlines";

const r = (name: string, niceClasses: number[] = [], nameAr?: string) => ({ name, nameAr, niceClasses });
const p = (markName: string, niceClasses: number[] = [], markNameAr?: string) => ({ markName, markNameAr, niceClasses });

const cases: [string, ReturnType<typeof r>, ReturnType<typeof p>, boolean][] = [
  ["identique", r("Marjane", [35]), p("MARJANE", [35]), true],
  ["variante orthographique", r("Marjane", [35]), p("Marjan", [35]), true],
  ["phonétique", r("Kaoutar", [3]), p("Kawtar", [3]), true],
  ["phonétique ph/f", r("Pharmalys", [5]), p("Farmalis", [5]), true],
  ["arabe ↔ latin", r("Marjane", [35]), p("مرجان", [35]), true],
  ["arabe ↔ arabe", r("Atlas", [30], "أطلس"), p("اطلس", [30]), true],
  ["inclusion", r("Sidi Ali", [32]), p("Sidi Ali Premium", [32]), true],
  ["classes voisines", r("Dolce", [29]), p("Dolce", [30]), true],
  ["sans rapport", r("Marjane", [35]), p("Inwi", [38]), false],
  ["proche mais classes éloignées", r("Atlas", [30]), p("Atlax", [12]), false],
  ["noms différents", r("Kaoutar", [3]), p("Bimo", [3]), false],
];

for (const [label, right, pub, expected] of cases) {
  test(label, () => {
    const m = scoreMatch(right, pub);
    assert.equal(m.flagged, expected, `${label}: total=${m.total} name=${m.name.score.toFixed(2)} pair=${m.name.pair}`);
  });
}

test("translittération", () => {
  assert.equal(transliterateArabic("مرجان"), "mrjan");
  assert.equal(phoneticKey("Kaoutar"), phoneticKey("Kawtar"));
});

test("recherche croisée", () => {
  assert.ok(searchScore("مرجان", ["MARJANE"]) > 0.7);
  assert.equal(searchScore("marj", ["Marjane"]), 1);
});

test("délai d'opposition : 2 mois, fin de mois", () => {
  assert.equal(oppositionDeadline("2026-03-15").due, "2026-05-15");
  assert.equal(addMonths("2026-12-31", 2), "2027-02-28");
  assert.equal(activeReminder("2026-01-20", "2026-01-10"), 15);
  assert.equal(activeReminder("2026-01-12", "2026-01-10"), 7);
  assert.equal(activeReminder("2026-03-30", "2026-01-10"), null);
});
