import { randomBytes } from "node:crypto";

import { PublicKey, UInt64 } from "o1js";

import { VorimAgentCredential } from "./VorimAgentTrustRegistry.js";
import { fieldFromObject, fieldFromString, sha256Hex } from "./hash.js";

export type VorimAgentAssertion = {
  issuer: string;
  audience: string;
  agentId: string;
  agentDid?: string;
  agentPublicKeyFingerprint?: string;
  runtimeId?: string;
  scopes?: string[];
  issuedAt?: string;
  expiresAt?: string;
  [claim: string]: unknown;
};

export type BuildAgentCredentialInput = {
  agentAssertion: VorimAgentAssertion;
  clientId: string;
  scope: string;
  appSalt: string;
  authContext?: Record<string, unknown>;
  agentKey: PublicKey;
  issuedAtSlot: bigint | number | string;
  expiresAtSlot: bigint | number | string;
  nonce?: string;
};

export function assertVorimAgentAssertion(
  assertion: VorimAgentAssertion,
  expected: { issuer: string; audience: string; now?: Date }
) {
  if (assertion.issuer !== expected.issuer) {
    throw new Error(`Unexpected Vorim issuer: ${assertion.issuer}`);
  }
  if (assertion.audience !== expected.audience) {
    throw new Error(`Unexpected Vorim audience: ${assertion.audience}`);
  }
  if (!assertion.agentId) {
    throw new Error("Vorim assertion is missing agentId");
  }
  if (assertion.expiresAt !== undefined) {
    const now = expected.now ?? new Date();
    if (new Date(assertion.expiresAt).getTime() <= now.getTime()) {
      throw new Error("Vorim agent assertion has expired");
    }
  }
}

export function buildVorimAgentCredential({
  agentAssertion,
  clientId,
  scope,
  appSalt,
  authContext = {},
  agentKey,
  issuedAtSlot,
  expiresAtSlot,
  nonce = randomBytes(16).toString("hex")
}: BuildAgentCredentialInput): VorimAgentCredential {
  const agentIdentity = agentAssertion.agentDid ?? agentAssertion.agentId;
  if (!agentIdentity) {
    throw new Error("Vorim assertion is missing agent identity");
  }

  return new VorimAgentCredential({
    agentCommitment: fieldFromString(`${appSalt}:vorim-agent:${agentIdentity}`),
    clientIdHash: fieldFromString(clientId),
    authContextHash: fieldFromObject({
      issuer: agentAssertion.issuer,
      audience: agentAssertion.audience,
      agentIdHash: sha256Hex(agentAssertion.agentId),
      agentDidHash: agentAssertion.agentDid ? sha256Hex(agentAssertion.agentDid) : null,
      publicKeyFingerprintHash: agentAssertion.agentPublicKeyFingerprint
        ? sha256Hex(agentAssertion.agentPublicKeyFingerprint)
        : null,
      runtimeId: agentAssertion.runtimeId ?? null,
      scopes: agentAssertion.scopes ?? [],
      ...authContext
    }),
    scopeHash: fieldFromString(scope),
    agentKey,
    issuedAtSlot: UInt64.from(issuedAtSlot),
    expiresAtSlot: UInt64.from(expiresAtSlot),
    nullifier: fieldFromString(`${appSalt}:vorim-agent-nullifier:${agentIdentity}:${scope}:${nonce}`)
  });
}
