# Kent HOA payment escalation POC

This deployment models the concrete Kent HOA candidate: a maintenance agent asks to release a vendor payment associated with private community, work-order, and invoice records. Vorim identifies the agent, checks its scoped authority, escalates the consequential action for human approval, and writes signed action records. The adapter binds the approved action digest to an MBA receipt, x402 payment context, and local Zeko commitment.

The default run is `escalate`. It does not proceed until the mock human-resolution path returns an approval; that binding is recorded as `P-256` to distinguish the human approval from the agent's Ed25519 audit signature. The Zeko-facing state contains no HOA, resident, work-order, invoice, or raw payment payload.

```bash
npm run poc:kent-ai
npm run poc:kent-ai:app
```

Open `http://127.0.0.1:4175` after starting the app. This is a local POC deployment using the repository's `MockVorimClient`, unsigned x402 context, and local adapter zkApp; it does not execute a vendor payment or move funds.

To connect a real Vorim API, database, and branded frontend, follow the shared [turnkey handoff](../../docs/VORIM_TURNKEY_HANDOFF.md).
