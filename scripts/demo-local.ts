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
  VorimAiCredentialRegistry,
  VorimMissionAuthorization,
  buildVorimCredential,
  fieldFromString,
  issuerAuthorizationMessage,
  missionAuthorizationMessage
} from "../src/index.js";

const proofsEnabled = process.env.PROOFS_ENABLED === "true";
const local = await Mina.LocalBlockchain({ proofsEnabled });
Mina.setActiveInstance(local);

const [deployer, holder, delegate] = local.testAccounts;
const zkappKey = PrivateKey.random();
const issuerKey = PrivateKey.random();
const zkapp = new VorimAiCredentialRegistry(zkappKey.toPublicKey());

if (proofsEnabled) {
  console.log("Compiling VorimAiCredentialRegistry...");
  await VorimAiCredentialRegistry.compile();
}

const registry = new MerkleMap();
const credential = buildVorimCredential({
  idTokenPayload: {
    iss: "https://connect.vorim.ai",
    aud: "vorim-demo-client",
    sub: "vorim-subject-demo-001",
    external_user_id: "customer-user-123",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  },
  clientId: "vorim-demo-client",
  scope: "zeko:human-liveness:v1",
  appSalt: "replace-with-kms-held-salt",
  authContext: { flow: "oauth-code", assurance: "palm-liveness" },
  holderKey: holder.key.toPublicKey(),
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
  settlementRecipient: holder.key.toPublicKey(),
  maxAmount: UInt64.from(100_000_000),
  expiresAtSlot: UInt32.from(90_000),
  missionNullifier: fieldFromString("demo-mission-nullifier-001")
});

const credentialWitnessAfterAnchor = registry.getWitness(credential.credentialKey());
const missionWitness = missionRegistry.getWitness(mission.missionKey());
missionRegistry.set(mission.missionKey(), Field(1));
const holderSignature = Signature.create(
  holder.key,
  missionAuthorizationMessage(zkapp.address, UInt64.zero, mission)
);

const authorizeTx = await Mina.transaction(deployer, async () => {
  await zkapp.authorizeMission(
    credential,
    credentialWitnessAfterAnchor,
    mission,
    holderSignature,
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
  subjectCommitment: credential.subjectCommitment.toString(),
  nullifier: credential.nullifier.toString()
}, null, 2));
