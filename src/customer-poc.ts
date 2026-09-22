import { runVorimZekoDemo, type RunVorimZekoDemoOptions, type VorimZekoDemoProfile } from "./demo-runner.js";
import type { MockVorimScenario } from "./mock-vorim.js";
import type { VorimApprovalAttestation } from "./vorim-zeko-adapter.js";

export type CustomerPocDefinition = {
  id: "finfindr" | "kent-ai";
  title: string;
  customerLabel: string;
  summary: string;
  actionLabel: string;
  escalationLabel?: string;
  profile: VorimZekoDemoProfile;
};

export type CustomerPocResult = {
  poc: Pick<CustomerPocDefinition, "id" | "title" | "customerLabel" | "summary" | "actionLabel" | "escalationLabel">;
  scenario: MockVorimScenario;
  status: "settled";
  agent: { id: string; scopedPermissions: string[] };
  vorim: {
    decisionId: string;
    verdict: "allow" | "modify";
    policyVersion: number;
    approval?: VorimApprovalAttestation;
    signedActionRecords: number;
  };
  privacy: {
    rawPayloadPublishedToZeko: false;
    originalPayloadDigest: string;
    effectivePayloadDigest: string;
    canonicalization: "RFC 8785 JCS";
  };
  zeko: {
    receiptCommitment: string;
    missionCommitment: string;
    missionRoot: string;
    localAdapterTransaction: string;
  };
  x402: { asset: string; amountNativeUnits: string; paymentContextDigest: string };
};

/**
 * Executes the existing Vorim -> MBA -> x402 -> Zeko demo path, then removes
 * customer payload fields from the response surface. The local zkApp itself
 * receives only the MBA receipt commitment, never this application payload.
 */
export async function runCustomerPoc(
  definition: CustomerPocDefinition,
  options: Omit<RunVorimZekoDemoOptions, "profile"> = {}
): Promise<CustomerPocResult> {
  const result = await runVorimZekoDemo({ ...options, profile: definition.profile });

  return {
    poc: {
      id: definition.id,
      title: definition.title,
      customerLabel: definition.customerLabel,
      summary: definition.summary,
      actionLabel: definition.actionLabel,
      escalationLabel: definition.escalationLabel
    },
    scenario: result.scenario,
    status: result.status,
    agent: {
      id: definition.profile.agentId,
      scopedPermissions: definition.profile.scopes
    },
    vorim: {
      decisionId: result.decisionId,
      verdict: result.vorimBinding.verdict,
      policyVersion: result.vorimBinding.policyVersion,
      ...(result.vorimBinding.approval ? { approval: result.vorimBinding.approval } : {}),
      signedActionRecords: result.emittedAuditRecords
    },
    privacy: {
      rawPayloadPublishedToZeko: false,
      originalPayloadDigest: result.originalIntentHash,
      effectivePayloadDigest: result.effectiveIntentHash,
      canonicalization: "RFC 8785 JCS"
    },
    zeko: {
      receiptCommitment: result.receiptCommitment,
      missionCommitment: result.missionCommitment,
      missionRoot: result.missionRoot,
      localAdapterTransaction: result.simulatedTxHash
    },
    x402: {
      asset: result.x402Payment.asset.symbol,
      amountNativeUnits: result.x402Payment.amount,
      paymentContextDigest: result.x402Payment.paymentContextDigest
    }
  };
}
