import { Field, Poseidon } from "o1js";

import { canonicalJson, fieldFromString, sha256Hex } from "./hash.js";

export type VorimDecisionVerdict =
  | "allow"
  | "deny"
  | "modify"
  | "escalate"
  | "fallback";

export type VorimRuntimeDecision = {
  decision: VorimDecisionVerdict;
  decisionId: string;
  expiresAt: string;
  policyVersion: number;
  modifiedPayload?: Record<string, unknown>;
  reason?: string;
};

export type VorimRuntimeClient = {
  beforeAction(
    input: {
      agentId: string;
      actionType: "tool_call";
      actionTarget: string;
      requiredScope: string;
      payload: Record<string, unknown>;
      context: Record<string, unknown>;
      idempotencyKey?: string;
    },
    options: { throwOnDeny: true }
  ): Promise<VorimRuntimeDecision>;
  waitForDecisionResolution?(decisionId: string): Promise<VorimRuntimeDecision>;
  emit(event: Record<string, unknown>, options: { sign: true }): Promise<unknown>;
};

export interface VorimZekoAuthorizationReceipt {
  schema: "mission-bound-auth-receipt-v1";
  bundleVersion: "zk-mission-bundle-v1";
  registryVersion: "mba-registry-v1";
  integrationProfile: "vorim-zeko-demo-adapter";
  appRuntime: "magic-city-compatible";
  agentRail: "santaclawz";
  paymentRail: "x402";
  agentId: string;
  decisionId: string;
  verdict: "allow" | "modify";
  requiredScope: string;
  resource: string;
  originalIntentHash: string;
  effectiveIntentHash: string;
  expiresAt: string;
  policyVersion: number;
  alg: "Ed25519" | "P-256";
}

export interface AuthorizeZekoActionInput {
  agentId: string;
  network: string;
  zkappAddress: string;
  method: string;
  payload: Record<string, unknown>;
  requiredScope?: string;
  idempotencyKey?: string;
}

export interface AuthorizeZekoActionResult {
  receipt: VorimZekoAuthorizationReceipt;
  receiptCanonicalJson: string;
  receiptCommitment: Field;
  receiptCommitmentDecimal: string;
  receiptCommitmentHex: string;
  decisionId: string;
  originalIntentHash: string;
  effectiveIntentHash: string;
  effectivePayload: Record<string, unknown>;
}

const RECEIPT_NAMESPACE = fieldFromString("mission-bound-auth-receipt-v1:vorim-zeko-demo-adapter");

export function hashIntent(payload: Record<string, unknown>): string {
  return `sha256:${sha256Hex(canonicalJson(payload))}`;
}

export function receiptPoseidonCommitment(receipt: VorimZekoAuthorizationReceipt): Field {
  return Poseidon.hash([
    RECEIPT_NAMESPACE,
    fieldFromString(receipt.schema),
    fieldFromString(receipt.bundleVersion),
    fieldFromString(receipt.registryVersion),
    fieldFromString(receipt.integrationProfile),
    fieldFromString(receipt.appRuntime),
    fieldFromString(receipt.agentRail),
    fieldFromString(receipt.paymentRail),
    fieldFromString(receipt.agentId),
    fieldFromString(receipt.decisionId),
    fieldFromString(receipt.verdict),
    fieldFromString(receipt.requiredScope),
    fieldFromString(receipt.resource),
    fieldFromString(receipt.originalIntentHash),
    fieldFromString(receipt.effectiveIntentHash),
    fieldFromString(receipt.expiresAt),
    Field(receipt.policyVersion),
    fieldFromString(receipt.alg)
  ]);
}

export function fieldToHex(field: Field): string {
  return `0x${field.toBigInt().toString(16)}`;
}

async function resolveEscalation(
  vorim: VorimRuntimeClient,
  decision: VorimRuntimeDecision
): Promise<VorimRuntimeDecision> {
  if (decision.decision !== "escalate") {
    return decision;
  }
  if (!vorim.waitForDecisionResolution) {
    throw new Error("Vorim escalation requested but waitForDecisionResolution is unavailable.");
  }
  return vorim.waitForDecisionResolution(decision.decisionId);
}

