# FinFindr POC

This deployment models a FinFindr discovery agent acting on a private operating opportunity. Vorim gives the agent a cryptographic identity, enforces a scoped remediation permission at runtime, and issues a signed action record the client can verify independently. The adapter carries that evidence into an MBA receipt plus x402 payment context, then commits only the receipt field on the local Zeko adapter zkApp.

The example intentionally runs the `modify` path by default: the proposed 100,000,000 native-unit cap is reduced to 50,000,000 before the x402 payload is constructed. That makes the point visible: the recorded action is the action Vorim approved, not the agent's original request. Private operational data, opportunity identifiers, and notes remain off-chain. The public surface exposes only JCS payload digests, the receipt commitment, and mission state.

```bash
npm run poc:finfindr
npm run poc:finfindr:app
```

Open `http://127.0.0.1:4174` after starting the app. This is a local POC deployment using the repository's `MockVorimClient`, unsigned x402 context, and local adapter zkApp; it does not execute a customer remediation or move funds.

To connect a real Vorim API, database, and branded frontend, follow the shared [turnkey handoff](../../docs/VORIM_TURNKEY_HANDOFF.md).
