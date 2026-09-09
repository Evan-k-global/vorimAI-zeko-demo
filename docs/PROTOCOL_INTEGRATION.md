# Protocol Integration Boundary

This repository is a Vorim adapter over existing Zeko ecosystem components. It does not define a new mission-auth, payment, orchestration, or agent-hiring protocol.

## Code Actually Used

The repository pins two upstream implementations as git submodules and runtime dependencies:

- `vendor/agent-mission-bound-auth` at the Zeko Ethereum Sepolia network-ID update. The adapter calls its policy, capability, boundary-event, trace, receipt, schema-verifier, and canonical field-encoding functions.
- `vendor/zeko-x402` at the merged Zeko Ethereum Sepolia settlement update. The adapter calls its x402 v2 payment builder after Vorim returns the effective payload.

`npm run test:upstream-mba` compiles and runs the upstream `MissionComplianceProgram` and `MissionRegistry` trustless settlement simulation. No contract source is copied into this repository under a different name or license.

## Adapter Responsibility

The Vorim adapter owns only this composition:

1. Call Vorim `beforeAction` with the proposed action and scope.
2. Reject `fallback`, `deny`, or unresolved `escalate` outcomes.
3. Replace the proposed payload with `modifiedPayload` when required.
4. Build the x402 payment context from the effective amount.
5. Bind the Vorim decision fields into an MBA policy and receipt statement.
6. Verify the MBA trace and receipt before emitting the signed Vorim authorization event.
7. Emit settlement success only after the observed commitment matches the expected commitment.

The `VorimDecisionBinding` remains adjacent to the canonical MBA receipt because the current upstream receipt schema has `additionalProperties: false`. Injecting Vorim-specific fields into that receipt would make it non-conformant.

Vorim's `approvalAlg` also stays separate from `receipt.holder.proofScheme`. A P-256 human approval is not the same cryptographic leg as an agent holder proof or an o1js/Pallas zkApp signature.

## Network Identity Split

The active Zeko Ethereum Sepolia profile uses three different identifiers:

- protocol routing: `zeko:sepolia`
- GraphQL response: `zeko:testnet`
- o1js signing domain: `testnet`

GraphQL and archive/read endpoint: `https://sepolia.zeko.io/graphql`.

The public testnet endpoints in the general Zeko builder docs remain useful for that network, but they are not the active executable target of the pinned MBA and x402 deployments.

## Local Versus Production

The browser demo is deliberately local. It prepares an unsigned x402 payload, uses `digest-holder-proof-v1`, and commits the verified receipt through the small adapter simulation contract.

Production settlement must use the upstream path:

- an Ed25519 or stronger holder proof accepted by the MBA production verifier;
- a signed capability artifact and domain attestation;
- a concrete `MissionComplianceProgram` proof artifact;
- the canonical `MissionRegistry` approval, escrow, nullifier, receipt, and settlement transitions;
- a signed x402 payload settled through the relevant upstream rail;
- durable witness storage and independent chain readback.

## Magic City And SantaClawz

Magic City and SantaClawz are integration contexts, not libraries needed to mint this core adapter receipt.

- Use Magic City when the action originates inside a real Magic City session. Preserve its mission ID, checkpoint events, proof queue state, and anchor results.
- Use SantaClawz when a real external agent is discovered or hired. Preserve the returned x402 plan, execution request ID, payment state, and `santaclawz-return/1.0` package.

The default demo does not claim either system participated. Their names are not stamped into receipts as synthetic provenance.

## Licensing

The upstream submodules retain their own licensing and copyright history. Agent Mission-Bound Auth and Zeko x402 currently declare BUSL-1.1. This repository does not relicense those components under Apache-2.0 or any other blanket license.
