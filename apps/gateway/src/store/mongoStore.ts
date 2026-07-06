import { randomUUID } from "node:crypto";
import { MongoClient, type Db, type Collection } from "mongodb";
import type {
  Case,
  Entity,
  Edge,
  CaseEvent,
  Evidence,
  CaseGraphResponse,
} from "@caselens/shared";
import type { Store } from "./types.js";

interface EvidenceDoc extends Evidence {
  rawText?: string;
}

// MongoDB-backed store. Documents use string `id` fields (not ObjectId) to keep
// the wire shape identical to the shared domain types.
export class MongoStore implements Store {
  readonly kind = "mongo" as const;
  private db: Db;

  private constructor(
    private client: MongoClient,
    dbName: string,
  ) {
    this.db = client.db(dbName);
  }

  static async connect(url: string, dbName: string): Promise<MongoStore> {
    const client = new MongoClient(url, {
      serverSelectionTimeoutMS: 2000,
    });
    await client.connect();
    // Force a round-trip so an unreachable server fails fast at boot.
    await client.db(dbName).command({ ping: 1 });
    return new MongoStore(client, dbName);
  }

  private get cases(): Collection<Case> {
    return this.db.collection<Case>("cases");
  }
  private get evidenceCol(): Collection<EvidenceDoc> {
    return this.db.collection<EvidenceDoc>("evidence");
  }
  private get entities(): Collection<Entity> {
    return this.db.collection<Entity>("entities");
  }
  private get edges(): Collection<Edge> {
    return this.db.collection<Edge>("edges");
  }
  private get events(): Collection<CaseEvent> {
    return this.db.collection<CaseEvent>("events");
  }

  async init(): Promise<void> {
    await Promise.all([
      this.entities.createIndex(
        { caseId: 1, type: 1, label: 1 },
        { unique: true },
      ),
      this.edges.createIndex({ caseId: 1, from: 1, to: 1, relation: 1 }),
      this.events.createIndex({ caseId: 1, ts: 1 }),
      this.evidenceCol.createIndex({ caseId: 1, deliveryId: 1 }),
      this.evidenceCol.createIndex({ id: 1 }, { unique: true }),
      this.cases.createIndex({ id: 1 }, { unique: true }),
    ]);
  }

  private strip<T>(doc: T & { _id?: unknown; rawText?: string }): T {
    const { _id, rawText, ...rest } = doc as Record<string, unknown>;
    void _id;
    void rawText;
    return rest as T;
  }

  async listCases(): Promise<Case[]> {
    const docs = await this.cases.find().sort({ createdAt: -1 }).toArray();
    return docs.map((d) => this.strip(d));
  }

  async getCase(caseId: string): Promise<Case | null> {
    const doc = await this.cases.findOne({ id: caseId });
    return doc ? this.strip(doc) : null;
  }

  async createCase(input: Omit<Case, "id" | "createdAt">): Promise<Case> {
    const c: Case = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.cases.insertOne({ ...c });
    return c;
  }

  async getGraph(caseId: string): Promise<CaseGraphResponse | null> {
    const c = await this.getCase(caseId);
    if (!c) return null;
    const [entities, edges, events, evidence] = await Promise.all([
      this.entities.find({ caseId }).toArray(),
      this.edges.find({ caseId }).toArray(),
      this.events.find({ caseId }).sort({ ts: 1 }).toArray(),
      this.evidenceCol.find({ caseId }).toArray(),
    ]);
    return {
      case: c,
      entities: entities.map((e) => this.strip(e)),
      edges: edges.map((e) => this.strip(e)),
      events: events.map((e) => this.strip(e)),
      evidence: evidence.map((e) => this.strip(e)),
    };
  }

  async createEvidence(
    input: Omit<Evidence, "id" | "createdAt">,
  ): Promise<Evidence> {
    const ev: Evidence = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await this.evidenceCol.insertOne({ ...ev });
    return ev;
  }

  async updateEvidence(
    evidenceId: string,
    patch: Partial<Pick<Evidence, "status" | "summary" | "type">>,
  ): Promise<void> {
    await this.evidenceCol.updateOne({ id: evidenceId }, { $set: patch });
  }

  async getEvidence(caseId: string, evidenceId: string): Promise<Evidence | null> {
    const doc = await this.evidenceCol.findOne({ id: evidenceId, caseId });
    return doc ? this.strip(doc) : null;
  }

  async findEvidenceByDeliveryId(
    caseId: string,
    deliveryId: string,
  ): Promise<Evidence | null> {
    const doc = await this.evidenceCol.findOne({ caseId, deliveryId });
    return doc ? this.strip(doc) : null;
  }

  async upsertEntity(
    input: Omit<Entity, "id">,
  ): Promise<{ entity: Entity; created: boolean }> {
    // Pre-check existence, then upsert-merge: append evidence ids, merge
    // attributes, keep the original node id. The unique index on
    // (caseId,type,label) guarantees a single node regardless of races.
    const existing = await this.entities.findOne({
      caseId: input.caseId,
      type: input.type,
      label: input.label,
    });
    const res = await this.entities.findOneAndUpdate(
      { caseId: input.caseId, type: input.type, label: input.label },
      {
        $setOnInsert: { id: randomUUID() },
        $set: { attributes: { ...existing?.attributes, ...input.attributes } },
        $addToSet: { evidenceIds: { $each: input.evidenceIds } },
      },
      { upsert: true, returnDocument: "after" },
    );
    return { entity: this.strip(res as Entity), created: !existing };
  }

  async upsertEdge(
    input: Omit<Edge, "id">,
  ): Promise<{ edge: Edge; created: boolean }> {
    const existing = await this.edges.findOne({
      caseId: input.caseId,
      from: input.from,
      to: input.to,
      relation: input.relation,
    });
    const res = await this.edges.findOneAndUpdate(
      { caseId: input.caseId, from: input.from, to: input.to, relation: input.relation },
      {
        $setOnInsert: { id: randomUUID() },
        $addToSet: { evidenceIds: { $each: input.evidenceIds } },
      },
      { upsert: true, returnDocument: "after" },
    );
    return { edge: this.strip(res as Edge), created: !existing };
  }

  async createEvent(input: Omit<CaseEvent, "id">): Promise<CaseEvent> {
    const event: CaseEvent = { ...input, id: randomUUID() };
    await this.events.insertOne({ ...event });
    return event;
  }

  async evidenceText(
    caseId: string,
  ): Promise<{ evidence: Evidence; text: string }[]> {
    const docs = await this.evidenceCol.find({ caseId }).toArray();
    return docs.map((d) => ({ evidence: this.strip(d), text: d.rawText ?? "" }));
  }

  async saveEvidenceText(evidenceId: string, text: string): Promise<void> {
    await this.evidenceCol.updateOne(
      { id: evidenceId },
      { $set: { rawText: text } },
    );
  }
}
