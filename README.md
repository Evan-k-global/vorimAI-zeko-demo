# VorimAI on Zeko

Vorim is the trust layer for AI agents: cryptographic identity, scoped permissions enforced at runtime, and signed tamper-evident action records. Its customer promise is simple: establish which agent acted, whether it was authorized, and a record an auditor or client can verify without Vorim in the trust path. This demo shows how that record can bind an effective agent action to the existing Agent Mission-Bound Auth receipt format, an x402 payment context, and a Zeko-compatible commitment without publishing the raw regulated payload.

The default demo flow is:

1. Vorim evaluates the proposed action through `beforeAction`.
2. The adapter fails closed on `fallback` and `deny`, waits for `escalate`, and uses `modifiedPayload` after `modify`.
3. The pinned `zeko-x402` package builds an x402 v2 payment payload from the approved effective amount.
4. The pinned `agent-mission-bound-auth` package builds and verifies the policy, capability, boundary event, trace, and `mission-bound-auth-receipt-v1` export.
5. MBA's canonical encoder converts the receipt into an o1js `Field`, and the local adapter zkApp commits that field for reconciliation with Vorim's signed audit events.

## Customer POC Deployments

Two runnable local POC deployments apply the same Vorim, Mission-Bound Auth, x402, and Zeko building blocks to the public Vorim case studies. They use representative private-record references only; no customer record payload is written to Zeko or returned by the browser/API surface.

| POC | Customer workflow | Default path | Run |
| --- | --- | --- | --- |
| [FinFindr](pocs/finfindr/README.md) | A discovery agent takes a governed operating action from private operational and capital-flow records. | `modify`: policy reduces the proposed cap before x402 context is built, so the signed record reflects the action Vorim approved. | `npm run poc:finfindr` / `npm run poc:finfindr:app` |
| [Kent HOA](pocs/kent-ai/README.md) | A maintenance agent prepares a consequential vendor settlement against private community and work-order records. | `escalate`: a separate approval binding must resolve before settlement, and the outcome is recorded distinctly from the agent action. | `npm run poc:kent-ai` / `npm run poc:kent-ai:app` |

The FinFindr app serves at `http://127.0.0.1:4174`; Kent HOA serves at `http://127.0.0.1:4175`. They are launchable local POC deployments, not live customer systems or production Zeko settlement releases.

The payload digests use RFC 8785 JCS, matching the canonical bytes the supplied Vorim SDK reference identifies for signing. In a production Vorim integration, call the SDK's `jcsCanonicalise` directly when hashing the Vorim request and exported signed action record.

## Vorim Turnkey Handoff

The POCs are ready for Vorim to put behind its own frontend and connect to its existing runtime/API and database. See [the implementation handoff](docs/VORIM_TURNKEY_HANDOFF.md) for the exact environment variables, SDK boundary, frontend endpoints, and record-store interface. The default remains a safe local demo; `POC_RUNTIME_MODE=vorim-sdk` switches the server to Vorim's real SDK client without altering the MBA, x402, or Zeko commitment flow.

## What Vorim Gets From Zeko

Vorim already supplies the identity, policy decision, and signed audit record. Zeko adds a privacy-preserving, independently observable anchor for customers who need the evidence to stand outside a vendor-hosted dashboard.

- **Independent reconciliation:** a customer or auditor can match a Vorim `decisionId`, receipt hash, payment-context digest, and Zeko commitment.
- **Privacy-preserving evidence:** public state carries commitments, roots, and nullifiers instead of prompts, policy payloads, secrets, or customer data.
- **Offline-verifiable customer evidence:** the resulting MBA receipt can be verified without querying Vorim; Zeko makes the selected commitment independently observable.
- **Portable trust records:** Vorim evidence can travel in the existing MBA receipt and bundle formats.
- **Payment assurance:** x402 authorization can be bound to the action Vorim actually approved, including a policy-modified amount.
- **A stronger regulated product:** Vorim can offer policy-to-execution-to-settlement evidence, not only a runtime allow/deny response.

Vorim remains the neutral agent trust layer and system of record. Zeko makes selected trust evidence independently verifiable and harder to dispute, while the raw regulated record stays in Vorim and the customer's systems.

## V1 Shipped

This repository now ships a working adapter v1 with explicit boundaries:

- the corrected Vorim SDK call shape from the supplied TypeScript reference;
- fail-closed decision handling and original/effective intent reconciliation;
- real calls to upstream MBA builders and `verifyReceipt`, rather than locally invented lookalikes;
- real calls to the upstream x402 v2 payload builder, including its payment-identifier validation;
- payment construction after the Vorim decision, so `modify` cannot leave the original higher amount in the x402 context;
- an MBA-schema-valid `mission-bound-auth-receipt-v1` object;
- pinned upstream repositories under `vendor/` for provenance and executable contract tests;
- a local browser and CLI flow that demonstrates receipt commitment and signed-audit reconciliation.

The local `VorimAgentTrustRegistry` is an adapter simulation, not the canonical MBA settlement contract. Run `npm run test:upstream-mba` to compile and execute the pinned upstream `MissionRegistry` and `MissionComplianceProgram` trustless settlement simulation.

The v1 browser run prepares an unsigned x402 payment context; it does not move real funds. It also uses MBA's local-only `digest-holder-proof-v1`. Production MBA verification requires the stronger holder proof and concrete compliance-proof artifacts supplied by the upstream stack.

## V2 Unlock

The larger commercial unlock is a production evidence chain:

