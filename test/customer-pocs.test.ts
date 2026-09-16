import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { jcsCanonicalise, runCustomerPoc } from "../src/index.js";
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
    assert.equal(result.x402.amountNativeUnits, "50000000");
    assert.notEqual(result.privacy.originalPayloadDigest, result.privacy.effectivePayloadDigest);
    assert.equal(result.privacy.rawPayloadPublishedToZeko, false);
    assert.equal(JSON.stringify(result).includes("private:finfindr"), false);
  });

  it("runs Kent's human-escalation path and reports a distinct approval algorithm", async () => {
    const result = await runCustomerPoc(kentAiPoc, { scenario: "escalate" });

    assert.equal(result.vorim.verdict, "allow");
    assert.equal(result.vorim.approvalAlgorithm, "P-256");
    assert.equal(result.privacy.rawPayloadPublishedToZeko, false);
    assert.equal(JSON.stringify(result).includes("private:kent-hoa"), false);
  });
});
