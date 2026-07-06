import type {
  EntityType,
} from "@caselens/shared";
import type {
  ExtractionRequest,
  ExtractionResult,
  ExtractedEntity,
  ExtractedEdge,
  ExtractedEvent,
} from "./types.js";

// Deterministic regex/heuristic extractor. Mirrors the AI service's fallback so
// ingestion works even if the FastAPI container is down. Recognizes phones,
// emails, IBAN/account numbers, people/orgs, and simple relations, and pulls
// timestamped lines into events.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const ACCT_RE = /\b(?:acct|account|a\/c)\.?\s*#?\s*(\d{6,})\b/gi;
// e.g. "2026-03-04 14:12" or "2026-03-04T14:12:00Z"
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?Z?)?)\b/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
// Capitalized full names: "Rohit Mehta", "R. Mehta"
const NAME_RE = /\b([A-Z][a-z]+|[A-Z]\.)\s([A-Z][a-z]{2,})\b/g;
const ORG_SUFFIXES = new Set([
  "Holdings",
  "Ltd",
  "LLC",
  "Inc",
  "Bank",
  "Corp",
  "Group",
  "Trust",
]);

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

// Blank out dates, IBANs, accounts, and emails so their digits can't be
// misread as phone numbers.
function maskNonPhones(str: string): string {
  return str
    .replace(DATE_RE, (m) => " ".repeat(m.length))
    .replace(IBAN_RE, (m) => " ".repeat(m.length))
    .replace(ACCT_RE, (m) => " ".repeat(m.length))
    .replace(EMAIL_RE, (m) => " ".repeat(m.length));
}

function findPhones(str: string): string[] {
  const masked = maskNonPhones(str);
  return uniqueBy(
    [...masked.matchAll(PHONE_RE)]
      .map((m) => m[0].replace(/[^\d+]/g, ""))
      .filter((p) => {
        const digits = p.replace(/\D/g, "");
        return digits.length >= 10 && digits.length <= 14;
      }),
    (p) => p,
  );
}

function findNames(str: string): { label: string; type: EntityType }[] {
  return uniqueBy(
    [...str.matchAll(NAME_RE)].map((m) => {
      const label = `${m[1]} ${m[2]}`;
      const type: EntityType = ORG_SUFFIXES.has(m[2]) ? "organization" : "person";
      return { label, type };
    }),
    (n) => n.type + ":" + n.label.toLowerCase(),
  );
}

function findAccounts(str: string): { label: string; kind: string }[] {
  const out: { label: string; kind: string }[] = [];
  for (const m of str.matchAll(IBAN_RE)) out.push({ label: m[0], kind: "iban" });
  for (const m of str.matchAll(ACCT_RE)) out.push({ label: m[1], kind: "account" });
  return uniqueBy(out, (a) => a.label);
}

function findEmails(str: string): string[] {
  return uniqueBy(
    [...str.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()),
    (e) => e,
  );
}

export function localExtract(req: ExtractionRequest): ExtractionResult {
  const text = req.content;
  const entities: ExtractedEntity[] = [];
  const edges: ExtractedEdge[] = [];
  const events: ExtractedEvent[] = [];

  // ---- global entity pass ----
  for (const p of findPhones(text)) {
    entities.push({ type: "phone", label: p, attributes: {} });
  }
  for (const e of findEmails(text)) {
    entities.push({ type: "email", label: e, attributes: {} });
  }
  for (const a of findAccounts(text)) {
    entities.push({ type: "account", label: a.label, attributes: { kind: a.kind } });
  }
  for (const n of findNames(text)) {
    entities.push({ type: n.type, label: n.label, attributes: {} });
  }

  // ---- per-line relations + events ----
  for (const line of text.split(/\r?\n/)) {
    const names = findNames(line);
    const phones = findPhones(line);
    const accts = findAccounts(line);
    const actor = names.find((n) => n.type === "person");

    if (actor) {
      for (const other of names) {
        if (other.label === actor.label) continue;
        edges.push({
          fromType: "person",
          fromLabel: actor.label,
          toType: other.type,
          toLabel: other.label,
          relation: other.type === "organization" ? "associated_with" : "contacted",
        });
      }
      for (const p of phones) {
        edges.push({
          fromType: "person",
          fromLabel: actor.label,
          toType: "phone",
          toLabel: p,
          relation: "uses",
        });
      }
      for (const a of accts) {
        edges.push({
          fromType: "person",
          fromLabel: actor.label,
          toType: "account",
          toLabel: a.label,
          relation: "transacted",
        });
      }
    }

    const date = [...line.matchAll(DATE_RE)][0]?.[1];
    if (date) {
      events.push({
        ts: toIso(date),
        actorLabel: actor?.label,
        description: line.trim().slice(0, 200),
      });
    }
  }

  const dedupedEntities = uniqueBy(
    entities,
    (e) => `${e.type}:${e.label.toLowerCase()}`,
  );
  const summary =
    `Extracted ${dedupedEntities.length} entities, ${edges.length} relations, ` +
    `${events.length} events from ${req.filename}.`;

  return { entities: dedupedEntities, edges, events, summary };
}

function toIso(raw: string): string {
  // Accepts "2026-03-04", "2026-03-04 14:12", "2026-03-04T14:12:00Z".
  let s = raw.trim().replace(" ", "T");
  if (!s.includes("T")) s += "T00:00:00Z";
  else if (!/Z$|[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
