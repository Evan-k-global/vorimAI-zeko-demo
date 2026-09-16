# FinFindr POC

This deployment models a FinFindr discovery agent that identifies a private capital-flow opportunity and requests a tightly capped remediation budget. Vorim supplies the agent identity, scoped permissions, runtime decision, and signed action record. The adapter turns the approved action into an MBA receipt plus x402 payment context, then commits only the receipt field on the local Zeko adapter zkApp.

The example intentionally runs the `modify` path by default: the proposed 100,000,000 native-unit cap is reduced to 50,000,000 before the x402 payload is constructed. Private operational data, opportunity identifiers, and notes remain off-chain. The public surface exposes only JCS payload digests, the receipt commitment, and mission state.

```bash
npm run poc:finfindr
npm run poc:finfindr:app
```

Open `http://127.0.0.1:4174` after starting the app. This is a local POC deployment using the repository's `MockVorimClient`, unsigned x402 context, and local adapter zkApp; it does not execute a customer remediation or move funds.
