import { Field } from "o1js";
import {
  buildBoundaryEvent,
  buildMissionCapability,
  buildMissionPolicy,
  buildMissionReceiptExport,
  canonicalValueToField,
  sha256Hex,
  verifyReceipt,
  verifyTraceChain,
  type MissionBoundAuthReceipt
} from "agent-mission-bound-auth/protocol";
import { buildPaymentPayload, type X402PaymentPayload } from "zeko-x402";

import { canonicalJson, jcsCanonicalise, sha256Hex as sha256JcsHex } from "./hash.js";

export type VorimDecisionVerdict = "allow" | "deny" | "modify" | "escalate" | "fallback";

export type VorimRuntimeDecision = {
  decision: VorimDecisionVerdict;
  decisionId: string;
  expiresAt: string;
  policyVersion: number;
  modifiedPayload?: Record<string, unknown>;
  approval?: VorimApprovalAttestation;
  reason?: string;
};

/** A platform-signed escalation resolution, exported by Vorim's runtime. */
export type VorimApprovalAttestation = {
  resolution: "approved";
  resolvedAt: string;
  /** Opaque role reference or per-org commitment, never a raw user identifier. */
  approverRef?: string;
  alg: "Ed25519";
  kid: string;
  signature: string;
};

export type VorimEscalationOptions = {
  timeoutMs: number;
  pollIntervalMs: number;
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
  waitForDecisionResolution?(
    decisionId: string,
    options: VorimEscalationOptions
  ): Promise<VorimRuntimeDecision>;
  /** Supplied by @vorim/sdk in SDK mode; mock mode uses the local RFC 8785 implementation. */
  jcsCanonicalise?(value: unknown): string;
  emit(event: Record<string, unknown>, options: { sign: true }): Promise<unknown>;
};

export type VorimDecisionBinding = {
  version: "vorim-zeko-decision-binding-v2";
  agentId: string;
  decisionId: string;
  verdict: "allow" | "modify";
  requiredScope: string;
  resource: string;
  originalIntentHash: string;
  effectiveIntentHash: string;
  expiresAt: string;
  policyVersion: number;
  approval?: VorimApprovalAttestation;
};

export type X402PaymentTemplate = {
  requestId: string;
  paymentId: string;
  settlementRail: "zeko" | "evm";
  networkId: string;
  asset: { symbol: string; decimals: number; standard?: string; address?: string };
  payer: string;
  payTo: string;
  sessionId: string;
  maxSpendUsd: string;
  idempotencyKey?: string;
  issuedAtIso?: string;
  expiresAtIso?: string;
  extensions?: Record<string, unknown>;
};

export interface AuthorizeZekoActionInput {
  agentId: string;
  protocolNetworkId: string;
  zkappAddress: string;
  method: string;
  payload: Record<string, unknown>;
  payment: X402PaymentTemplate;
  requiredScope?: string;
  idempotencyKey?: string;
  holderSecret?: string;
}

export interface AuthorizeZekoActionResult {
  receipt: MissionBoundAuthReceipt;
  receiptVerification: ReturnType<typeof verifyReceipt>;
  vorimBinding: VorimDecisionBinding;
  missionPolicy: Record<string, unknown> & { policyHash: string };
  missionCapability: Record<string, unknown> & {
    capabilityHash: string;
    missionIdHash: string;
    nullifier: string;
  };
  boundaryEvent: Record<string, unknown>;
  payment: X402PaymentPayload;
  receiptCanonicalJson: string;
  receiptCommitment: Field;
  receiptCommitmentDecimal: string;
  receiptCommitmentHex: string;
  decisionId: string;
  originalIntentHash: string;
  effectiveIntentHash: string;
  effectivePayload: Record<string, unknown>;
}

export function hashIntent(payload: Record<string, unknown>): string {
  return `sha256:${sha256JcsHex(jcsCanonicalise(payload))}`;
}

function hashIntentWithVorimCanonicaliser(
  vorim: VorimRuntimeClient,
  payload: Record<string, unknown>
): string {
  const canonical = vorim.jcsCanonicalise ?? jcsCanonicalise;
  return `sha256:${sha256JcsHex(canonical(payload))}`;
}

export function receiptFieldCommitment(receipt: MissionBoundAuthReceipt): Field {
  return canonicalValueToField(receipt);
}

export function fieldToHex(field: Field): string {
  return `0x${field.toBigInt().toString(16)}`;
}

async function resolveEscalation(
  vorim: VorimRuntimeClient,
  decision: VorimRuntimeDecision
): Promise<VorimRuntimeDecision> {
  if (decision.decision !== "escalate") return decision;
  if (!vorim.waitForDecisionResolution) {
    throw new Error("Vorim escalation requested but waitForDecisionResolution is unavailable.");
  }
  try {
    const resolved = await vorim.waitForDecisionResolution(decision.decisionId, {
      timeoutMs: 900_000,
      pollIntervalMs: 2_000
    });
    if (resolved.decisionId !== decision.decisionId) {
      throw new Error("Vorim escalation resolution decision ID does not match the pending decision.");
    }
    return resolved;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ESCALATION_TIMEOUT"
    ) {
      throw new Error("Vorim escalation unresolved; refusing to settle.");
    }
    throw error;
  }
}

