"""Pydantic schemas mirroring the gateway's AI-service contract."""

from __future__ import annotations

from pydantic import BaseModel


class ExtractionRequest(BaseModel):
    caseId: str
    filename: str
    type: str = "unknown"
    content: str


class ExtractedEntity(BaseModel):
    type: str
    label: str
    attributes: dict[str, str] = {}


class ExtractedEdge(BaseModel):
    fromType: str
    fromLabel: str
    toType: str
    toLabel: str
    relation: str


class ExtractedEvent(BaseModel):
    ts: str
    actorLabel: str | None = None
    description: str


class ExtractionResult(BaseModel):
    entities: list[ExtractedEntity]
    edges: list[ExtractedEdge]
    events: list[ExtractedEvent]
    summary: str


class Chunk(BaseModel):
    evidenceId: str
    filename: str
    text: str


class AskRequest(BaseModel):
    question: str
    chunks: list[Chunk] = []


class AskResult(BaseModel):
    answer: str
    citedEvidenceIds: list[str]


class ReportEntity(BaseModel):
    type: str
    label: str


class ReportEvent(BaseModel):
    ts: str
    description: str


class ReportRequest(BaseModel):
    caseTitle: str
    entities: list[ReportEntity] = []
    events: list[ReportEvent] = []
    evidenceCount: int = 0


class ReportResult(BaseModel):
    markdown: str
