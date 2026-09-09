declare module "agent-mission-bound-auth/protocol" {
  export function sha256Hex(value: unknown): string;
  export function buildMissionPolicy(input: Record<string, unknown>): Record<string, unknown> & {
    policyHash: string;
  };
  export function buildMissionCapability(input: Record<string, unknown>): Record<string, unknown> & {
    capabilityHash: string;
    missionIdHash: string;
    nullifier: string;
  };
  export function buildBoundaryEvent(input: Record<string, unknown>): Record<string, unknown> & {
    eventHash: string;
    holderProof: { keyThumbprint: string; scheme: string };
  };
  export function verifyTraceChain(
    events: Array<Record<string, unknown>>,
    options?: Record<string, unknown>
  ): { valid: boolean; reason?: string; eventCount?: number; traceHash?: string; latestEventHash?: string };
  export function buildMissionReceiptExport(input: Record<string, unknown>): MissionBoundAuthReceipt;
  export function canonicalValueToField(value: unknown): import("o1js").Field;
  export function verifyReceipt(
    receipt: MissionBoundAuthReceipt,
    options?: Record<string, unknown>
  ): { valid: boolean; reason?: string; errors?: unknown[] };

  export interface MissionBoundAuthReceipt {
    schema: "mission-bound-auth-receipt-v1";
    receiptId: string;
    receiptHash: string;
    mission: {
      missionIdHash: string;
      capabilityHash: string;
      authCommitment: string | null;
      approvalCommitment: string | null;
      issuer: string;
      audience: string;
    };
    capabilityArtifact: Record<string, unknown> | null;
    policy: {
      policyHash: string;
      allowedDomainsHash: string;
      allowedActionsHash: string;
      maxSpendCommitment: string;
      paymentRailsHash: string;
    };
    holder: { keyThumbprint: string; proofScheme: string };
    trace: { eventCount: number; traceHash: string; latestEventHash: string };
    payment: {
      paymentCommitment: string;
      rail: string;
      amountCommitment: string;
      paymentContextDigest: string;
    };
    proof: {
      statementKind: string;
      statementHash: string;
      proofSystem: string;
      verificationKeyHash: string | null;
      artifact: Record<string, unknown> | null;
    };
    domainProof: Record<string, unknown> | null;
    zekoStatement: Record<string, unknown> | null;
    nullifier: string;
    registryRoot: string | null;
    settlementState: string;
    anchor: Record<string, unknown> | null;
    exportedAt: string;
  }
}

declare module "zeko-x402" {
  export interface X402PaymentPayload {
    x402Version: 2;
    protocol: "x402";
    version: "2";
    requestId: string;
    paymentId: string;
    scheme: "exact";
    settlementRail: "zeko" | "evm";
    networkId: string;
    asset: { symbol: string; decimals: number; standard?: string; address?: string };
    amount: string;
    payer: string;
    payTo: string;
    sessionId: string;
    issuedAtIso: string;
    expiresAtIso: string;
    paymentContextDigest: string;
    authorizationDigest: string;
    authorization?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
  }

  export function buildPaymentPayload(input: Record<string, unknown>): X402PaymentPayload;
  export function assertPaymentPayload(input: unknown): X402PaymentPayload;
  export function buildPaymentContextDigest(input: Record<string, unknown>): string;
}