function approvedPayloadForDecision(
  decision: VorimRuntimeDecision,
  originalPayload: Record<string, unknown>
): { verdict: "allow" | "modify"; payload: Record<string, unknown> } {
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
      payload: decision.modifiedPayload
    };
  }
  return {
    verdict: "allow",
    payload: originalPayload
  };
}

function approvalForDecision(
  initialDecision: VorimRuntimeDecision,
  resolvedDecision: VorimRuntimeDecision
): VorimApprovalAttestation | undefined {
  if (initialDecision.decision !== "escalate") return undefined;
  const approval = resolvedDecision.approval;
  if (
    !approval ||
    approval.resolution !== "approved" ||
    approval.alg !== "Ed25519" ||
    !approval.kid ||
    !approval.signature.startsWith("ed25519:") ||
    Number.isNaN(Date.parse(approval.resolvedAt))
  ) {
    throw new Error("Vorim escalation resolved without a valid signed approval attestation; refusing to settle.");
  }
  return approval;
}

export async function authorizeZekoAction(
  vorim: VorimRuntimeClient,
  input: AuthorizeZekoActionInput
): Promise<AuthorizeZekoActionResult> {
  const requiredScope = input.requiredScope ?? "agent:transact";
  const resource = `${input.protocolNetworkId}:${input.zkappAddress}:${input.method}`;
  if (input.payment.networkId !== input.protocolNetworkId) {
    throw new Error("x402 payment network does not match the mission protocol network.");
  }
  const originalIntentHash = hashIntentWithVorimCanonicaliser(vorim, input.payload);

  const initialDecision = await vorim.beforeAction(
    {
      agentId: input.agentId,
      actionType: "tool_call",
      actionTarget: `${input.method}@${input.zkappAddress}`,
      requiredScope,
      payload: input.payload,
      context: {
        integration: "zeko",
        protocolNetworkId: input.protocolNetworkId,
        resource,
        x402NetworkId: input.payment.networkId,
        x402PayTo: input.payment.payTo
      },
      idempotencyKey: input.idempotencyKey
    },
    { throwOnDeny: true }
  );
  const decision = await resolveEscalation(vorim, initialDecision);
  const approved = approvedPayloadForDecision(decision, input.payload);
  const approval = approvalForDecision(initialDecision, decision);
  const effectiveIntentHash = hashIntentWithVorimCanonicaliser(vorim, approved.payload);
  const amountNativeUnits = approved.payload.amountNativeUnits;
  if (
    (typeof amountNativeUnits !== "number" && typeof amountNativeUnits !== "string") ||
    !/^[0-9]+$/.test(String(amountNativeUnits))
  ) {
    throw new Error("Effective payload must include amountNativeUnits as a non-negative integer.");
  }
  const payment = buildPaymentPayload({
    ...input.payment,
    amount: String(amountNativeUnits),
    idempotencyKey: input.payment.idempotencyKey ?? input.idempotencyKey ?? input.payment.paymentId
  });
  const missionId = `vorim:${decision.decisionId}`;
  const holderKeyCommitment = sha256Hex({
    agentId: input.agentId,
    keyId: "vorim-agent-runtime-key"
  });
  const missionPolicy = buildMissionPolicy({
    missionId,
    task: `Authorize ${input.method} on ${input.zkappAddress}`,
    allowedActions: [input.method],
    allowedDomains: [input.zkappAddress],
    paymentRails: ["x402"],
    maxSpendUsd: input.payment.maxSpendUsd,
    expiresAt: decision.expiresAt,
    constraints: {
      vorimDecisionId: decision.decisionId,
      vorimPolicyVersion: decision.policyVersion,
      vorimRequiredScope: requiredScope,
      vorimVerdict: approved.verdict,
      originalIntentHash,
      effectiveIntentHash,
      ...(approval ? { vorimApprovalHash: sha256Hex(approval) } : {})
    }
  });
  const missionCapability = buildMissionCapability({
    issuer: "https://api.vorim.ai",
    audience: "vorim-zeko-demo",
    principal: input.agentId,
    agentId: input.agentId,
    runtimeId: "vorim-runtime",
    holderKeyCommitment,
    missionId,
    allowedDomains: [input.zkappAddress],
    allowedActions: [input.method],
    dataScopes: [requiredScope],
    paymentRails: ["x402"],
    maxSpendUsd: input.payment.maxSpendUsd,
    expiresAt: decision.expiresAt,
    nullifierSeed: sha256Hex({ decisionId: decision.decisionId, resource })
  });
  const boundaryEvent = buildBoundaryEvent({
    missionIdHash: missionCapability.missionIdHash,
    capabilityHash: missionCapability.capabilityHash,
    policyHash: missionPolicy.policyHash,
    eventType: "x402.settle",
    action: input.method,
    actionHash: effectiveIntentHash,
    targetDomain: input.zkappAddress,
    resource,
    paymentContextDigest: payment.paymentContextDigest,
    idempotencyKey: input.idempotencyKey ?? payment.paymentId,
    expiresAt: decision.expiresAt,
    holderKeyCommitment,
    holder: { holderSecret: input.holderSecret ?? "local-vorim-holder-proof" }
  });
  const trace = verifyTraceChain([boundaryEvent], {
    missionIdHash: missionCapability.missionIdHash,
    capabilityHash: missionCapability.capabilityHash,
    policyHash: missionPolicy.policyHash,
    allowedActions: [input.method],
    holderSecret: input.holderSecret ?? "local-vorim-holder-proof"
  });
  if (!trace.valid) throw new Error(trace.reason ?? "Mission-Bound Auth trace verification failed.");

  const vorimBinding: VorimDecisionBinding = {
    version: "vorim-zeko-decision-binding-v2",
    agentId: input.agentId,
    decisionId: decision.decisionId,
    verdict: approved.verdict,
    requiredScope,
    resource,
    originalIntentHash,
    effectiveIntentHash,
    expiresAt: decision.expiresAt,
    policyVersion: decision.policyVersion,
    ...(approval ? { approval } : {})
  };
  const allowedDomainsHash = sha256Hex(missionPolicy.allowedDomains);
  const allowedActionsHash = sha256Hex(missionPolicy.allowedActions);
  const maxSpendCommitment = sha256Hex(missionPolicy.maxSpendUsd);
  const paymentRailsHash = sha256Hex(missionPolicy.paymentRails);
  const amountCommitment = sha256Hex({ asset: payment.asset, amount: payment.amount });
  const paymentCommitment = sha256Hex({
    authorizationDigest: payment.authorizationDigest,
    paymentContextDigest: payment.paymentContextDigest
  });
  const statementHash = sha256Hex({
    capabilityHash: missionCapability.capabilityHash,
    effectiveIntentHash,
    paymentContextDigest: payment.paymentContextDigest,
    policyHash: missionPolicy.policyHash,
    traceHash: trace.traceHash,
    vorimBinding
  });
  const receipt = buildMissionReceiptExport({
    missionIdHash: missionCapability.missionIdHash,
    capabilityHash: missionCapability.capabilityHash,
    issuer: "https://api.vorim.ai",
    audience: "vorim-zeko-demo",
    policyHash: missionPolicy.policyHash,
    allowedDomainsHash,
    allowedActionsHash,
    maxSpendCommitment,
    paymentRailsHash,
    holderKeyThumbprint: boundaryEvent.holderProof.keyThumbprint,
    proofScheme: boundaryEvent.holderProof.scheme,
    trace,
    paymentCommitment,
    rail: "x402",
    amountCommitment,
    paymentContextDigest: payment.paymentContextDigest,
    statementHash,
    nullifier: missionCapability.nullifier,
    settlementState: "receipt_created"
  });
  const receiptVerification = verifyReceipt(receipt, { allowAnchorPrepared: true });
  if (!receiptVerification.valid) {
    throw new Error(`Mission-Bound Auth receipt verification failed: ${receiptVerification.reason}`);
  }

  const receiptCanonicalJson = canonicalJson(receipt);
  const receiptCommitment = receiptFieldCommitment(receipt);
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
        zeko_protocol_network: input.protocolNetworkId,
        zkapp_address: input.zkappAddress,
        receipt_commitment: receiptCommitmentDecimal,
        receipt_commitment_hex: receiptCommitmentHex,
        receipt_hash: receipt.receiptHash,
        receipt_id: receipt.receiptId,
        original_intent_hash: originalIntentHash,
        effective_payload: approved.payload,
        x402_payment_context_digest: payment.paymentContextDigest,
        x402_authorization_digest: payment.authorizationDigest,
        policy_modified: approved.verdict === "modify",
        ...(approval ? { approval_attestation_hash: sha256Hex(approval) } : {})
      }
    },
    { sign: true }
  );

  return {
    receipt,
    receiptVerification,
    vorimBinding,
    missionPolicy,
    missionCapability,
    boundaryEvent,
    payment,
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
    observedReceiptCommitment: string;
    txHash: string;
    settlementSequence?: string;
    settledRoot?: string;
  }
): Promise<void> {
  if (input.observedReceiptCommitment !== input.receiptCommitment) {
    throw new Error("Zeko settlement commitment mismatch; refusing to emit a success audit event.");
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
        observed_receipt_commitment: input.observedReceiptCommitment,
        settlement_sequence: input.settlementSequence ?? null,
        settled_root: input.settledRoot ?? null,
        source: "zeko"
      }
    },
    { sign: true }
  );
}
