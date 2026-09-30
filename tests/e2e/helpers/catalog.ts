import type { Page } from "@playwright/test";

type Mechanism = "elision" | "reduction" | "coalescence";

function card(rank: number, text: string, pattern: string, ipa: string, mechanism: Mechanism) {
  return {
    id: `fixture-atom-${rank}`,
    text,
    sourceType: "catalog" as const,
    analysis: {
      kind: "atom" as const,
      rank,
      pattern,
      ipa,
      searchQuery: text,
      alternateQuery: null,
      mechanisms: [mechanism],
    },
  };
}

/** A small, deterministic catalog. CI has an empty D1, so Library journeys must not depend on seeded rows. */
export const catalogFixture = [
  card(1, "tell him", "[tell him]", "tɛlɪm", "elision"),
  card(2, "a couple of", "a [couple of]", "əkʌplə", "elision"),
  card(3, "probably", "[probably]", "prɑbli", "elision"),
  card(4, "I can see", "I [can see]", "aɪkənsiː", "reduction"),
  card(5, "it was there", "it [was there]", "ɪtwəzðɛr", "reduction"),
  card(6, "did you", "[did you]", "dɪdʒə", "coalescence"),
];

export async function stubCatalog(page: Page) {
  await page.route("**/api/catalog", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ cards: catalogFixture, formats: {}, mechanisms: {} }),
  }));
}
