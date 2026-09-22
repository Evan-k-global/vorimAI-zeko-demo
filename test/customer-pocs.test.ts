import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { jcsCanonicalise, JsonlPocRecordStore, runCustomerPoc } from "../src/index.js";
import { finfindrPoc } from "../pocs/finfindr/scenario.js";
import { kentAiPoc } from "../pocs/kent-ai/scenario.js";

describe("customer POCs", () => {
  it("uses JCS key ordering rather than locale ordering", () => {
    assert.equal(
      jcsCanonicalise({ "\uE000": 1, "\u{10000}": 2 }),
      "{\"𐀀\":2,\"\":1}"
    );
  });

  it("runs FinFindr with a policy-modified cap and a redacted public result", async () => {
    const result = await runCustomerPoc(finfindrPoc, { scenario: "modify" });

    assert.equal(result.vorim.verdict, "modify");
    assert.equal(result.vorim.portableReceipt.version, "vorim-portable-receipt-v1");
    assert.match(result.vorim.portableReceipt.digest, /^sha256:/);
    assert.equal(result.x402.amountNativeUnits, "50000000");
    assert.notEqual(result.privacy.originalPayloadDigest, result.privacy.effectivePayloadDigest);
    assert.equal(result.privacy.rawPayloadPublishedToZeko, false);
    assert.equal(JSON.stringify(result).includes("private:finfindr"), false);
  });

  it("runs Kent's escalation path with a signed approval attestation", async () => {
    const result = await runCustomerPoc(kentAiPoc, { scenario: "escalate" });

    assert.equal(result.vorim.verdict, "allow");
    assert.equal(result.vorim.approval?.alg, "Ed25519");
    assert.match(result.vorim.approval?.signature ?? "", /^ed25519:mock:/);
    assert.equal(result.vorim.portableReceipt.version, "vorim-portable-receipt-v1");
    assert.equal(result.privacy.rawPayloadPublishedToZeko, false);
    assert.equal(JSON.stringify(result).includes("private:kent-hoa"), false);
  });

  it("persists only public reconciliation fields through the replaceable record store", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "vorim-zeko-poc-"));
    try {
      const store = new JsonlPocRecordStore(path.join(directory, "records.jsonl"));
      await store.append({
        recordedAt: "2026-09-16T00:00:00.000Z",
        pocId: "kent-ai",
        decisionId: "dec_test",
        verdict: "allow",
        originalPayloadDigest: "sha256:original",
        effectivePayloadDigest: "sha256:effective",
        receiptCommitment: "123",
        localAdapterTransaction: "local-zkapp-tx-test"
      });
      assert.deepEqual(await store.list(), [{
        recordedAt: "2026-09-16T00:00:00.000Z",
        pocId: "kent-ai",
        decisionId: "dec_test",
        verdict: "allow",
        originalPayloadDigest: "sha256:original",
        effectivePayloadDigest: "sha256:effective",
        receiptCommitment: "123",
        localAdapterTransaction: "local-zkapp-tx-test"
      }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
