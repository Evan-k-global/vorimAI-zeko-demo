import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Field } from "o1js";

import {
  MockVorimClient,
  authorizeZekoAction,
  hashIntent,
  recordZekoSettlement
} from "../src/index.js";

const baseInput = {
  agentId: "agid_vorim_demo_agent_001",
  network: "zeko:testnet",
  zkappAddress: "B62qdemoZkapp111111111111111111111111111111111111111111",
  method: "settleMission",
  payload: {
    action: "purchase_compute_credit",
    amountNanomina: 100_000_000,
    memo: "raw memo"
  },
  idempotencyKey: "test"
};

describe("vorim zeko adapter", () => {
  it("commits an allowed decision with a real Field commitment", async () => {
    const vorim = new MockVorimClient("allow");
    const result = await authorizeZekoAction(vorim, baseInput);

    assert.equal(result.receipt.verdict, "allow");
    assert.equal(result.receipt.alg, "Ed25519");
    assert.equal(result.receipt.schema, "mission-bound-auth-receipt-v1");
    assert.match(result.receipt.receiptId, /^receipt_[a-f0-9]{24}$/);
    assert.equal(typeof result.receipt.receiptHash, "string");
    assert.equal(result.receipt.mission.protocol, "mission-bound-agent-auth-v1");
    assert.equal(result.receipt.policy.decisionId, result.decisionId);
    assert.equal(result.receipt.holder.alg, "Ed25519");
    assert.equal(result.receipt.holder.proofScheme, "digest-holder-proof-v1");
    assert.equal(result.receipt.trace.boundaryEventVersion, "mission-bound-boundary-event-v1");
    assert.equal(result.receipt.payment.rail, "x402");
    assert.equal(result.receipt.proof.registryVersion, "mba-registry-v1");
    assert.equal(result.receipt.proof.statementKind, "mission-bound-trace-compliance-v1");
    assert.equal(result.receipt.proof.proofSystem, "signed-commitment-transition");
    assert.equal(result.receipt.adapter.bundleVersion, "zk-mission-bundle-v1");
    assert.equal(result.effectiveIntentHash, hashIntent(baseInput.payload));
    assert.ok(result.receiptCommitment instanceof Field);
    assert.equal(vorim.auditEvents.length, 1);
  });

  it("uses modifiedPayload for a modify verdict", async () => {
    const vorim = new MockVorimClient("modify");
    const result = await authorizeZekoAction(vorim, baseInput);

    assert.equal(result.receipt.verdict, "modify");
    assert.equal(result.receipt.alg, "Ed25519");
    assert.notEqual(result.effectiveIntentHash, result.originalIntentHash);
    assert.equal(result.effectivePayload.amountNanomina, 50_000_000);
    assert.equal(result.effectivePayload.memo, "policy-redacted");
  });

  it("resolves escalation before committing", async () => {
    const vorim = new MockVorimClient("escalate");
    const result = await authorizeZekoAction(vorim, baseInput);

    assert.equal(result.receipt.verdict, "allow");
    assert.equal(result.receipt.alg, "P-256");
    assert.equal(result.receipt.holder.alg, "P-256");
    assert.equal(vorim.auditEvents.length, 1);
  });

  it("fails closed on fallback", async () => {
    const vorim = new MockVorimClient("fallback");
    await assert.rejects(
      () => authorizeZekoAction(vorim, baseInput),
      /control plane unreachable/
    );
  });

  it("does not record a settlement when the observed commitment mismatches", async () => {
    const vorim = new MockVorimClient("allow");
    await assert.rejects(
      () => recordZekoSettlement(vorim, {
        agentId: "agid_vorim_demo_agent_001",
        decisionId: "dec_test",
        receiptCommitment: "123",
        observedReceiptCommitment: "456",
        txHash: "local-tx"
      }),
      /commitment mismatch/
    );
    assert.equal(vorim.auditEvents.length, 0);
  });
});
