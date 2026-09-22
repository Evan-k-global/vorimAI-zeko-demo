import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Field } from "o1js";

import {
  MockVorimClient,
  authorizeZekoAction,
  hashIntent,
  recordZekoSettlement,
  type AuthorizeZekoActionInput,
  type VorimRuntimeClient
} from "../src/index.js";

const baseInput: AuthorizeZekoActionInput = {
  agentId: "agid_vorim_demo_agent_001",
  protocolNetworkId: "zeko:sepolia",
  zkappAddress: "B62qdemoZkapp111111111111111111111111111111111111111111",
  method: "settleMission",
  payload: {
    action: "purchase_compute_credit",
    amountNativeUnits: 100_000_000,
    memo: "raw memo"
  },
  payment: {
    requestId: "x402req-test",
    paymentId: "x402pay-test",
    settlementRail: "zeko",
    networkId: "zeko:sepolia",
    asset: { symbol: "sETH", decimals: 9, standard: "native" },
    payer: "B62qpayer",
    payTo: "B62qpayee",
    sessionId: "vorim-test",
    maxSpendUsd: "1.00",
    idempotencyKey: "vorim-test-payment-0001"
  },
  idempotencyKey: "test"
};

describe("vorim zeko adapter", () => {
  it("commits an allowed decision with a real Field commitment", async () => {
    const vorim = new MockVorimClient("allow");
    const result = await authorizeZekoAction(vorim, baseInput);

    assert.equal(result.vorimBinding.verdict, "allow");
    assert.equal(result.vorimBinding.approval, undefined);
    assert.equal(result.portableReceipt.version, "vorim-portable-receipt-v1");
    assert.match(result.portableReceipt.digest, /^sha256:/);
    assert.equal(result.vorimBinding.portableReceipt.digest, result.portableReceipt.digest);
    assert.equal(result.receipt.schema, "mission-bound-auth-receipt-v1");
    assert.match(result.receipt.receiptId, /^receipt_[a-f0-9]{24}$/);
    assert.equal(typeof result.receipt.receiptHash, "string");
    assert.equal(result.receiptVerification.valid, true);
    assert.equal(result.receipt.mission.issuer, "https://api.vorim.ai");
    assert.equal(result.receipt.holder.proofScheme, "digest-holder-proof-v1");
    assert.equal(result.receipt.payment.rail, "x402");
    assert.equal(result.receipt.proof.statementKind, "mission-bound-trace-compliance-v1");
    assert.equal(result.receipt.proof.proofSystem, "signed-commitment-transition");
    assert.equal(result.receipt.capabilityArtifact, null);
    assert.equal(result.effectiveIntentHash, hashIntent(baseInput.payload));
    assert.ok(result.receiptCommitment instanceof Field);
    assert.equal(vorim.auditEvents.length, 1);
  });

  it("uses modifiedPayload for a modify verdict", async () => {
    const vorim = new MockVorimClient("modify");
    const result = await authorizeZekoAction(vorim, baseInput);

    assert.equal(result.vorimBinding.verdict, "modify");
    assert.equal(result.vorimBinding.approval, undefined);
    assert.notEqual(result.effectiveIntentHash, result.originalIntentHash);
    assert.equal(result.effectivePayload.amountNativeUnits, 50_000_000);
    assert.equal(result.payment.amount, "50000000");
    assert.equal(result.effectivePayload.memo, "policy-redacted");
  });

  it("resolves escalation before committing", async () => {
    const vorim = new MockVorimClient("escalate");
    const result = await authorizeZekoAction(vorim, baseInput);

    assert.equal(result.vorimBinding.verdict, "allow");
    assert.equal(result.vorimBinding.approval?.resolution, "approved");
    assert.equal(result.vorimBinding.approval?.approverRef, "role:hoa-approver");
    assert.equal(result.vorimBinding.approval?.alg, "Ed25519");
    assert.equal(result.vorimBinding.approval?.kid, "mock-vorim-platform-key-1");
    assert.match(result.vorimBinding.approval?.signature ?? "", /^ed25519:mock:/);
    assert.equal(result.receipt.holder.proofScheme, "digest-holder-proof-v1");
    assert.equal(vorim.auditEvents.length, 1);
  });

  it("fails closed when an escalation approval times out", async () => {
    const timeoutError = Object.assign(new Error("approval timed out"), {
      code: "ESCALATION_TIMEOUT"
    });
    const vorim: VorimRuntimeClient = {
      async beforeAction() {
        return {
          decision: "escalate",
          decisionId: "dec_timeout",
          expiresAt: "2026-09-16T00:10:00.000Z",
          policyVersion: 42
        };
      },
      async waitForDecisionResolution() {
        throw timeoutError;
      },
      async emit() {
        return undefined;
      }
    };
    await assert.rejects(
      () => authorizeZekoAction(vorim, baseInput),
      /escalation unresolved; refusing to settle/
    );
  });

  it("refuses a resolved escalation without a signed approval attestation", async () => {
    const vorim = new MockVorimClient("escalate");
    vorim.waitForDecisionResolution = async (decisionId) => ({
      decision: "allow",
      decisionId,
      expiresAt: "2026-09-16T00:10:00.000Z",
      policyVersion: 42
    });
    await assert.rejects(
      () => authorizeZekoAction(vorim, baseInput),
      /without a valid signed approval attestation/
    );
  });

  it("refuses a portable receipt whose canonical digest does not verify", async () => {
    const vorim = new MockVorimClient("allow");
    const mint = vorim.mintPortableSignedReceipt.bind(vorim);
    vorim.mintPortableSignedReceipt = async (decisionId) => ({
      ...(await mint(decisionId)),
      digest: "sha256:tampered"
    });
    await assert.rejects(
      () => authorizeZekoAction(vorim, baseInput),
      /digest does not match its canonical bytes/
    );
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
