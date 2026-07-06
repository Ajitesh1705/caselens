"""Provider-agnostic LLM access. OpenAI is the default provider when
OPENAI_API_KEY is set; otherwise every method returns a deterministic,
retrieval-grounded fallback so the demo runs with no key and never errors."""

from __future__ import annotations

import os
from collections.abc import Iterator

from .schemas import AskRequest, ReportRequest

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


def has_llm() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def _openai_client():
    from openai import OpenAI  # imported lazily so the dep is optional

    return OpenAI()


# ---- deterministic fallbacks (no LLM) ----


def _template_answer(req: AskRequest) -> str:
    if not req.chunks:
        return "No evidence in this case matched the question."
    lines = [
        f"- From **{c.filename}**: {c.text[:180].strip()}…" for c in req.chunks[:4]
    ]
    return (
        "Based on the retrieved evidence:\n\n"
        + "\n".join(lines)
        + "\n\n(Generated without an LLM — set OPENAI_API_KEY for a synthesized answer.)"
    )


def template_report(req: ReportRequest) -> str:
    by_type: dict[str, list[str]] = {}
    for e in req.entities:
        by_type.setdefault(e.type, []).append(e.label)
    entity_section = "\n".join(
        f"- **{t}** ({len(v)}): {', '.join(v)}" for t, v in by_type.items()
    )
    chronology = "\n".join(
        f"- `{e.ts}` — {e.description}"
        for e in sorted(req.events, key=lambda x: x.ts)[:20]
    )
    return "\n".join(
        [
            f"# Case Report: {req.caseTitle}",
            "",
            f"_Generated from {req.evidenceCount} pieces of evidence._",
            "",
            "## Key entities",
            entity_section or "_No entities extracted yet._",
            "",
            "## Chronology",
            chronology or "_No events extracted yet._",
            "",
            "## Leads to pursue",
            "- Corroborate the most-connected entities across independent evidence sources.",
            "- Review transactions clustered in the flagged time window.",
            "",
            "_Generated without an LLM. Set OPENAI_API_KEY for a synthesized narrative._",
        ]
    )


# ---- public API ----


def _context(req: AskRequest) -> str:
    return "\n\n".join(f"[{c.filename}] {c.text}" for c in req.chunks)


def answer(req: AskRequest) -> tuple[str, list[str]]:
    cited = list(dict.fromkeys(c.evidenceId for c in req.chunks))
    if not has_llm():
        return _template_answer(req), cited
    try:
        client = _openai_client()
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_ASK},
                {"role": "user", "content": f"Evidence:\n{_context(req)}\n\nQuestion: {req.question}"},
            ],
        )
        return resp.choices[0].message.content or "", cited
    except Exception as err:  # noqa: BLE001 — fall back on any provider error
        print(f"[llm] answer failed ({err}); using template")
        return _template_answer(req), cited


def stream_answer(req: AskRequest) -> Iterator[str]:
    if not has_llm():
        for word in _split_stream(_template_answer(req)):
            yield word
        return
    try:
        client = _openai_client()
        stream = client.chat.completions.create(
            model=OPENAI_MODEL,
            stream=True,
            messages=[
                {"role": "system", "content": _SYSTEM_ASK},
                {"role": "user", "content": f"Evidence:\n{_context(req)}\n\nQuestion: {req.question}"},
            ],
        )
        for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                yield token
    except Exception as err:  # noqa: BLE001
        print(f"[llm] stream failed ({err}); using template")
        for word in _split_stream(_template_answer(req)):
            yield word


def report(req: ReportRequest) -> str:
    if not has_llm():
        return template_report(req)
    try:
        client = _openai_client()
        entities = ", ".join(f"{e.label} ({e.type})" for e in req.entities[:40])
        events = "\n".join(f"{e.ts}: {e.description}" for e in sorted(req.events, key=lambda x: x.ts)[:40])
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_REPORT},
                {
                    "role": "user",
                    "content": (
                        f"Case: {req.caseTitle}\nEvidence count: {req.evidenceCount}\n"
                        f"Entities: {entities}\nEvents:\n{events}"
                    ),
                },
            ],
        )
        return resp.choices[0].message.content or template_report(req)
    except Exception as err:  # noqa: BLE001
        print(f"[llm] report failed ({err}); using template")
        return template_report(req)


def summarize(text: str, filename: str) -> str | None:
    """Optional LLM one-line summary used to enrich extraction. None if no key."""
    if not has_llm():
        return None
    try:
        client = _openai_client()
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "Summarize forensic evidence in one sentence."},
                {"role": "user", "content": f"{filename}:\n{text[:2000]}"},
            ],
        )
        return resp.choices[0].message.content
    except Exception:  # noqa: BLE001
        return None


def _split_stream(text: str) -> Iterator[str]:
    import re

    for part in re.split(r"(\s+)", text):
        if part:
            yield part


_SYSTEM_ASK = (
    "You are a forensic analyst assistant. Answer the investigator's question "
    "using ONLY the provided evidence. Cite filenames inline in brackets. If the "
    "evidence does not support an answer, say so plainly. Be concise."
)

_SYSTEM_REPORT = (
    "You are a forensic analyst. Produce a structured markdown case report with "
    "sections: Summary, Key entities, Chronology, and Leads to pursue. Base every "
    "statement on the supplied entities and events. Be precise and neutral."
)
