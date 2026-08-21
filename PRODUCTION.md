# Demo to Production

This repository is a Vorim adapter demo for Zeko. It models Vorim correctly as the trust layer for AI agents: cryptographic identity, scoped permissions, runtime control, and signed tamper-evident audit records.

## Public and Private Boundary

Suitable for this public demo repository:

- the o1js zkApp scaffold for agent credential commitments, mission authorization, and one-time settlement;
- commitment and nullifier helpers;
- the structural Vorim runtime adapter boundary;
- local mock Vorim client behavior for `allow`, `modify`, `escalate`, `fallback`, and `deny`;
- demo scripts, tests, and integration documentation.

Keep private or upstream-controlled:

- Vorim API keys, agent private keys, production audit signing material, policy rules, and customer identifiers;
- raw action payloads that regulated customers would not want stored in a public chain or public repository;
- production relayer credentials, deployer keys, archive/indexer infrastructure, and witness services;
- Agent Mission-Bound Auth, x402, Magic City, and Santaclawz implementation code unless its upstream license or commercial agreement allows redistribution.

Do not commit `.env` files, private keys, raw regulated payloads, customer identifiers, or production audit bundles.

## Protocol Boundary

This repository is not a new protocol and should not represent Agent Mission-Bound Auth, x402, Magic City, or Santaclawz as Vorim-authored or Apache-licensed.

The adapter uses the existing Mission-Bound Auth names `zk-mission-bundle-v1`, `mission-bound-auth-receipt-v1`, and `mba-registry-v1`; records x402 as the payment rail; records Santaclawz as the agent rail; and treats Magic City as the compatible runtime/orchestration pattern.

## Production Work

Vorim and Zeko should co-design these pieces:

1. A Vorim SDK method that mints or exports a portable signed receipt for a runtime decision.
2. Exact Poseidon field packing for agent identity, decision ID, verdict, expiry, policy version, original intent hash, effective intent hash, x402 payment context, and settlement commitment.
3. A durable witness/indexer service for agent credential and mission roots.
4. A settlement verifier that reads Zeko events/archive state and proves the committed receipt appeared in the settled mission.
5. A production x402 reserve/release path for paid agent work.
6. A Magic City/Santaclawz-compatible orchestration path for hired or delegated agent execution.

## Launch Order

**Phase 1: Agent trust commitment.** Show Vorim runtime decisions becoming signed, portable receipts whose commitments are authorized and settled on Zeko.

**Phase 2: Payment and orchestration.** Add x402 payment context, reserve/release semantics, and Magic City/Santaclawz execution provenance.

**Phase 3: Verifier package.** Ship an offline verifier that reconciles Vorim signed audit, Mission-Bound Auth receipt bundle, x402 payment state, and Zeko settlement state.

## License Boundary

No blanket Apache-2.0 license is asserted for this demo or for the protocol stack it references. Existing protocol implementations keep their own licenses and commercial terms. Confirm ownership and licensing with Vorim, Zeko Labs, and the relevant protocol owners before distributing or productionizing a package. This is a technical packaging recommendation, not legal advice.
