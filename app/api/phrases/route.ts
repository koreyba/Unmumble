import { getD1 } from "@/db";
import { getCurrentUser, LEGACY_OWNER_EMAIL, unauthorizedResponse } from "@/lib/auth";
import { mapPhraseRows, type CatalogJoinedRow } from "@/lib/catalog/catalog-api";
import {
  createVocabularyRepository,
  VocabularyRepositoryError,
  VOCABULARY_LEGACY_MEANING_ID,
} from "@/lib/vocabulary/repository";
import { createVocabularyMutationPlanner } from "@/lib/vocabulary/mutations";
import { DeepLError, translateEnglishToNativeLanguage } from "@/lib/deepl";

export const dynamic = "force-dynamic";

const statuses = new Set(["pick", "to_learn", "learning_now", "learnt"]);
type PhraseStatus = "pick" | "to_learn" | "learning_now" | "learnt";

type EmbeddedExampleRow = {
  example_id: string | null;
  example_phrase_id: string | null;
  example_provider: "youglish" | "tatoeba" | null;
  example_external_id: string | null;
  example_query: string | null;
  example_caption: string | null;
  example_accent: string | null;
  example_metadata: string | null;
  example_created_at: string | null;
};

type ExampleMetadata = {
  sentenceId?: string;
  author?: string;
  license?: string;
  attributionUrl?: string;
};

function parseExampleMetadata(value: string | null): ExampleMetadata {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      ...(typeof parsed.sentenceId === "string" ? { sentenceId: parsed.sentenceId } : {}),
      ...(typeof parsed.author === "string" ? { author: parsed.author } : {}),
      ...(typeof parsed.license === "string" ? { license: parsed.license } : {}),
      ...(typeof parsed.attributionUrl === "string" ? { attributionUrl: parsed.attributionUrl } : {}),
    };
  } catch {
    return {};
  }
}

function publicUser(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return null;
  return {
    id: user.subject,
    email: user.email,
    name: user.name,
    legacyStateAvailable: user.email === LEGACY_OWNER_EMAIL,
  };
}

function embeddedExamples(rows: EmbeddedExampleRow[]) {
  return rows.flatMap((row) => row.example_id && row.example_phrase_id && row.example_provider && row.example_external_id && row.example_query
    ? [{
        id: row.example_id,
        phrase_id: row.example_phrase_id,
        provider: row.example_provider,
        external_id: row.example_external_id,
        query: row.example_query,
        caption: row.example_caption || "",
        accent: row.example_accent || "",
        metadata: parseExampleMetadata(row.example_metadata),
        created_at: row.example_created_at || "",
      }]
    : []);
}

export async function backfillTranslations(userId: string, request: Request) {
  try {
    const db = getD1();
    const missing = await db.prepare(`
      SELECT p.id, p.text, p.source_type
      FROM phrases AS p
      LEFT JOIN phrase_progress AS progress
        ON progress.phrase_id = p.id AND progress.user_id = ?
      WHERE (p.source_type = 'preset' OR p.owner_id = ?)
        AND COALESCE(progress.status, 'pick') != 'pick'
        AND p.translation = ''
        AND NOT EXISTS (
          SELECT 1
          FROM phrase_meanings AS meaning
          WHERE meaning.user_id = ? AND meaning.phrase_id = p.id
        )
      ORDER BY p.updated_at ASC
    `).bind(userId, userId, userId).all<{
      id: string;
      text: string;
      source_type: "preset" | "custom";
    }>();
    if (!missing.results.length) return;

    const repository = createVocabularyRepository(db);
    for (let offset = 0; offset < missing.results.length; offset += 50) {
      const rows = missing.results.slice(offset, offset + 50);
      const translations = await translateEnglishToNativeLanguage(rows.map((row) => row.text), "", { request });
      for (const [index, row] of rows.entries()) {
        if (row.source_type === "preset") {
          await repository.addMeaning(userId, {
            phraseId: row.id,
            translation: translations[index],
          });
        } else {
          await repository.addEntry(userId, {
            text: row.text,
            translation: translations[index],
          });
        }
      }
    }
  } catch (error) {
    console.error("Phrase translation backfill failed:", error);
  }
}

