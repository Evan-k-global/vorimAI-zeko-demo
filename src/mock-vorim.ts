import { canonicalJson, sha256Hex } from "./hash.js";
import type {
  VorimEscalationOptions,
  VorimDecisionVerdict,
  VorimPortableSignedReceipt,
  VorimRuntimeClient,
  VorimRuntimeDecision
} from "./vorim-zeko-adapter.js";

export type MockVorimScenario = "allow" | "modify" | "escalate" | "fallback" | "deny";

export type MockVorimAuditEvent = {
  event: Record<string, unknown>;
  signature: string;
  canonical: string;
};

export class MockVorimDeniedError extends Error {
  constructor(readonly decision: VorimRuntimeDecision) {
    super(decision.reason ?? "Vorim denied action.");
    this.name = "MockVorimDeniedError";
  }
}

export class MockVorimClient implements VorimRuntimeClient {
  readonly auditEvents: MockVorimAuditEvent[] = [];
  private decisions = new Map<string, VorimRuntimeDecision>();
  private requests = new Map<string, {
    agentId: string;
    actionType: "tool_call";
    actionTarget: string;
    requiredScope: string;
    payload: Record<string, unknown>;
  }>();

  constructor(
    readonly scenario: MockVorimScenario = "allow",
    private readonly now = new Date()
  ) {}

  async beforeAction(
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
  ): Promise<VorimRuntimeDecision> {
    const decisionId = `dec_${sha256Hex(canonicalJson({
      agentId: input.agentId,
      actionTarget: input.actionTarget,
      idempotencyKey: input.idempotencyKey ?? "demo"
    })).slice(0, 16)}`;
    const expiresAt = new Date(this.now.getTime() + 10 * 60_000).toISOString();
    const base = {
      decisionId,
      expiresAt,
      policyVersion: 42
    };

    const decision = this.makeDecision(base, input.payload);
    this.decisions.set(decisionId, decision);
    this.requests.set(decisionId, input);
    if (decision.decision === "deny" && options.throwOnDeny) {
      throw new MockVorimDeniedError(decision);
    }
    return decision;
  }

  async waitForDecisionResolution(
    decisionId: string,
    _options: VorimEscalationOptions
  ): Promise<VorimRuntimeDecision> {
    const pending = this.decisions.get(decisionId);
    if (!pending || pending.decision !== "escalate") {
      throw new Error(`No pending escalation for ${decisionId}.`);
    }
    const resolved: VorimRuntimeDecision = {
      ...pending,
      decision: "allow",
      reason: "Mock operator approval released the action.",
      approval: {
        resolution: "approved",
        resolvedAt: new Date(this.now.getTime() + 30_000).toISOString(),
        approverRef: "role:hoa-approver",
        alg: "Ed25519",
        kid: "mock-vorim-platform-key-1",
        signature: `ed25519:mock:${sha256Hex(canonicalJson({
          decisionId,
          resolution: "approved",
          resolvedAt: new Date(this.now.getTime() + 30_000).toISOString(),
          approverRef: "role:hoa-approver"
        })).slice(0, 48)}`
      }
    };
    this.decisions.set(decisionId, resolved);
    return resolved;
  }

  async mintPortableSignedReceipt(decisionId: string): Promise<VorimPortableSignedReceipt> {
    const decision = this.decisions.get(decisionId);
    const request = this.requests.get(decisionId);
    if (!decision || !request || !["allow", "modify"].includes(decision.decision)) {
      throw new Error(`No approved mock decision is available for ${decisionId}.`);
    }
    const effectivePayload = decision.decision === "modify"
      ? decision.modifiedPayload
      : request.payload;
    if (!effectivePayload) throw new Error(`Mock decision ${decisionId} has no effective payload.`);
    const verdict: "allow" | "modify" = decision.decision === "modify" ? "modify" : "allow";
    const originalIntentHash = `sha256:${sha256Hex(canonicalJson(request.payload))}`;
    const effectiveIntentHash = `sha256:${sha256Hex(canonicalJson(effectivePayload))}`;
    const body = {
      version: "vorim-portable-receipt-v1" as const,
      decision: {
        decisionId,
        verdict,
        agentId: request.agentId,
        requiredScope: request.requiredScope,
        actionType: request.actionType,
        actionTarget: request.actionTarget,
        policyVersion: decision.policyVersion,
        decisionRuleId: null,
        requestedAt: this.now.toISOString(),
        expiresAt: decision.expiresAt
      },
      binding: {
        originalIntentHash,
        effectiveIntentHash,
        policyModified: verdict === "modify"
      },
      approval: decision.approval ?? null,
      orgId: "org_mock_vorim",
      issuedAt: new Date(this.now.getTime() + 60_000).toISOString(),
      canonicalForm: "v1" as const,
      kid: "mock-vorim-platform-key-1",
      alg: "Ed25519" as const
    };
    const digest = `sha256:${sha256Hex(canonicalJson(body))}`;
    return {
      ...body,
      digest,
      signature: `ed25519:mock:${sha256Hex(canonicalJson({ ...body, digest })).slice(0, 48)}`
    };
  }

  portableReceiptCanonicalBytes(receipt: VorimPortableSignedReceipt): Uint8Array {
    const { digest: _digest, signature: _signature, ...body } = receipt;
    return Buffer.from(canonicalJson(body), "utf8");
  }

  async emit(event: Record<string, unknown>, options: { sign: true }): Promise<unknown> {
    if (!options.sign) {
      throw new Error("MockVorimClient only models signed events.");
    }
    const canonical = canonicalJson(event);
    const signature = `ed25519:mock:${sha256Hex(canonical).slice(0, 48)}`;
    this.auditEvents.push({ event, signature, canonical });
    return { event_id: `evt_${this.auditEvents.length}`, signature };
  }

  private makeDecision(
    base: Pick<VorimRuntimeDecision, "decisionId" | "expiresAt" | "policyVersion">,
    payload: Record<string, unknown>
  ): VorimRuntimeDecision {
    if (this.scenario === "fallback") {
      return { ...base, decision: "fallback", reason: "Synthetic control-plane outage." };
    }
    if (this.scenario === "deny") {
      return { ...base, decision: "deny", reason: "Policy denied settlement." };
    }
    if (this.scenario === "escalate") {
      return { ...base, decision: "escalate", reason: "Amount requires manual approval." };
    }
    if (this.scenario === "modify") {
      return {
        ...base,
        decision: "modify",
        modifiedPayload: {
          ...payload,
          amountNativeUnits: 50_000_000,
          memo: "policy-redacted"
        }
      };
    }
    return { ...base, decision: "allow" };
  }
}

export function isMockVorimScenario(value: string): value is MockVorimScenario {
  return ["allow", "modify", "escalate", "fallback", "deny"].includes(value);
}