function approvedPayloadForDecision(
  decision: VorimRuntimeDecision,
  originalPayload: Record<string, unknown>,
  wasEscalated: boolean
): { verdict: "allow" | "modify"; payload: Record<string, unknown>; alg: "Ed25519" | "P-256" } {
  if (decision.decision === "fallback") {
    throw new Error("Vorim control plane unreachable; refusing to settle an ungoverned action.");
  }
  if (decision.decision === "deny") {
    throw new Error(`Vorim denied action${decision.reason ? `: ${decision.reason}` : "."}`);
  }
  if (decision.decision === "escalate") {
    throw new Error("Vorim escalation did not resolve to an allow or modify verdict.");
  }
  if (decision.decision === "modify") {
    if (!decision.modifiedPayload) {
      throw new Error("Vorim modify verdict did not include modifiedPayload.");
    }
    return {
      verdict: "modify",
      payload: decision.modifiedPayload,
      alg: wasEscalated ? "P-256" : "Ed25519"
    };
  }
  return { verdict: "allow", payload: originalPayload, alg: wasEscalated ? "P-256" : "Ed25519" };
}

export async function authorizeZekoAction(
  vorim: VorimRuntimeClient,
  input: AuthorizeZekoActionInput
): Promise<AuthorizeZekoActionResult> {
  const requiredScope = input.requiredScope ?? "agent:transact";
  const resourceNetwork = input.network.startsWith("zeko:") ? input.network : `zeko:${input.network}`;
  const resource = `${resourceNetwork}:${input.zkappAddress}:${input.method}`;
  const originalIntentHash = hashIntent(input.payload);

  const initialDecision = await vorim.beforeAction(
    {
      agentId: input.agentId,
      actionType: "tool_call",
      actionTarget: `${input.method}@${input.zkappAddress}`,
      requiredScope,
      payload: input.payload,
      context: { integration: "zeko", network: input.network, resource },
      idempotencyKey: input.idempotencyKey
    },
    { throwOnDeny: true }
  );
  const decision = await resolveEscalation(vorim, initialDecision);
  const approved = approvedPayloadForDecision(
    decision,
    input.payload,
    initialDecision.decision === "escalate"
  );
  const effectiveIntentHash = hashIntent(approved.payload);

  const receipt: VorimZekoAuthorizationReceipt = {
    schema: "mission-bound-auth-receipt-v1",
    bundleVersion: "zk-mission-bundle-v1",
    registryVersion: "mba-registry-v1",
    integrationProfile: "vorim-zeko-demo-adapter",
    appRuntime: "magic-city-compatible",
    agentRail: "santaclawz",
    paymentRail: "x402",
    agentId: input.agentId,
    decisionId: decision.decisionId,
    verdict: approved.verdict,
    requiredScope,
    resource,
    originalIntentHash,
    effectiveIntentHash,
    expiresAt: decision.expiresAt,
    policyVersion: decision.policyVersion,
    alg: approved.alg
  };

  const receiptCanonicalJson = canonicalJson(receipt);
  const receiptCommitment = receiptPoseidonCommitment(receipt);
  const receiptCommitmentDecimal = receiptCommitment.toString();
  const receiptCommitmentHex = fieldToHex(receiptCommitment);

  await vorim.emit(
    {
      agent_id: input.agentId,
      event_type: "tool_call",
      action: `zeko.authorize:${input.method}`,
      resource,
      result: "success",
      permission: requiredScope,
      decision_id: decision.decisionId,
      input_hash: effectiveIntentHash,
      metadata: {
        zeko_network: input.network,
        zkapp_address: input.zkappAddress,
        receipt_commitment: receiptCommitmentDecimal,
        receipt_commitment_hex: receiptCommitmentHex,
        original_intent_hash: originalIntentHash,
        effective_payload: approved.payload,
        policy_modified: approved.verdict === "modify"
      }
    },
    { sign: true }
  );

  return {
    receipt,
    receiptCanonicalJson,
    receiptCommitment,
    receiptCommitmentDecimal,
    receiptCommitmentHex,
    decisionId: decision.decisionId,
    originalIntentHash,
    effectiveIntentHash,
    effectivePayload: approved.payload
  };
}

export async function recordZekoSettlement(
  vorim: VorimRuntimeClient,
  input: {
    agentId: string;
    decisionId: string;
    receiptCommitment: string;
    txHash: string;
    settlementSequence?: string;
    settledRoot?: string;
    observedReceiptCommitment?: string;
  }
): Promise<void> {
  if (
    input.observedReceiptCommitment !== undefined &&
    input.observedReceiptCommitment !== input.receiptCommitment
  ) {
    throw new Error("Zeko settlement commitment mismatch; refusing to record settlement.");
  }

  await vorim.emit(
    {
      agent_id: input.agentId,
      event_type: "tool_call",
      action: "zeko.settlement.confirmed",
      result: "success",
      decision_id: input.decisionId,
      metadata: {
        tx_hash: input.txHash,
        receipt_commitment: input.receiptCommitment,
        settlement_sequence: input.settlementSequence ?? null,
        settled_root: input.settledRoot ?? null,
        source: "zeko"
      }
    },
    { sign: true }
  );
}
