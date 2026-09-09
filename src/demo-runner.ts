import {
  AccountUpdate,
  Field,
  MerkleMap,
  Mina,
  PrivateKey,
  Signature,
  UInt32,
  UInt64
} from "o1js";
import { type X402PaymentPayload } from "zeko-x402";

import {
  EMPTY_MAP_ROOT,
  VorimAgentTrustRegistry,
  VorimMissionAuthorization,
  buildVorimAgentCredential,
  fieldFromString,
  issuerAuthorizationMessage,
  missionAuthorizationMessage
} from "./index.js";
import { MockVorimClient, type MockVorimAuditEvent, type MockVorimScenario } from "./mock-vorim.js";
import {
  authorizeZekoAction,
  recordZekoSettlement,
  type AuthorizeZekoActionResult
} from "./vorim-zeko-adapter.js";

export type VorimZekoDemoResult = {
  scenario: MockVorimScenario;
  status: "settled";
  zkappAddress: string;
  issuerPublicKey: string;
  agentPublicKey: string;
  delegatePublicKey: string;
  credentialCommitment: string;
  receiptCommitment: string;
  receiptCommitmentHex: string;
  missionCommitment: string;
  registryRoot: string;
  expectedRegistryRoot: string;
  missionRoot: string;
  expectedMissionRoot: string;
  emptyRoot: string;
  decisionId: string;
  originalIntentHash: string;
  effectiveIntentHash: string;
  effectivePayload: Record<string, unknown>;
  receipt: AuthorizeZekoActionResult["receipt"];
  vorimBinding: AuthorizeZekoActionResult["vorimBinding"];
  receiptCanonicalJson: string;
  x402Payment: X402PaymentPayload;
  simulatedTxHash: string;
  auditEvents: MockVorimAuditEvent[];
  timeline: Array<{ label: string; detail: string }>;
};

export type RunVorimZekoDemoOptions = {
  scenario?: MockVorimScenario;
  proofsEnabled?: boolean;
};

