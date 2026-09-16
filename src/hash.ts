import { createHash } from "node:crypto";

import { Field } from "o1js";

/**
 * RFC 8785 JSON Canonicalization Scheme serialization.
 *
 * Vorim signs JCS bytes. Keeping the mock path on the same canonical form makes
 * payload digests stable between the local POCs and a real Vorim SDK integration.
 */
export function jcsCanonicalise(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JCS only accepts finite JSON numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jcsCanonicalise).join(",")}]`;
  }
  if (typeof value !== "object") {
    throw new TypeError(`JCS does not support ${typeof value} values.`);
  }

  const entries = Object.entries(value as Record<string, unknown>)
    // JCS sorts raw UTF-16 code units. Array.sort() supplies that ordering;
    // localeCompare() does not and would produce verifier-dependent digests.
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, child]) => `${JSON.stringify(key)}:${jcsCanonicalise(child)}`);
  return `{${entries.join(",")}}`;
}

export const canonicalJson = jcsCanonicalise;

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fieldFromHexDigest(hexDigest: string): Field {
  const normalized = hexDigest.startsWith("0x") ? hexDigest.slice(2) : hexDigest;
  return Field(BigInt(`0x${normalized.slice(0, 62)}`));
}

export function fieldFromString(value: string): Field {
  return fieldFromHexDigest(sha256Hex(value));
}

export function fieldFromObject(value: unknown): Field {
  return fieldFromString(canonicalJson(value));
}
