# Demo To Production

The local demo proves the Vorim decision-to-receipt composition, not a production payment or settlement.

## Keep Private

- Vorim client secrets, agent keys, approval keys, audit signing material, and policy rules.
- Zeko deployer, relayer, holder, verifier, and zkApp private keys.
- x402 payer authorization payloads and facilitator credentials.
- MBA witness stores, salts, private proof inputs, and regulated action contents.
- Magic City session data and SantaClawz private return artifacts.

## Production Gate

Before calling this production, require all of the following:

1. Vorim exposes a supported portable signed-receipt or decision-evidence export.
2. The Vorim decision is mapped into MBA's signed capability and proof-bound public statement.
3. MBA production-strict receipt verification passes with a concrete compliance proof and domain attestation.
4. The canonical Zeko `MissionRegistry` verifies the approval, escrow, revocation absence, nullifier, receipt commitment, and proof before release.
5. x402 authorization is signed after the final Vorim payload and settled through the upstream contract or facilitator.
6. Chain events and account state are read back independently before Vorim emits settlement success.
7. Witness and idempotency state are durable and scoped to the exact deployment.

## Active Chain Profile

Use the pinned upstream Zeko Ethereum Sepolia profile:

```env
ZEKO_PROTOCOL_NETWORK_ID=zeko:sepolia
ZEKO_GRAPHQL_URL=https://sepolia.zeko.io/graphql
ZEKO_ARCHIVE_URL=https://sepolia.zeko.io/graphql
ZEKO_O1JS_NETWORK_ID=testnet
ZEKO_NATIVE_ASSET=sETH
ZEKO_NATIVE_DECIMALS=9
TX_FEE=200000
```

Do not collapse the protocol identifier, GraphQL-reported network ID, and signing domain into one value.

## Orchestration Extensions

Add Magic City only through its real session/checkpoint/proof APIs. Add SantaClawz only through its real discovery, x402 plan, hire, execution, payment-state, and return-package APIs. Do not substitute receipt labels for those integrations.

## Licensing

No blanket Apache-2.0 license is asserted here. The pinned upstream repositories keep their own licenses and commercial terms. Confirm rights and deployment terms with the relevant owners before distribution or production use.