async function translationForPhrase(text: string, existing = "", request?: Request) {
  if (existing) return existing;
  const [translation] = await translateEnglishToNativeLanguage([text], "", { request });
  return translation;
}

async function optionalTranslationForPhrase(text: string, existing = "", request?: Request) {
  if (existing) return { text: existing, pending: false };
  try {
    return { text: await translationForPhrase(text, "", request), pending: false };
  } catch (error) {
    if (!(error instanceof DeepLError)) throw error;
    console.warn("Translation unavailable; continuing without it:", error.message);
    return { text: existing, pending: true };
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

const catalogMetadataFields = [
  "analysis",
  "kind",
  "rank",
  "pattern",
  "ipa",
  "mechanisms",
  "searchQuery",
  "alternateQuery",
] as const;

function containsCatalogMetadata(payload: Record<string, unknown>) {
  return catalogMetadataFields.some((field) => Object.hasOwn(payload, field));
}

const phraseProjection = `
  SELECT
    p.id, p.text, p.pattern, p.ipa,
    COALESCE(NULLIF(p.translation, ''), fallback_meaning.translation, '') AS translation,
    CASE
      WHEN p.translation <> '' THEN p.context
      ELSE COALESCE(fallback_meaning.context, p.context)
    END AS context,
    p.source_type, p.catalog_order,
    COALESCE(progress.status, 'pick') AS status,
    p.created_at, p.updated_at,
    analysis.kind AS analysis_kind,
    analysis.rank AS analysis_rank,
    analysis.pattern AS analysis_pattern,
    analysis.ipa AS analysis_ipa,
    analysis.search_query AS analysis_search_query,
    analysis.alternate_query AS analysis_alternate_query,
    CASE WHEN count(mechanisms.mechanism) > 0
      THEN json_group_array(json_array(mechanisms.mechanism, mechanisms.display_order))
      ELSE '[]'
    END AS mechanisms_json
  FROM phrases AS p
  LEFT JOIN phrase_progress AS progress
    ON progress.phrase_id = p.id AND progress.user_id = ?
  LEFT JOIN phrase_meanings AS fallback_meaning
    ON fallback_meaning.id = (
      SELECT candidate.id
      FROM phrase_meanings AS candidate
      WHERE candidate.user_id = ? AND candidate.phrase_id = p.id
      ORDER BY candidate.created_at, candidate.id
      LIMIT 1
    )
  LEFT JOIN catalog_phrase_analysis AS analysis
    ON analysis.phrase_id = p.id AND analysis.active = 1
  LEFT JOIN phrase_mechanisms AS mechanisms
    ON mechanisms.phrase_id = p.id
`;

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();

  try {
    const db = getD1();
    const phraseId = cleanText(new URL(request.url).searchParams.get("id")).slice(0, 120);
    if (phraseId) {
      const result = await db.prepare(`${phraseProjection}
        WHERE p.id = ? AND (p.source_type = 'preset' OR p.owner_id = ?)
        GROUP BY p.id
      `).bind(user.subject, user.subject, phraseId, user.subject).all<CatalogJoinedRow>();
      const examples = await db.prepare(`
        SELECT
          id AS example_id,
          phrase_id AS example_phrase_id,
          provider AS example_provider,
          external_id AS example_external_id,
          query AS example_query,
          caption AS example_caption,
          accent AS example_accent,
          metadata AS example_metadata,
          created_at AS example_created_at
        FROM phrase_examples
        WHERE user_id = ? AND phrase_id = ?
        ORDER BY created_at DESC
      `).bind(user.subject, phraseId).all<EmbeddedExampleRow>();
      return Response.json({
        phrases: mapPhraseRows(result.results),
        examples: embeddedExamples(examples.results),
        user: publicUser(user),
      });
    }

    const result = await db.prepare(`${phraseProjection}
      WHERE p.source_type = 'preset' OR p.owner_id = ?
      GROUP BY p.id
      ORDER BY
        CASE WHEN COALESCE(progress.status, 'pick') = 'pick' THEN 0 ELSE 1 END,
        CASE WHEN COALESCE(progress.status, 'pick') = 'pick' THEN p.catalog_order END ASC,
        p.updated_at DESC
    `).bind(user.subject, user.subject, user.subject).all<CatalogJoinedRow>();
    const phrases = mapPhraseRows(result.results);
    const needsBackfill = phrases.some((phrase) => phrase.status !== "pick" && !phrase.translation);
    const body = JSON.stringify({ phrases, user: publicUser(user) });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    const etag = `W/"phrases-${user.subject}-${hash}"`;
    const cacheHeaders: Record<string, string> = {
      "Cache-Control": "private, no-cache",
      ETag: etag,
    };
    if (needsBackfill) {
      cacheHeaders["X-Unmumble-Backfill"] = "1";
    } else if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: cacheHeaders });
    }
    return new Response(body, {
      headers: {
        ...cacheHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load phrases.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (containsCatalogMetadata(payload)) {
      return Response.json({ error: "Catalog analysis cannot be supplied for a custom phrase." }, { status: 400 });
    }
    const text = cleanText(payload.text);
    const context = cleanText(payload.context).slice(0, 1_000);
    const suppliedTranslation = cleanText(payload.translation).slice(0, 1_000);
    if (!text) return Response.json({ error: "Enter a phrase." }, { status: 400 });
    if (text.length > 240) return Response.json({ error: "The phrase is too long." }, { status: 400 });

    const db = getD1();
    const existing = await db.prepare(`
      SELECT p.id,
             COALESCE(NULLIF(p.translation, ''), fallback_meaning.translation, '') AS translation,
             CASE
               WHEN p.translation <> '' THEN p.context
               ELSE COALESCE(fallback_meaning.context, p.context)
             END AS context,
             p.source_type,
             p.created_at, p.updated_at,
             COALESCE(progress.status, 'pick') AS status
      FROM phrases AS p
      LEFT JOIN phrase_progress AS progress
        ON progress.phrase_id = p.id AND progress.user_id = ?
      LEFT JOIN phrase_meanings AS fallback_meaning
        ON fallback_meaning.id = (
          SELECT candidate.id
          FROM phrase_meanings AS candidate
          WHERE candidate.user_id = ? AND candidate.phrase_id = p.id
          ORDER BY candidate.created_at, candidate.id
          LIMIT 1
        )
      WHERE p.text = ? COLLATE NOCASE
        AND (p.source_type = 'preset' OR p.owner_id = ?)
      ORDER BY CASE WHEN p.owner_id = ? THEN 0 ELSE 1 END, p.id
      LIMIT 1
    `).bind(user.subject, user.subject, text, user.subject, user.subject).first<{
      id: string;
      translation: string;
      context: string;
      source_type: "preset" | "custom";
      created_at: string;
      updated_at: string;
      status: PhraseStatus;
    }>();
    const translation = await optionalTranslationForPhrase(
      text,
      suppliedTranslation || existing?.translation,
      request,
    );
    const saved = await createVocabularyRepository(db).addEntry(user.subject, {
      text,
      translation: translation.text,
      ...(context ? { context } : {}),
    });
    const legacyMeaning = saved.entry.meanings.find(
      (meaning) => meaning.id === VOCABULARY_LEGACY_MEANING_ID,
    );
    const displayMeaning = legacyMeaning || saved.entry.meanings[0];
    return Response.json({
      id: saved.entry.phraseId,
      sourceType: saved.entry.sourceType,
      analysis: null,
      status: saved.entry.status,
      translation: displayMeaning?.translation || "",
      context: displayMeaning?.context || "",
      created_at: saved.entry.addedAt,
      updated_at: saved.entry.updatedAt,
      translationPending: translation.pending,
      created: saved.created,
    }, { status: saved.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof DeepLError) {
      return Response.json({ error: error.message }, { status: error.code === "not_configured" ? 503 : 502 });
    }
    if (error instanceof VocabularyRepositoryError) {
      const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400;
      return Response.json({ error: "Could not add the phrase." }, { status });
    }
    console.error("Custom phrase creation failed:", error);
    return Response.json({ error: "Could not add the phrase." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();

  try {
    const payload = (await request.json()) as { id?: unknown; status?: unknown };
    const id = cleanText(payload.id);
    const status = cleanText(payload.status);
    if (!id || !statuses.has(status)) {
      return Response.json({ error: "Invalid phrase status." }, { status: 400 });
    }

    const db = getD1();
    const phrase = await db.prepare(`
      SELECT
        p.text,
        p.translation AS legacy_translation,
        COALESCE(NULLIF(p.translation, ''), fallback_meaning.translation, '') AS translation,
        p.source_type
      FROM phrases AS p
      LEFT JOIN phrase_meanings AS fallback_meaning
        ON fallback_meaning.id = (
          SELECT candidate.id
          FROM phrase_meanings AS candidate
          WHERE candidate.user_id = ? AND candidate.phrase_id = p.id
          ORDER BY candidate.created_at, candidate.id
          LIMIT 1
        )
      WHERE p.id = ? AND (p.source_type = 'preset' OR p.owner_id = ?)
    `).bind(user.subject, id, user.subject).first<{
      text: string;
      legacy_translation: string;
      translation: string;
      source_type: "preset" | "custom";
    }>();
    if (!phrase) return Response.json({ error: "Phrase not found." }, { status: 404 });

    const translation = status === "pick"
      ? { text: phrase.translation, pending: false }
      : await optionalTranslationForPhrase(phrase.text, phrase.translation, request);
    const now = new Date().toISOString();
    const progressUpdate = db.prepare(`
      INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, phrase_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
    `).bind(user.subject, id, status, now, now);
    const statements = [progressUpdate];
    if (status !== "pick" && !phrase.legacy_translation && translation.text) {
      const meaningPlan = await createVocabularyMutationPlanner(db).planAddMeaning(
        user.subject,
        {
          phraseId: id,
          translation: translation.text,
        },
      );
      statements.push(...meaningPlan.statements);
    }
    await db.batch(statements);
    return Response.json({
      ok: true,
      status,
      translation: translation.text,
      updated_at: now,
      translationPending: translation.pending,
    });
  } catch (error) {
    if (error instanceof DeepLError) {
      return Response.json({ error: error.message }, { status: error.code === "not_configured" ? 503 : 502 });
    }
    const message = error instanceof Error ? error.message : "Could not update the phrase status.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();

  try {
    const id = cleanText(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Phrase is required." }, { status: 400 });

    const db = getD1();
    const existing = await db.prepare(`
      SELECT source_type
      FROM phrases
      WHERE id = ? AND (source_type = 'preset' OR owner_id = ?)
    `).bind(id, user.subject).first<{ source_type: "preset" | "custom" }>();
    if (!existing) return Response.json({ error: "Phrase not found." }, { status: 404 });

    if (existing.source_type === "preset") {
      const now = new Date().toISOString();
      await db.prepare(`
        INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at)
        VALUES (?, ?, 'pick', ?, ?)
        ON CONFLICT(user_id, phrase_id) DO UPDATE SET status = 'pick', updated_at = excluded.updated_at
      `).bind(user.subject, id, now, now).run();
    } else {
      await db.prepare("DELETE FROM phrases WHERE id = ? AND owner_id = ?").bind(id, user.subject).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete the phrase.";
    return Response.json({ error: message }, { status: 500 });
  }
}
