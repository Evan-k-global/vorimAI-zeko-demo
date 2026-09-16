import type { CustomerPocDefinition } from "../../src/customer-poc.js";

export const finfindrPoc: CustomerPocDefinition = {
  id: "finfindr",
  title: "FinFindr opportunity remediation",
  customerLabel: "FinFindr",
  summary: "A discovery agent proposes a narrowly scoped remediation after analyzing private operational and capital-flow records.",
  actionLabel: "Approve a capped remediation budget",
  profile: {
    agentId: "agid_finfindr_opportunity_agent_001",
    agentDid: "did:vorim:agent:finfindr-opportunity-001",
    runtimeId: "finfindr-opportunity-lab",
    clientId: "finfindr-poc-client",
    scopes: ["agent:read", "agent:execute", "agent:transact"],
    actionPayload: {
      action: "approve_remediation_budget",
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
