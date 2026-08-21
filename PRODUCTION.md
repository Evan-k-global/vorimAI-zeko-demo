# Demo to Production

This repository is the public Zeko integration scaffold for VorimAI. It is designed to make the partnership concrete:

1. Vorim verifies a live human off-chain.
2. Zeko anchors a privacy-preserving credential commitment.
3. A Vorim-verified holder authorizes a narrowly scoped mission for an app, agent, wallet, or marketplace.
4. The delegated key settles that mission once.

The repository is not the Vorim issuer service and is not a substitute for Vorim's production security review.

## Public and private boundary

The following are suitable for a public demo repository, subject to the upstream
licenses and commercial terms of the protocol components it adapts:

- the original o1js zkApp contract;
- commitment and nullifier helpers;
- generic OAuth adapter boundaries;
- demo scripts, tests, and integration documentation.

This repository is not a new protocol and should not represent Agent
Mission-Bound Auth, x402, Magic City, or Santaclawz as Vorim-authored or
Apache-licensed. The adapter uses the existing Mission-Bound Auth names
`zk-mission-bundle-v1`, `mission-bound-auth-receipt-v1`, and `mba-registry-v1`;
records x402 as the payment rail; records Santaclawz as the agent rail; and
treats Magic City as the compatible runtime/orchestration pattern.

Keep the following in Vorim-controlled private infrastructure:

- Vorim OAuth client secrets, JWT signing material, JWKS operations, and KMS keys;
- palm, liveness, biometric, and risk-policy implementation;
- subject mapping, salts, raw OAuth tokens, user records, and operational telemetry;
- production relayer credentials, deployer keys, and archive/indexer infrastructure;
- Vorim trademarks, SDK code, and assets unless Vorim has expressly licensed them.

Do not commit `.env` files, private keys, raw `id_token` values, biometric data, or user identifiers. The testnet deployment in the README uses a provisional issuer and is not a production deployment.

## 1. Reproduce the demo

Use the pinned dependency set and run the local checks:

```bash
npm ci
npm test
npm run demo
PROOFS_ENABLED=true npm run demo
```

For a Zeko testnet deployment, create `.env` from `.env.example`, fund a deployer, and run:

```bash
npm run deploy:zeko
```

Run the smoke script only against a fresh deployment unless you replace its in-memory witness stores with a persisted/indexed witness service:

```bash
ZEKO_ZKAPP_ADDRESS=<fresh-deployment-address> npm run smoke:zeko
```

## 2. Connect the real Vorim flow

Vorim should own the mobile and issuer boundary:

1. Register the production OAuth client, redirect URI, scopes, and mobile application with Vorim.
2. Use the Vorim mobile SDK to complete palm/liveness verification and receive an authorization code.
3. Send the code to a Vorim backend, never to the chain or a public client secret.
4. Exchange the code at `https://api.vorim.ai/oauth2/token`.
5. Validate state, nonce, issuer, audience, expiry, and token type.
6. Verify the `id_token` cryptographic signature against Vorim's published JWKS, or use the agreed authenticated backend flow if Vorim uses an HMAC-signed token.
7. Derive the subject commitment and scoped nullifier with a KMS-held salt. Do not place the subject identifier or salt on-chain.
8. Bind the credential to the holder's Zeko public key and sign the issuer authorization message.

The included `src/vorim-oauth.ts` contains the exchange and claim-shape scaffolding. Its JWT payload decoding is not signature verification. Production code must complete that check before it signs a `VorimAiCredential`.

## 3. Run the two-step issuer flow

The issuer or a trusted relayer should maintain the current credential sequence and Merkle witnesses, then submit:

```text
anchorCredential(credential, issuerSignature, credentialWitness, nullifierWitness)
```

After the holder approves a mission, submit:

```text
authorizeMission(credential, mission, holderSignature, credentialWitness, missionNullifierWitness)
```

The mission should use canonical values for:

- `audienceHash`: the exact destination app, agent, wallet, or marketplace;
- `actionHash`: the exact allowed operation and version;
- `maxAmount`: the maximum amount the mission can settle;
- `expiresAtSlot`: a short, explicit expiry no later than the credential expiry;
- `missionNullifier`: a fresh one-time value;
- `delegateKey`: the agent or application key allowed to settle.

The downstream payment or asset transfer should be implemented in a separate settlement contract or adapter. This registry proves authorization and one-time consumption; it does not custody funds by itself.

## 4. Production deployment checklist

- Create a fresh production zkApp address and record its verification key.
- Use a KMS or hardware-backed Vorim issuer key and separate deployer key.
- Configure the issuer exactly once, then verify the on-chain issuer key and deployment address.
- Pin the o1js version and reproduce the contract build in CI.
- Persist registry and mission Merkle witnesses through an indexer or durable service.
- Serialize sequence updates so two issuer requests cannot sign the same sequence.
- Monitor `credentialAnchored`, `missionAuthorized`, and `missionSettled` events.
- Add alerting for issuer-key rotation, failed proofs, replay attempts, expired missions, and witness-root drift.
- Test invalid issuer signatures, invalid holder signatures, wrong delegates, expired credentials, expired missions, duplicate nullifiers, and repeated settlement.
- Add key rotation and migration procedures before onboarding real users.
- Complete Vorim's security, privacy, legal, and product review.

## 5. Recommended launch order

**Phase 1: Deploy Vorim on Zeko.** Ship the live-human credential anchor and show that no biometric data, OAuth token, or stable subject identifier is exposed on-chain.

**Phase 2: Upgrade with Zeko authorization.** Add mission-bound delegation to the first partner workflow. Market the bounded action, expiry, amount limit, delegate key, and one-time settlement as the native Zeko advantage.

This keeps the initial integration small while giving Vorim a clear reason to make Zeko part of the product story.

## License boundary

No blanket Apache-2.0 license is asserted for this demo or for the protocol
stack it references. Existing protocol implementations keep their own licenses
and commercial terms. The local Agent Mission-Bound Auth source indicates
Business Source License 1.1 with a future Apache-2.0 change license; x402,
Magic City, Santaclawz, Zeko, and Vorim materials may have separate terms.
Confirm ownership and licensing with Vorim, Zeko Labs, and the relevant protocol
owners before distributing or productionizing a package. This is a technical
packaging recommendation, not legal advice.
