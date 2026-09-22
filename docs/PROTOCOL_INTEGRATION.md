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
2. Reject `fallback`, `deny`, unresolved `escalate`, and an escalation timeout. The adapter waits up to 15 minutes with a two-second poll interval before refusing settlement.
3. Replace the proposed payload with `modifiedPayload` when required.
4. Build the x402 payment context from the effective amount.
5. Bind the Vorim decision fields into an MBA policy and receipt statement.
6. Verify the MBA trace and receipt before emitting the signed Vorim authorization event.
7. Emit settlement success only after the observed commitment matches the expected commitment.

The `VorimDecisionBinding` remains adjacent to the canonical MBA receipt because the current upstream receipt schema has `additionalProperties: false`. Injecting Vorim-specific fields into that receipt would make it non-conformant. Its digest is included in the MBA statement hash, so the verified receipt commits to the decision evidence without changing MBA's schema.

An escalated action now requires Vorim's actual signed approval attestation: `resolution`, `resolvedAt`, opaque `approverRef`, `alg`, `kid`, and `signature`. The adapter never synthesizes an `approvalAlg` label. A future P-256 device approval is a distinct signed artefact, not a relabeling of a platform Ed25519 signature.

## Portable Vorim Receipt And MBA Mapping

`mintPortableSignedReceipt` is a Vorim API/SDK responsibility, not a client-side composition. Its signed, explicitly versioned body should include the decision fields, original and effective JCS intent hashes, policy-modified flag, and (when present) the full approval attestation. The signature must cover the enumerated body and nothing inferred from a database row.

MBA can carry the portable object today as an off-chain, signed artefact whose digest is committed in the decision binding and MBA statement hash. The present `MissionCompliancePublicInput` does not, however, have a standalone Vorim decision or approval-attestation field. Before a production proof makes this evidence load-bearing, the upstream MBA mapping must explicitly bind the portable-receipt field commitment into `authCommitment` or add a dedicated public commitment that feeds `approvalCommitment`. That is a joint protocol change, not something this adapter should quietly invent.

Do not place a raw `resolved_by` user UUID in portable evidence or any anchorable object. Use an opaque role reference or a per-organization HMAC/commitment, with Vorim retaining the resolver mapping in its own system of record.

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
