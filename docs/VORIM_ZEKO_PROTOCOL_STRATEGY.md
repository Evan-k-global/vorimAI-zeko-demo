# Vorim x Zeko Protocol Strategy And POC Announcement

## Positioning

Zeko is the independent evidence and settlement layer for Vorim's trusted-agent system.

Vorim governs consequential agent actions before they happen. It establishes the agent's cryptographic identity, enforces its scoped authority at runtime, records policy modifications and escalations, and issues a signed portable receipt for an authorized action.

Zeko closes the loop when that action matters outside Vorim's own environment. It commits a privacy-preserving representation of Vorim's signed receipt into the settlement evidence path, creating durable evidence that customers, auditors, counterparties, and regulators can reconcile independently.

This matters when an agent moves money, approves a claim, changes an operational record, or triggers another consequential workflow. A vendor log alone is not sufficient when a third party must establish that the settled outcome corresponds to the authorization that actually occurred.

## System Roles

| Layer | Role |
| --- | --- |
| Vorim | Identifies the agent, evaluates its authority, applies policy, handles escalation, and signs the portable action receipt. |
| Mission-Bound Auth | Packages the evidence into a portable mission record and provides the canonical mission and settlement model. |
| Zeko | Anchors the evidence commitment and connects it to the settlement path without publishing customer payloads. |
| x402 | Carries the payment context derived from the action Vorim actually approved. |

The combined system is:

> Agent identity -> Vorim authorization -> signed portable receipt -> MBA evidence record -> Zeko commitment -> settlement reconciliation

Vorim governs the agent. Vorim signs the evidence. MBA packages the evidence. Zeko anchors the commitment and links it to settlement.

## What This Unlocks

Together, Vorim and Zeko enable provable agent actions with independently reconcilable outcomes.

Customers can establish:

- the specific agent that acted;
- the authority and policy decision behind the action;
- any policy modification or escalation;
- the signed receipt recording the decision; and
- the commitment tied to the resulting settlement, without exposing prompts, customer records, policy payloads, or personal data on-chain.

This gives Vorim a stronger regulated-industry offering: agent identity, runtime control, signed evidence, and a durable settlement-linked record for workflows in which the outcome must stand up to external scrutiny.

## What The POC Does Now

The POC demonstrates the evidence flow end to end for FinFindr and Kent AI.

1. Vorim evaluates the proposed action before execution.
2. The adapter fails closed on denial, fallback, unresolved escalation, and escalation timeout.
3. Vorim issues a portable signed receipt for the approved action, including a real signed approval attestation when escalation resolves.
4. The adapter verifies that the portable receipt matches the resolved decision and approved effective payload, then verifies its digest using Vorim's canonical-byte export.
5. The portable-receipt digest is bound into the MBA evidence statement.
6. The pinned x402 implementation builds a payment context from the effective action, not the original proposal.
7. The MBA receipt is committed through the local Zeko adapter zkApp.
8. A settlement record is emitted back to Vorim only when the observed commitment matches the expected commitment.

The FinFindr POC demonstrates a policy-modified operating action. The Kent AI POC demonstrates a consequential maintenance settlement that pauses for a separately signed approval attestation.

The POC uses a local adapter zkApp and an unsigned x402 context. It demonstrates the exact evidence handoff and reconciliation model; it does not yet execute a live production payment or use the canonical MBA proof and registry settlement path.

## V2 Production Path

V2 turns the demonstrated evidence handoff into a production settlement and proof system.

- Add a named Vorim portable-receipt commitment to MBA's public input and commitment equations.
- Bind that commitment through the canonical MBA `MissionComplianceProgram` and `MissionRegistry` proof and settlement path.
- Use real signed x402 payment execution, durable witnesses, and Zeko chain readback.
- Verify Vorim receipt and approval signatures independently against Vorim's published trust keys.
- Retain the complete signed receipt off-chain while anchoring only its privacy-preserving commitment.

The production claim is then precise: the settled Zeko evidence is independently reconcilable with the signed Vorim authorization. The zkApp must not be described as verifying Vorim's Ed25519 signature until the proof circuit actually does so.

## Public Narrative Guardrails

Use these statements:

- "Vorim governs the agent action; Zeko anchors settlement-linked evidence."
- "The system creates a privacy-preserving commitment to Vorim's signed receipt, not a public copy of customer data."
- "Customers can reconcile an authorized agent action with its settlement outcome."
- "The POC demonstrates the evidence flow; the production path adds canonical MBA proof and live settlement."

Do not use these statements:

- "Zeko verifies Vorim's signature on-chain."
- "The blockchain authorizes the agent."
- "Customer payloads or personal data are stored on-chain."
- "The POC is a live production settlement deployment."

Public claims and dependency licensing language should be mutually reviewed before an announcement. Do not describe the pinned BUSL-licensed dependencies as Apache-licensed or broadly open source without legal approval.

## Announcement Draft

# Vorim x Zeko: From Trusted AI Agents To Provable Outcomes

AI agents are beginning to act on real operational and financial workflows. That creates a new standard: it is no longer enough to know that an agent produced an answer. Organizations need to prove which agent acted, what it was authorized to do, how policy affected the action, and whether the final outcome matched that authorization.

That is what the Vorim x Zeko proof of concept demonstrates.

Vorim governs every consequential agent action before it happens. It provides cryptographic agent identity, scoped permissions, runtime policy enforcement, escalation controls, and a signed portable receipt for the action that was authorized.

Zeko extends that trust record into the settlement path. A privacy-preserving commitment to the Vorim receipt is bound into the evidence flow, creating a durable point of reconciliation between the approved action and its outcome. Customer records, prompts, policy payloads, and personal information remain private.

The result is a complete evidence chain:

> Agent identity -> Vorim authorization -> signed portable receipt -> Zeko commitment -> settlement reconciliation

For FinFindr, the POC shows a discovery agent whose proposed operating action is modified by policy before execution. For Kent AI, it shows a maintenance agent whose consequential payment request is escalated, approved through a signed attestation, and bound to the resulting evidence record.

This is what regulated AI needs: agents that can act, controls that hold at runtime, and evidence that stands up when the action is questioned later.

The current release is a proof of concept. It demonstrates the complete evidence handoff and reconciliation model; the production path adds canonical MBA proof and live Zeko settlement.

## Short Social Post

Vorim and Zeko have completed a proof of concept for provable AI-agent outcomes.

Vorim establishes which agent acted, what it was authorized to do, how policy changed the action, and produces a signed portable receipt. Zeko binds a privacy-preserving commitment to that receipt into the settlement evidence path.

The result is a durable, independently reconcilable record from agent authorization to settlement, without exposing customer records or payloads.

The POC covers FinFindr's policy-modified operating action and Kent AI's escalated maintenance settlement.

Agent identity -> Vorim authorization -> signed receipt -> Zeko commitment -> settlement reconciliation.
