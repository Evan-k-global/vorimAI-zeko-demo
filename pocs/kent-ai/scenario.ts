import type { CustomerPocDefinition } from "../../src/customer-poc.js";

export const kentAiPoc: CustomerPocDefinition = {
  id: "kent-ai",
  title: "Kent HOA governed maintenance action",
  customerLabel: "Kent AI",
  summary: "A maintenance agent prepares a vendor settlement from private community records. Vorim proves the agent's authority, stops the consequential action for approval, and preserves a signed record of the outcome.",
  actionLabel: "Settle an approved maintenance work order",
  escalationLabel: "The agent can prepare the action, but a separate approver must release it before settlement.",
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
