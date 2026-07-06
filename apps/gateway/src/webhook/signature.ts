import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC-SHA256 over the raw request body, compared in constant time. The signature
// header may be sent bare (hex) or prefixed "sha256=<hex>".
export function computeSignature(rawBody: Buffer | string, secret: string): string {
  return createHmac("sha256", secret)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody)
    .digest("hex");
}

export function verifySignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = computeSignature(rawBody, secret);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
