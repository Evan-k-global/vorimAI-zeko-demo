import type { CustomerPocDefinition } from "../../src/customer-poc.js";

export const kentAiPoc: CustomerPocDefinition = {
  id: "kent-ai",
  title: "Kent HOA payment escalation",
  customerLabel: "Kent AI",
  summary: "A Kent HOA maintenance agent requests a consequential vendor payment against private community records.",
  actionLabel: "Release a maintenance payment after escalation",
  escalationLabel: "A high-stakes HOA payment must stop for human approval before settlement.",
  profile: {
    agentId: "agid_kent_hoa_maintenance_agent_001",
    agentDid: "did:vorim:agent:kent-hoa-maintenance-001",
    runtimeId: "kent-hoa-operations",
    clientId: "kent-ai-poc-client",
    scopes: ["agent:read", "agent:execute", "agent:transact"],
    actionPayload: {
      action: "release_maintenance_payment",
      amountNativeUnits: 100_000_000,
      communityRecord: "private:kent-hoa:community:operations-2026-09",
      workOrder: "private:kent-hoa:work-order:maintenance-0001",
      memo: "private maintenance invoice"
    },
    counterparty: "kent-hoa-vendor-settlement",
    paymentPrefix: "kent-hoa-maintenance",
    sessionPrefix: "kent-hoa-payment",
    maxSpendUsd: "1.00",
    requiredScope: "agent:transact"
  }
};
