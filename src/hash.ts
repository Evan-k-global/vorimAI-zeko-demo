import { createHash } from "node:crypto";

import { Field } from "o1js";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
  return `{${entries.join(",")}}`;
}

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