- **Vorim portable signed receipt:** add Vorim's SDK/control-plane method that exports the explicitly enumerated, JCS-signed decision and approval binding instead of composing it client-side. See [the week-one response](docs/VORIM_WEEK_ONE_RESPONSE.md).
- **MBA proof inputs:** map Vorim's decision, policy version, effective action, and holder key into the upstream `MissionComplianceProgram` public statement and witness inputs.
- **Trustless settlement:** settle through the canonical MBA `MissionRegistry`, with proof artifact, domain attestation, nullifier, receipt root, and escrow state all checked together.
- **x402 execution:** sign and settle the prepared x402 payload through the existing Zeko x402 contract or use its reserve/release implementation when conditional payment is required.
- **Magic City orchestration:** let Magic City own sessions, checkpoints, approval UX, runner boundaries, proof queues, and anchor lifecycle.
- **SantaClawz provenance:** use SantaClawz only when an external agent is actually discovered or hired, retaining its x402 plan, execution request, and canonical return package.
- **Offline verifier:** verify Vorim audit signatures, the MBA receipt/bundle, x402 payment state, and Zeko registry state in one package.

That v2 lets Vorim sell a complete, independently checkable chain from scoped permission decision to paid execution and final settlement.

## Honest Protocol Boundary

This repository does not define or relabel Mission-Bound Auth, x402, Magic City, or SantaClawz.

- `agent-mission-bound-auth` is a pinned runtime dependency and git submodule. Its package builds and verifies the receipt artifacts, and its real zkApp test is executable here.
- `zeko-x402` is a pinned runtime dependency and git submodule. Its package builds and validates the x402 v2 payment context.
- Magic City is not executed by the default demo. It becomes relevant when this adapter is called inside a real Magic City execution session.
- SantaClawz is not executed by the default demo. It becomes relevant only for a real external-agent discovery, hire, paid execution, and return-package flow.

Hardcoding `magic-city-compatible` or `agentRail: santaclawz` into a receipt would falsely claim those systems participated, so v1 does not do that.

## Current Zeko Profile

The active upstream MBA and Zeko-native x402 deployments use Zeko Ethereum Sepolia:

- protocol routing ID: `zeko:sepolia`
- node-reported GraphQL ID: `zeko:testnet`
- o1js signing domain: `testnet`
- GraphQL and read endpoint: `https://sepolia.zeko.io/graphql`
- native asset: `sETH`, 9 decimals
- default transaction fee: `200000` native units
- MBA `MissionRegistry`: `B62qikuceF52NVPb8VAVSaRoCRMusFz38pLLENjvLaUuLiDnULAVohe`
- x402 settlement zkApp: `B62qqb9HqChXa8k4dukxRA6EZ76LzeuJKCpEcBsyicb5aTLoQg9J9rU`

Do not pass `zeko:sepolia` to `Mina.Network({ networkId })`; it is a protocol identifier, not the o1js signing domain.

## Repository Map

- `src/vorim-zeko-adapter.ts` - Vorim decision gate plus upstream MBA and x402 composition.
- `src/VorimAgentTrustRegistry.ts` - local adapter-only commitment simulation.
- `src/demo-runner.ts` - local end-to-end demo used by the CLI and browser.
- `pocs/finfindr/` - runnable FinFindr opportunity-remediation POC.
- `pocs/kent-ai/` - runnable Kent HOA payment-escalation POC.
- `vendor/agent-mission-bound-auth` - pinned upstream MBA implementation and canonical zkApps.
- `vendor/zeko-x402` - pinned upstream x402 implementation.
- `app/` - browser control surface for decision scenarios.
- `scripts/doctor.ts` - local configuration and live canonical zkApp checks.
- `test/` - adapter and local simulation tests.

## Run It

Clone with the pinned protocol sources:

```bash
git clone --recurse-submodules https://github.com/Evan-k-global/vorimAI-zeko-demo.git
cd vorimAI-zeko-demo
npm install
npm test
```

For an existing clone:

```bash
git submodule update --init --recursive
```

Run the Vorim scenarios:

```bash
npm run demo:vorim -- allow
npm run demo:vorim -- modify
npm run demo:vorim -- escalate
npm run demo:vorim -- fallback
```

Run the pinned canonical MBA contract/proof simulation:

```bash
npm run test:upstream-mba
```

Start the browser app:

```bash
npm run app
```

Open `http://localhost:4173`. The browser uses `MockVorimClient`; its audit signatures and Zeko transaction hashes are visibly local demo values.

## Deployment Commands

`npm run deploy:zeko` and `npm run smoke:zeko` call the pinned upstream MBA deployment and live-approval scripts. They require the upstream MBA environment variables, funded Zeko Ethereum Sepolia keys, and a durable witness store. Load `.env` into the shell first; the upstream scripts intentionally do not auto-load secrets.

The lightweight local adapter contract remains available for isolated testing:

```bash
npm run deploy:adapter-demo
npm run smoke:adapter-demo
```

Run `npm run doctor` before any live transaction. Never commit `.env`, private keys, witness stores, customer identifiers, or raw regulated payloads.

## CTA

Use this v1 as the week-one integration artifact with Vorim. The concrete joint design task is a production `mintPortableSignedReceipt` SDK/control-plane method plus an explicit mapping from Vorim decision and approval evidence into the upstream MBA compliance statement. Once that is agreed, the existing MBA registry and x402 settlement contracts can enforce the evidence instead of this repo growing another protocol.

## Licensing

No blanket Apache-2.0 license is asserted for this repository or the protocol stack. The pinned upstream components retain their own licenses and commercial terms, including the BUSL terms in Agent Mission-Bound Auth and Zeko x402. Review those terms before redistribution or production deployment.
