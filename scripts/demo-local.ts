import "dotenv/config";

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

import {
  EMPTY_MAP_ROOT,
  VorimAgentTrustRegistry,
  VorimMissionAuthorization,
  buildVorimAgentCredential,
  fieldFromString,
  issuerAuthorizationMessage,
  missionAuthorizationMessage
} from "../src/index.js";

const proofsEnabled = process.env.PROOFS_ENABLED === "true";
const local = await Mina.LocalBlockchain({ proofsEnabled });
Mina.setActiveInstance(local);

const [deployer, agent, delegate] = local.testAccounts;
const zkappKey = PrivateKey.random();
const issuerKey = PrivateKey.random();
const zkapp = new VorimAgentTrustRegistry(zkappKey.toPublicKey());

if (proofsEnabled) {
  console.log("Compiling VorimAgentTrustRegistry...");
  await VorimAgentTrustRegistry.compile();
}

const registry = new MerkleMap();
const credential = buildVorimAgentCredential({
  agentAssertion: {
    issuer: "https://api.vorim.ai",
    audience: "vorim-demo-client",
    agentId: "agid_vorim_demo_agent_001",
    agentDid: "did:vorim:agent:demo-001",
    agentPublicKeyFingerprint: "fp_demo_agent_key",
    runtimeId: "local-o1js-demo",
    scopes: ["agent:execute", "agent:transact"],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString()
  },
  clientId: "vorim-demo-client",
  scope: "agent:transact",
  appSalt: "replace-with-kms-held-salt",
  authContext: { flow: "runtime-decision", controlPlane: "vorim-agent-trust" },
  agentKey: agent.key.toPublicKey(),
  issuedAtSlot: 1n,
  expiresAtSlot: 100_000n,
  nonce: "demo-nonce-001"
});

const deployTx = await Mina.transaction(deployer, async () => {
  AccountUpdate.fundNewAccount(deployer);
  await zkapp.deploy();
});
await deployTx.prove();
await deployTx.sign([deployer.key, zkappKey]).send();

const configureTx = await Mina.transaction(deployer, async () => {
  await zkapp.configure(issuerKey.toPublicKey());
});
await configureTx.prove();
await configureTx.sign([deployer.key, zkappKey]).send();

const credentialWitness = registry.getWitness(credential.credentialKey());
registry.set(credential.credentialKey(), credential.commitment());
const nullifierWitness = registry.getWitness(credential.nullifierKey());
registry.set(credential.nullifierKey(), UInt64.one.value);

const sequence = UInt64.zero;
const issuerSignature = Signature.create(
  issuerKey,
  issuerAuthorizationMessage(zkapp.address, sequence, credential)
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

const missionRegistry = new MerkleMap();
const mission = new VorimMissionAuthorization({
  credentialCommitment: credential.commitment(),
  delegateKey: delegate.key.toPublicKey(),
  audienceHash: fieldFromString("vorim-demo-marketplace"),
  actionHash: fieldFromString("purchase:compute-credit:100"),
  settlementRecipient: agent.key.toPublicKey(),
  maxAmount: UInt64.from(100_000_000),
  expiresAtSlot: UInt32.from(90_000),
  missionNullifier: fieldFromString("demo-mission-nullifier-001")
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

const settleWitness = missionRegistry.getWitness(mission.missionKey());
missionRegistry.set(mission.missionKey(), Field(2));
const settleTx = await Mina.transaction(delegate, async () => {
  await zkapp.settleMission(mission, settleWitness, fieldFromString("demo-settlement-result"));
});
await settleTx.prove();
await settleTx.sign([delegate.key]).send();

console.log(JSON.stringify({
  zkappAddress: zkapp.address.toBase58(),
  issuerPublicKey: issuerKey.toPublicKey().toBase58(),
  registryRoot: zkapp.registryRoot.get().toString(),
  expectedRegistryRoot: registry.getRoot().toString(),
  missionRoot: zkapp.missionRoot.get().toString(),
  expectedMissionRoot: missionRegistry.getRoot().toString(),
  emptyRoot: EMPTY_MAP_ROOT.toString(),
  credentialCommitment: credential.commitment().toString(),
  missionCommitment: mission.commitment().toString(),
  agentCommitment: credential.agentCommitment.toString(),
  nullifier: credential.nullifier.toString()
}, null, 2));
