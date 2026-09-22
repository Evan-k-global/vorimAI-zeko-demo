# Vorim Week-One Evidence Chain

This document records the adapter response to Vorim's 22 September 2026 integration spec. It is an implementation boundary, not a substitute for Vorim's SDK contract.

## Implemented Here

1. An escalation resolution is awaited with a 15-minute deadline and a two-second poll interval. `ESCALATION_TIMEOUT` becomes a clean refusal to settle.
2. A resolved escalation must return an actual Vorim approval attestation. The adapter accepts only a signed Ed25519 attestation with `resolution`, `resolvedAt`, `kid`, and `signature`; it has no synthetic P-256 branch.
3. The complete approval object, when present, is included in the versioned Vorim decision binding. Its digest is constrained in the MBA mission policy and included in the MBA statement hash.
4. SDK mode requires and calls `jcsCanonicalise` from `@vorim/sdk` for original and effective intent digests. The local RFC 8785 implementation remains only for the credential-free mock demo.

## Portable Receipt Contract

Vorim should expose `mintPortableSignedReceipt` from its API and SDKs. It should refuse `deny`, `fallback`, and unresolved `escalate` decisions. The signed body is explicitly enumerated and JCS-canonicalized before signing:

- decision: decision ID, verdict, agent ID, required scope, action type/target, policy version, optional rule ID, expiry, and request time;
- binding: original and effective intent hashes plus policy-modified state;
- approval: the actual signed approval attestation only when escalation resolved;
- canonical-form version, digest, Ed25519 signature, and resolvable key ID.

Adding a signed field requires a new portable-receipt version. The exporter must never sign an open-ended database row.

## MBA Production Mapping

The existing MBA `MissionCompliancePublicInput` has `authCommitment` and `approvalCommitment`, but it does not currently expose a dedicated Vorim receipt or approval-attestation field. The current adapter therefore produces a valid MBA receipt while committing the Vorim binding through its statement hash; that is suitable for the local evidence POC, not yet a proof that verifies Vorim's Ed25519 signature inside the zkApp.

For a production proof, jointly choose one explicit mapping before implementation:

- bind the portable receipt's JCS digest/field commitment into `authCommitment` and include the approval-attestation digest in the derived approval commitment; or
- add a dedicated portable-receipt commitment to MBA's public input and make it part of the approval and receipt commitment equations.

Either approach must preserve the actual approval signature off-chain for independent verification with Vorim's `GET /trust/keys` endpoint. A future circuit can make that key verification load-bearing; this adapter must not claim it already is.

## Privacy Decision

`approverRef` must be an opaque role reference or a per-organization HMAC/commitment. A raw user UUID should stay in Vorim's private system of record and must not enter a portable object that may later be anchored.

## Positioning

The Zeko anchor is optional additive evidence for customers who need independent observability. Vorim's core value remains an offline-verifiable record with no blockchain in the trust path; the anchor must never become a prerequisite for Vorim authorization or verification.
