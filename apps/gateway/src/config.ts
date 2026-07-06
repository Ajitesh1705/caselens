// Centralized runtime configuration, read from environment with safe defaults
// so the gateway boots locally without any setup.

// Accepts a bare host (e.g. Render's fromService `host` property) or a full URL,
// and normalizes to an absolute http(s) URL.
function normalizeUrl(value: string, fallbackScheme = "https"): string {
  if (/^https?:\/\//.test(value)) return value;
  return `${fallbackScheme}://${value}`;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:27017",
  mongoDb: process.env.MONGO_DB ?? "caselens",
  esUrl: process.env.ES_URL ?? "http://localhost:9200",
  aiServiceUrl: process.env.AI_SERVICE_URL
    ? normalizeUrl(process.env.AI_SERVICE_URL)
    : "http://localhost:8000",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "caselens-dev-secret",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  // When true, ingestion runs even if Mongo/ES are unreachable (in-memory only).
  // Lets the demo run with just `pnpm dev` and no containers.
  degradeGracefully: process.env.DEGRADE_GRACEFULLY !== "false",
} as const;

export type Config = typeof config;
