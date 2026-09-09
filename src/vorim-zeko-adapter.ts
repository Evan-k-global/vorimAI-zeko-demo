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
  receiptId: string;
  receiptHash: string;
  mission: {
    protocol: "mission-bound-agent-auth-v1";
    missionIdHash: string;
    capabilityHash: string;
    issuer: string;
    audience: string;
    resource: string;
    actionHash: string;
  };
  policy: {
    policyHash: string;
    allowedActionsHash: string;
    paymentRailsHash: string;
    decisionId: string;
    verdict: "allow" | "modify";
    requiredScope: string;
    policyVersion: number;
    expiresAt: string;
  };
  holder: {
    agentId: string;
    keyThumbprint: string;
    proofScheme: "digest-holder-proof-v1";
    alg: "Ed25519" | "P-256";
  };
  trace: {
    boundaryEventVersion: "mission-bound-boundary-event-v1";
    eventCount: number;
    traceHash: string;
    latestEventHash: string;
    originalIntentHash: string;
    effectiveIntentHash: string;
  };
  payment: {
    rail: "x402";
    networkId: string;
    amountCommitment: string;
    paymentCommitment: string;
    paymentContextDigest: string;
  };
  proof: {
    registryVersion: "mba-registry-v1";
    statementKind: "mission-bound-trace-compliance-v1";
    statementHash: string;
    proofSystem: "signed-commitment-transition";
    verificationKeyHash: string | null;
    networkId: string;
    zkappAddress: string;
  };
  nullifier: string;
  registryRoot: string | null;
  settlementState: "receipt_created";
  anchor: null;
  exportedAt: string;
  adapter: {
    bundleVersion: "zk-mission-bundle-v1";
    integrationProfile: "vorim-zeko-demo-adapter";
    appRuntime: "magic-city-compatible";
    agentRail: "santaclawz";
  };
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
    fieldFromString(receipt.receiptId),
    fieldFromString(receipt.receiptHash),
    fieldFromString(receipt.mission.missionIdHash),
    fieldFromString(receipt.mission.capabilityHash),
    fieldFromString(receipt.policy.policyHash),
    fieldFromString(receipt.holder.keyThumbprint),
    fieldFromString(receipt.trace.traceHash),
    fieldFromString(receipt.trace.latestEventHash),
    fieldFromString(receipt.payment.paymentContextDigest),
    fieldFromString(receipt.payment.paymentCommitment),
    fieldFromString(receipt.proof.statementHash),
    fieldFromString(receipt.nullifier),
    fieldFromString(receipt.settlementState),
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

function receiptIdFor(body: Omit<VorimZekoAuthorizationReceipt, "receiptId" | "receiptHash">): string {
  const {
    anchor: _anchor,
    exportedAt: _exportedAt,
    registryRoot: _registryRoot,
    settlementState: _settlementState,
    ...identityBody
  } = body;
  return `receipt_${sha256Hex(canonicalJson(identityBody)).slice(0, 24)}`;
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
  const exportedAt = new Date().toISOString();
  const missionIdHash = hashIntent({
    protocol: "mission-bound-agent-auth-v1",
    agentId: input.agentId,
    decisionId: decision.decisionId,
    resource
  });
  const capabilityHash = hashIntent({
    version: "mission-bound-capability-v1",
    agentId: input.agentId,
    allowedActions: [input.method],
    paymentRails: ["x402"],
    resource,
    scopes: [requiredScope]
  });
  const policyHash = hashIntent({
    decisionId: decision.decisionId,
    expiresAt: decision.expiresAt,
    policyVersion: decision.policyVersion,
    requiredScope,
    verdict: approved.verdict
  });
  const allowedActionsHash = hashIntent({ actions: [input.method], resource });
  const paymentRailsHash = hashIntent({ paymentRails: ["x402"] });
  const amountCommitment = hashIntent({
    amountNanomina:
      typeof approved.payload.amountNanomina === "number"
        ? approved.payload.amountNanomina
        : null
  });
  const paymentContextDigest = hashIntent({
    protocol: "x402",
    version: "2",
    networkId: input.network,
    rail: "x402",
    resource,
    amountCommitment
  });
  const paymentCommitment = hashIntent({ paymentContextDigest, rail: "x402" });
  const latestEventHash = hashIntent({
    version: "mission-bound-boundary-event-v1",
    decisionId: decision.decisionId,
    effectiveIntentHash,
    event: "vorim.beforeAction",
    originalIntentHash,
    verdict: approved.verdict
  });
  const traceHash = hashIntent({ eventCount: 1, latestEventHash });
  const statementHash = hashIntent({
    capabilityHash,
    effectiveIntentHash,
    originalIntentHash,
    paymentContextDigest,
    policyHash
  });

  const receiptBody: Omit<VorimZekoAuthorizationReceipt, "receiptId" | "receiptHash"> = {
    schema: "mission-bound-auth-receipt-v1",
    mission: {
      protocol: "mission-bound-agent-auth-v1",
      missionIdHash,
      capabilityHash,
      issuer: "https://api.vorim.ai",
      audience: "vorim-zeko-demo",
      resource,
      actionHash: effectiveIntentHash
    },
    policy: {
      policyHash,
      allowedActionsHash,
      paymentRailsHash,
      decisionId: decision.decisionId,
      verdict: approved.verdict,
      requiredScope,
      policyVersion: decision.policyVersion,
      expiresAt: decision.expiresAt
    },
    holder: {
      agentId: input.agentId,
      keyThumbprint: hashIntent({
        agentId: input.agentId,
        signer: approved.alg === "P-256" ? "human-secure-element" : "agent-runtime-key"
      }),
      proofScheme: "digest-holder-proof-v1",
      alg: approved.alg
    },
    trace: {
      boundaryEventVersion: "mission-bound-boundary-event-v1",
      eventCount: 1,
      traceHash,
      latestEventHash,
      originalIntentHash,
      effectiveIntentHash
    },
    payment: {
      rail: "x402",
      networkId: input.network,
      amountCommitment,
      paymentCommitment,
      paymentContextDigest
    },
    proof: {
      registryVersion: "mba-registry-v1",
      statementKind: "mission-bound-trace-compliance-v1",
      statementHash,
      proofSystem: "signed-commitment-transition",
      verificationKeyHash: null,
      networkId: input.network,
      zkappAddress: input.zkappAddress
    },
    nullifier: hashIntent({
      agentId: input.agentId,
      decisionId: decision.decisionId,
      resource
    }),
    registryRoot: null,
    settlementState: "receipt_created",
    anchor: null,
    exportedAt,
    adapter: {
      bundleVersion: "zk-mission-bundle-v1",
      integrationProfile: "vorim-zeko-demo-adapter",
      appRuntime: "magic-city-compatible",
      agentRail: "santaclawz"
    },
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
  const receipt: VorimZekoAuthorizationReceipt = {
    ...receiptBody,
    receiptId: receiptIdFor(receiptBody),
    receiptHash: sha256Hex(canonicalJson(receiptBody))
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
        receipt_hash: receipt.receiptHash,
        receipt_id: receipt.receiptId,
        original_intent_hash: originalIntentHash,
        effective_payload: approved.payload,
        x402_payment_context_digest: receipt.payment.paymentContextDigest,
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
