"""CaseLens AI service — stateless compute for extraction, RAG Q&A, and report
generation. Heuristic-first so it runs with no API key; OpenAI augments when
OPENAI_API_KEY is set."""

from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from . import llm
from .extract import heuristic_extract
from .schemas import (
    AskRequest,
    AskResult,
    ExtractionRequest,
    ExtractionResult,
    ReportRequest,
    ReportResult,
)

app = FastAPI(title="CaseLens AI Service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "llm": "openai" if llm.has_llm() else "heuristic-only"}


@app.post("/extract", response_model=ExtractionResult)
def extract(req: ExtractionRequest) -> ExtractionResult:
    result = heuristic_extract(req)
    # Enrich the summary with an LLM one-liner when a key is available.
    enriched = llm.summarize(req.content, req.filename)
    if enriched:
        result.summary = enriched
    return result


@app.post("/ask", response_model=AskResult)
def ask(req: AskRequest) -> AskResult:
    text, cited = llm.answer(req)
    return AskResult(answer=text, citedEvidenceIds=cited)


@app.post("/ask/stream")
def ask_stream(req: AskRequest) -> StreamingResponse:
    def ndjson() -> Iterator[str]:
        for token in llm.stream_answer(req):
            yield json.dumps({"token": token}) + "\n"

    return StreamingResponse(ndjson(), media_type="application/x-ndjson")


@app.post("/report", response_model=ReportResult)
def report(req: ReportRequest) -> ReportResult:
    return ReportResult(markdown=llm.report(req))