export async function runVorimZekoDemo({
  scenario = "allow",
  proofsEnabled = false
}: RunVorimZekoDemoOptions = {}): Promise<VorimZekoDemoResult> {
  const vorim = new MockVorimClient(scenario);
  const local = await Mina.LocalBlockchain({ proofsEnabled });
  Mina.setActiveInstance(local);

  const [deployer, agent, delegate] = local.testAccounts;
  const zkappKey = PrivateKey.random();
  const issuerKey = PrivateKey.random();
  const zkapp = new VorimAgentTrustRegistry(zkappKey.toPublicKey());
  const timeline: VorimZekoDemoResult["timeline"] = [];

  if (proofsEnabled) {
    await VorimAgentTrustRegistry.compile();
  }

  const deployTx = await Mina.transaction(deployer, async () => {
    AccountUpdate.fundNewAccount(deployer);
    await zkapp.deploy();
  });
  await deployTx.prove();
  await deployTx.sign([deployer.key, zkappKey]).send();
  timeline.push({ label: "Zeko zkApp deployed", detail: zkapp.address.toBase58() });

  const configureTx = await Mina.transaction(deployer, async () => {
    await zkapp.configure(issuerKey.toPublicKey());
  });
  await configureTx.prove();
  await configureTx.sign([deployer.key, zkappKey]).send();
  timeline.push({ label: "Issuer configured", detail: issuerKey.toPublicKey().toBase58() });

  const registry = new MerkleMap();
  const credential = buildVorimAgentCredential({
    agentAssertion: {
      issuer: "https://api.vorim.ai",
      audience: "vorim-demo-client",
      agentId: "agid_vorim_demo_agent_001",
      agentDid: "did:vorim:agent:demo-001",
      agentPublicKeyFingerprint: "fp_demo_agent_key",
      runtimeId: "vorim-local-adapter",
      scopes: ["agent:execute", "agent:transact"],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString()
    },
    clientId: "vorim-demo-client",
    scope: "agent:transact",
    appSalt: "demo-kms-held-salt",
    authContext: { flow: "runtime-decision", controlPlane: "vorim-agent-trust" },
    agentKey: agent.key.toPublicKey(),
    issuedAtSlot: 1n,
    expiresAtSlot: 100_000n,
    nonce: "demo-nonce-001"
  });

  const credentialWitness = registry.getWitness(credential.credentialKey());
  registry.set(credential.credentialKey(), credential.commitment());
  const nullifierWitness = registry.getWitness(credential.nullifierKey());
  registry.set(credential.nullifierKey(), UInt64.one.value);
  const issuerSignature = Signature.create(
    issuerKey,
    issuerAuthorizationMessage(zkapp.address, UInt64.zero, credential)
  );

  const anchorTx = await Mina.transaction(deployer, async () => {
    await zkapp.anchorCredential(
      credential,
      issuerSignature,
      credentialWitness,
      nullifierWitness
    );
  });
  await anchorTx.prove();
  await anchorTx.sign([deployer.key]).send();
  timeline.push({
    label: "Credential anchored",
    detail: credential.commitment().toString()
  });

  const actionPayload = {
    action: "purchase_compute_credit",
    amountNativeUnits: 100_000_000,
    marketplace: "vorim-demo-marketplace",
    memo: "user supplied payment memo"
  };
  const x402PaymentTemplate = {
    requestId: `x402req-vorim-${scenario}`,
    paymentId: `x402pay-vorim-${scenario}`,
    settlementRail: "zeko",
    networkId: "zeko:sepolia",
    asset: { symbol: "sETH", decimals: 9, standard: "native" },
    payer: agent.key.toPublicKey().toBase58(),
    payTo: delegate.key.toPublicKey().toBase58(),
    sessionId: `vorim-demo-${scenario}`,
    maxSpendUsd: "1.00",
    idempotencyKey: `vorim-demo-${scenario}-0001`
  } as const;
  const authorization = await authorizeZekoAction(vorim, {
    agentId: "agid_vorim_demo_agent_001",
    protocolNetworkId: "zeko:sepolia",
    zkappAddress: zkapp.address.toBase58(),
    method: "settleMission",
    payload: actionPayload,
    payment: x402PaymentTemplate,
    requiredScope: "agent:transact",
    idempotencyKey: `demo:${scenario}`
  });
  timeline.push({
    label: "Vorim runtime decision",
    detail: `${authorization.vorimBinding.verdict} ${authorization.decisionId}`
  });

  const missionRegistry = new MerkleMap();
  const mission = new VorimMissionAuthorization({
    credentialCommitment: credential.commitment(),
    delegateKey: delegate.key.toPublicKey(),
    audienceHash: fieldFromString("vorim-demo-marketplace"),
    actionHash: authorization.receiptCommitment,
    settlementRecipient: agent.key.toPublicKey(),
    maxAmount: UInt64.from(
      typeof authorization.effectivePayload.amountNativeUnits === "number"
        ? authorization.effectivePayload.amountNativeUnits
        : 100_000_000
    ),
    expiresAtSlot: UInt32.from(90_000),
    missionNullifier: fieldFromString(`mission:${authorization.decisionId}`)
  });

  const credentialWitnessAfterAnchor = registry.getWitness(credential.credentialKey());
  const missionWitness = missionRegistry.getWitness(mission.missionKey());
  missionRegistry.set(mission.missionKey(), Field(1));
  const agentSignature = Signature.create(
    agent.key,
    missionAuthorizationMessage(zkapp.address, UInt64.zero, mission)
  );

  const authorizeTx = await Mina.transaction(deployer, async () => {
    await zkapp.authorizeMission(
      credential,
      credentialWitnessAfterAnchor,
      mission,
      agentSignature,
      missionWitness
    );
  });
  await authorizeTx.prove();
  await authorizeTx.sign([deployer.key]).send();
  timeline.push({ label: "Mission authorized", detail: mission.commitment().toString() });

  const settleWitness = missionRegistry.getWitness(mission.missionKey());
  missionRegistry.set(mission.missionKey(), Field(2));
  const settleTx = await Mina.transaction(delegate, async () => {
    await zkapp.settleMission(mission, settleWitness, authorization.receiptCommitment);
  });
  await settleTx.prove();
  await settleTx.sign([delegate.key]).send();
  const simulatedTxHash = `local-zkapp-tx-${authorization.receiptCommitmentHex.slice(2, 18)}`;
  timeline.push({ label: "Mission settled", detail: simulatedTxHash });

  await recordZekoSettlement(vorim, {
    agentId: authorization.vorimBinding.agentId,
    decisionId: authorization.decisionId,
    receiptCommitment: authorization.receiptCommitmentDecimal,
    observedReceiptCommitment: authorization.receiptCommitmentDecimal,
    txHash: simulatedTxHash,
    settlementSequence: "2",
    settledRoot: missionRegistry.getRoot().toString()
  });
  timeline.push({ label: "Vorim settlement audit emitted", detail: authorization.decisionId });

  return {
    scenario,
    status: "settled",
    zkappAddress: zkapp.address.toBase58(),
    issuerPublicKey: issuerKey.toPublicKey().toBase58(),
    agentPublicKey: agent.key.toPublicKey().toBase58(),
    delegatePublicKey: delegate.key.toPublicKey().toBase58(),
    credentialCommitment: credential.commitment().toString(),
    receiptCommitment: authorization.receiptCommitmentDecimal,
    receiptCommitmentHex: authorization.receiptCommitmentHex,
    missionCommitment: mission.commitment().toString(),
    registryRoot: zkapp.registryRoot.get().toString(),
    expectedRegistryRoot: registry.getRoot().toString(),
    missionRoot: zkapp.missionRoot.get().toString(),
    expectedMissionRoot: missionRegistry.getRoot().toString(),
    emptyRoot: EMPTY_MAP_ROOT.toString(),
    decisionId: authorization.decisionId,
    originalIntentHash: authorization.originalIntentHash,
    effectiveIntentHash: authorization.effectiveIntentHash,
    effectivePayload: authorization.effectivePayload,
    receipt: authorization.receipt,
    vorimBinding: authorization.vorimBinding,
    receiptCanonicalJson: authorization.receiptCanonicalJson,
    x402Payment: authorization.payment,
    simulatedTxHash,
    auditEvents: vorim.auditEvents,
    timeline
  };
}
