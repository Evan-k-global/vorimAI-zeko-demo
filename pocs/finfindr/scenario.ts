import type { CustomerPocDefinition } from "../../src/customer-poc.js";

export const finfindrPoc: CustomerPocDefinition = {
  id: "finfindr",
  title: "FinFindr governed operating action",
  customerLabel: "FinFindr",
  summary: "A discovery agent identifies a private operating opportunity, then acts with a cryptographic identity, a bounded permission, and a signed record the client can verify independently.",
  actionLabel: "Execute a policy-bounded remediation",
  profile: {
    agentId: "agid_finfindr_opportunity_agent_001",
    agentDid: "did:vorim:agent:finfindr-opportunity-001",
    runtimeId: "finfindr-opportunity-lab",
    clientId: "finfindr-poc-client",
    scopes: ["agent:read", "agent:execute", "agent:transact"],
    actionPayload: {
      action: "execute_working_capital_remediation",
      amountNativeUnits: 100_000_000,
      opportunityRecord: "private:finfindr:opportunity:capital-flow-2026-09",
      remediationClass: "working-capital-automation",
      memo: "private client opportunity record"
    },
    counterparty: "finfindr-remediation-service",
    paymentPrefix: "finfindr-remediation",
    sessionPrefix: "finfindr-opportunity",
    maxSpendUsd: "1.00",
    requiredScope: "agent:transact"
  }
};
