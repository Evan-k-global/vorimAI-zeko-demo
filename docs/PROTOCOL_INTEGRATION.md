# Protocol Integration Boundary

This demo is a Vorim adapter over existing Zeko ecosystem protocols. It does
not claim to define a new settlement, payment, agent-hiring, or mission-auth
protocol.

## Canonical Protocols Used

- Agent Mission-Bound Auth: portable mission, approval, checkpoint, receipt,
  and Zeko registry vocabulary. This repo uses the canonical names
  `zk-mission-bundle-v1`, `mission-bound-auth-receipt-v1`, and `mba-registry-v1`,
  and emits a receipt object with the canonical receipt sections.
- x402 on Zeko: payment rail metadata and paid-work reconciliation surface.
  This demo records `payment.rail: "x402"` plus a payment context digest and
  keeps exact settlement, reserve/release, and facilitator behavior as external
  `zeko-x402` concerns.
- Magic City: product/runtime orchestration model for sessions, approvals,
  checkpoints, proof queues, and Zeko anchoring. The demo is
  `magic-city-compatible`; it is not Magic City itself.
- Santaclawz: external agent discovery/hiring/execution rail in the Magic City
  model. The demo records `agentRail: "santaclawz"` as provenance for the agent
  leg, but does not copy or relicense Santaclawz infrastructure.

## Adapter Responsibility

Vorim contributes the runtime governance decision:

1. run the action through Vorim's decision path;
2. fail closed on `fallback` or unresolved `escalate`;
3. apply `modifiedPayload` when policy returns `modify`;
4. commit the approved effective intent into a
   schema-shaped `mission-bound-auth-receipt-v1` receipt;
5. bind that receipt commitment into the Zeko mission authorization and signed
   audit events.

## Current Chain Split

This zkApp demo defaults to Zeko testnet endpoints:

- `https://testnet.zeko.io/graphql`
- `https://archive.testnet.zeko.io/graphql`
- `ZEKO_O1JS_NETWORK_ID=zeko`

The newer `zeko-x402` Zeko-native payment rail is documented separately as
Zeko Ethereum Sepolia (`X402_ZEKO_NETWORK=zeko:sepolia`) with its own graph
endpoint and signing-domain settings. Keep those payment rails in `zeko-x402`
and pass their resulting payment context into this adapter receipt instead of
rebuilding the rail here.

The adapter does not replace the canonical Mission-Bound Auth sidecar,
checkpoint API, bundle verifier, x402 rail implementation, Magic City
orchestration service, or Santaclawz agent network.

## Use Upstream Repos For Production Behavior

This repository should not accumulate local pseudo-implementations of the
protocol stack. When the demo needs production behavior, wire to the upstream
systems instead:

- Use `agent-mission-bound-auth` for passports, mission proposals, approvals,
  checkpoint enforcement, portable bundles, receipt schemas, verifier CLI, and
  Zeko anchoring scripts.
- Use `zeko-x402` for payment rail metadata, Base/EVM compatibility,
  reserve/release semantics, and payment-to-proof reconciliation.
- Use Magic City for session orchestration, approval UX, runner boundaries,
  proof queueing, and Zeko anchor lifecycle.
- Use Santaclawz for external agent discovery, hire routing, paid execution,
  return-package provenance, and reputation/readiness surfaces.

The Vorim-specific work belongs at the adapter boundary: take Vorim's agent
identity, scoped runtime decision, signed audit event, and policy-modified
payload, then bind those facts into the existing mission/payment/execution
protocols.

## Licensing Boundary

No blanket Apache-2.0 license is asserted for the protocol stack in this demo.
Existing protocol implementations keep their own licenses and commercial terms.
In particular, the local Agent Mission-Bound Auth source indicates Business
Source License 1.1 with a future Apache-2.0 change license. Do not redistribute
or productionize derived protocol code unless the applicable upstream license or
commercial agreement allows it.

This repository is a technical adapter demo for evaluation. Any production
package should include explicit license files and notices approved by Vorim,
Zeko Labs, and the owners of Santaclawz, x402, Magic City, and Agent
Mission-Bound Auth components.
