# Vorim Turnkey Handoff

This repository is set up so a Vorim team can use its own API, database, and branded frontend without rewriting the mission, receipt, x402, or Zeko integration.

## What stays the same

The integration path remains:

1. Vorim identifies the agent, evaluates the scoped action, and emits signed records.
2. The adapter binds Vorim's stable decision ID and the JCS digests into an MBA receipt and x402 context.
3. The adapter zkApp receives an MBA receipt commitment, not the customer payload.
4. The POC record store keeps only decision identifiers, digests, commitments, and transaction references.

## Switch to Vorim's API

Install the Vorim SDK into the deployment workspace using the version approved by the Vorim team. The supplied adapter reference targets the 3.18.x SDK surface.

```bash
npm install @vorim/sdk@^3.18
```

Set these values in the deployment environment:

```bash
POC_RUNTIME_MODE=vorim-sdk
VORIM_API_KEY=...
VORIM_API_BASE_URL=https://api.vorim.ai
VORIM_SDK_MODULE=@vorim/sdk
```

`src/vorim-sdk-runtime.ts` dynamically loads Vorim's own `createVorim` SDK factory. It does not substitute a hand-written HTTP client. The resulting client is passed directly into the existing `beforeAction`, escalation, and signed `emit` flow.

In SDK mode, the browser removes the simulated allow/modify/escalate controls. The real Vorim control plane supplies the decision; the POC never asks a user interface to invent one.

## Connect a database

`src/poc-record-store.ts` defines `PocRecordStore`. The built-in `JsonlPocRecordStore` is a working local default and writes only this public reconciliation shape:

```ts
type PocRecord = {
  recordedAt: string;
  pocId: string;
  decisionId: string;
  verdict: "allow" | "modify";
  originalPayloadDigest: string;
  effectivePayloadDigest: string;
  receiptCommitment: string;
  localAdapterTransaction: string;
};
```

Replace `createPocRecordStoreFromEnv()` with a Vorim database adapter that implements `append()` and `list()`. Do not store raw HOA, resident, invoice, opportunity, or capital-flow payloads in this POC store. Those stay in Vorim's existing system of record; only digests and reconciliation data cross this boundary.

## Put it behind Vorim's frontend

Each POC server exposes a small frontend-facing contract:

- `GET /api/config` returns the brand name, brand URL, runtime mode, and POC labels.
- `POST /api/run` executes the configured action through Vorim and returns a redacted result.
- `GET /api/records` returns the public reconciliation history from the configured store.

Set the customer-facing labels without editing source:

```bash
POC_BRAND_NAME=Vorim
POC_BRAND_HOME_URL=https://vorim.ai
```

The supplied static pages are intentionally thin. Vorim can replace `pocs/finfindr/public/` or `pocs/kent-ai/public/` with its own product frontend while preserving the three API calls above. Keep the API server-side: never expose `VORIM_API_KEY`, private payloads, or Zeko deployment keys to the browser.

## Map a real customer workflow

Update only the POC definition for the workflow being demonstrated:

- `pocs/finfindr/scenario.ts` maps an opportunity/remediation action.
- `pocs/kent-ai/scenario.ts` maps a Kent HOA maintenance-payment action.

Use stable internal record references in the server-side payload. The adapter computes JCS digests, preserves Vorim's decision binding, and exports only receipt/payment commitments to the Zeko path.

## Production settlement

These POC pages are operational integration shells, not a production payment release. For a production Zeko settlement, retain the existing upstream MBA `MissionRegistry` path: strong holder proof, compliance proof, domain evidence, receipt/nullifier checks, and a real signed x402 payment. See [PRODUCTION.md](../PRODUCTION.md) for those release gates.
