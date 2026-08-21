import { canonicalJson, sha256Hex } from "./hash.js";
import type {
  VorimDecisionVerdict,
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

  constructor(
    readonly scenario: MockVorimScenario = "allow",
    private readonly now = new Date("2026-08-21T12:00:00.000Z")
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
    if (decision.decision === "deny" && options.throwOnDeny) {
      throw new MockVorimDeniedError(decision);
    }
    return decision;
  }

  async waitForDecisionResolution(decisionId: string): Promise<VorimRuntimeDecision> {
    const pending = this.decisions.get(decisionId);
    if (!pending || pending.decision !== "escalate") {
      throw new Error(`No pending escalation for ${decisionId}.`);
    }
    const resolved: VorimRuntimeDecision = {
      ...pending,
      decision: "allow",
      reason: "Human approver released the action from a secure element."
    };
    this.decisions.set(decisionId, resolved);
    return resolved;
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
      return { ...base, decision: "escalate", reason: "Amount requires human approval." };
    }
    if (this.scenario === "modify") {
      return {
        ...base,
        decision: "modify",
        modifiedPayload: {
          ...payload,
          amountNanomina: 50_000_000,
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
