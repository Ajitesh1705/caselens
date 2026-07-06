"""Deterministic heuristic extractor — the Python twin of the gateway's
localExtract. Runs with no API key so extraction always works."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from .schemas import (
    ExtractedEdge,
    ExtractedEntity,
    ExtractedEvent,
    ExtractionRequest,
    ExtractionResult,
)

EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b")
ACCT_RE = re.compile(r"\b(?:acct|account|a/c)\.?\s*#?\s*(\d{6,})\b", re.I)
DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?Z?)?)\b")
PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
NAME_RE = re.compile(r"\b([A-Z][a-z]+|[A-Z]\.)\s([A-Z][a-z]{2,})\b")
ORG_SUFFIXES = {"Holdings", "Ltd", "LLC", "Inc", "Bank", "Corp", "Group", "Trust"}


def _unique(items: list, key) -> list:
    seen: set = set()
    out = []
    for it in items:
        k = key(it)
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out


def _mask_non_phones(s: str) -> str:
    for rx in (DATE_RE, IBAN_RE, ACCT_RE, EMAIL_RE):
        s = rx.sub(lambda m: " " * len(m.group(0)), s)
    return s


def find_phones(s: str) -> list[str]:
    masked = _mask_non_phones(s)
    raw = [re.sub(r"[^\d+]", "", m.group(0)) for m in PHONE_RE.finditer(masked)]
    kept = [p for p in raw if 10 <= len(re.sub(r"\D", "", p)) <= 14]
    return _unique(kept, lambda p: p)


def find_names(s: str) -> list[tuple[str, str]]:
    out = []
    for m in NAME_RE.finditer(s):
        label = f"{m.group(1)} {m.group(2)}"
        etype = "organization" if m.group(2) in ORG_SUFFIXES else "person"
        out.append((label, etype))
    return _unique(out, lambda n: n[1] + ":" + n[0].lower())


def find_accounts(s: str) -> list[tuple[str, str]]:
    out = [(m.group(0), "iban") for m in IBAN_RE.finditer(s)]
    out += [(m.group(1), "account") for m in ACCT_RE.finditer(s)]
    return _unique(out, lambda a: a[0])


def find_emails(s: str) -> list[str]:
    return _unique([m.group(0).lower() for m in EMAIL_RE.finditer(s)], lambda e: e)


def _to_iso(raw: str) -> str:
    s = raw.strip().replace(" ", "T")
    if "T" not in s:
        s += "T00:00:00Z"
    elif not re.search(r"(Z|[+-]\d{2}:?\d{2})$", s):
        s += "Z"
    try:
        return (
            datetime.fromisoformat(s.replace("Z", "+00:00"))
            .astimezone(UTC)
            .isoformat()
            .replace("+00:00", "Z")
        )
    except ValueError:
        return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def heuristic_extract(req: ExtractionRequest) -> ExtractionResult:
    text = req.content
    entities: list[ExtractedEntity] = []
    edges: list[ExtractedEdge] = []
    events: list[ExtractedEvent] = []

    for p in find_phones(text):
        entities.append(ExtractedEntity(type="phone", label=p))
    for e in find_emails(text):
        entities.append(ExtractedEntity(type="email", label=e))
    for label, kind in find_accounts(text):
        entities.append(ExtractedEntity(type="account", label=label, attributes={"kind": kind}))
    for label, etype in find_names(text):
        entities.append(ExtractedEntity(type=etype, label=label))

    for line in text.splitlines():
        names = find_names(line)
        phones = find_phones(line)
        accts = find_accounts(line)
        actor = next((n for n in names if n[1] == "person"), None)
        if actor:
            for other_label, other_type in names:
                if other_label == actor[0]:
                    continue
                edges.append(
                    ExtractedEdge(
                        fromType="person",
                        fromLabel=actor[0],
                        toType=other_type,
                        toLabel=other_label,
                        relation="associated_with" if other_type == "organization" else "contacted",
                    )
                )
            for p in phones:
                edges.append(
                    ExtractedEdge(
                        fromType="person", fromLabel=actor[0], toType="phone", toLabel=p, relation="uses"
                    )
                )
            for label, _kind in accts:
                edges.append(
                    ExtractedEdge(
                        fromType="person",
                        fromLabel=actor[0],
                        toType="account",
                        toLabel=label,
                        relation="transacted",
                    )
                )
        date = DATE_RE.search(line)
        if date:
            events.append(
                ExtractedEvent(
                    ts=_to_iso(date.group(1)),
                    actorLabel=actor[0] if actor else None,
                    description=line.strip()[:200],
                )
            )

    deduped = _unique(entities, lambda e: f"{e.type}:{e.label.lower()}")
    summary = (
        f"Extracted {len(deduped)} entities, {len(edges)} relations, "
        f"{len(events)} events from {req.filename}."
    )
    return ExtractionResult(entities=deduped, edges=edges, events=events, summary=summary)
