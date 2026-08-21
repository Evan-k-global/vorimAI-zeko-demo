import "dotenv/config";

import {
  Field,
  MerkleMap,
  Mina,
  PrivateKey,
  PublicKey,
  Signature,
  UInt32,
  UInt64,
  fetchAccount
} from "o1js";

import {
  VorimAiCredentialRegistry,
  VorimMissionAuthorization,
  buildVorimCredential,
  fieldFromString,
  issuerAuthorizationMessage,
  missionAuthorizationMessage
} from "../src/index.js";

const graphQlUrl = process.env.ZEKO_GRAPHQL_URL ?? "https://testnet.zeko.io/graphql";
const archiveUrl = process.env.ZEKO_ARCHIVE_URL ?? "https://archive.testnet.zeko.io/graphql";
const address = process.env.ZEKO_ZKAPP_ADDRESS;
const deployerPrivateKey = process.env.ZEKO_DEPLOYER_PRIVATE_KEY;
const issuerPrivateKey = process.env.VORIM_ISSUER_PRIVATE_KEY;

if (!address || !deployerPrivateKey || !issuerPrivateKey) {
  throw new Error(
    "Set ZEKO_ZKAPP_ADDRESS, ZEKO_DEPLOYER_PRIVATE_KEY, and VORIM_ISSUER_PRIVATE_KEY."
  );
}

Mina.setActiveInstance(
  Mina.Network({ mina: graphQlUrl, archive: archiveUrl, networkId: "testnet" })
);

const deployer = PrivateKey.fromBase58(deployerPrivateKey);
const issuer = PrivateKey.fromBase58(issuerPrivateKey);
const holder = PrivateKey.fromBase58(process.env.VORIM_HOLDER_PRIVATE_KEY ?? deployerPrivateKey);
const delegate = PrivateKey.fromBase58(process.env.VORIM_DELEGATE_PRIVATE_KEY ?? deployerPrivateKey);
const zkapp = new VorimAiCredentialRegistry(PublicKey.fromBase58(address));

const zkappAccount = await fetchAccount({ publicKey: zkapp.address }, graphQlUrl);
if (!zkappAccount.account) {
  throw new Error(`Zeko zkApp account lookup failed: ${zkappAccount.error?.statusText ?? "not found"}`);
}

console.log("Compiling VorimAiCredentialRegistry for live smoke...");
await VorimAiCredentialRegistry.compile();

const issuedAtSlot = 0;
const credentialExpiry = 4_000_000_000n;
const missionExpiry = UInt32.from(4_000_000_000);
const nonce = `zeko-smoke-${Date.now()}`;
const credential = buildVorimCredential({
  idTokenPayload: {
    iss: "https://connect.vorim.ai",
    aud: "vorim-demo-client",
    sub: `smoke-subject-${nonce}`,
    external_user_id: `smoke-user-${nonce}`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  },
  clientId: "vorim-demo-client",
  scope: "zeko:human-liveness:v1",
  appSalt: "smoke-test-only",
  authContext: { flow: "oauth-code", assurance: "palm-liveness" },
  holderKey: holder.toPublicKey(),
  issuedAtSlot: BigInt(issuedAtSlot),
  expiresAtSlot: credentialExpiry,
  nonce
});

const registry = new MerkleMap();
const credentialWitness = registry.getWitness(credential.credentialKey());
registry.set(credential.credentialKey(), credential.commitment());
const nullifierWitness = registry.getWitness(credential.nullifierKey());
registry.set(credential.nullifierKey(), Field(1));
const issuerSignature = Signature.create(
  issuer,
  issuerAuthorizationMessage(zkapp.address, UInt64.zero, credential)
);

const feePayer = { sender: deployer.toPublicKey(), fee: 100_000_000 };

const anchorTx = await Mina.transaction(feePayer, async () => {
  await zkapp.anchorCredential(credential, issuerSignature, credentialWitness, nullifierWitness);
});
await anchorTx.prove();
await anchorTx.sign([deployer]).send();

const missionRegistry = new MerkleMap();
const mission = new VorimMissionAuthorization({
  credentialCommitment: credential.commitment(),
  delegateKey: delegate.toPublicKey(),
  audienceHash: fieldFromString("vorim-demo-marketplace"),
  actionHash: fieldFromString("purchase:compute-credit:100"),
  settlementRecipient: holder.toPublicKey(),
  maxAmount: UInt64.from(100_000_000),
  expiresAtSlot: missionExpiry,
  missionNullifier: fieldFromString(`mission-${nonce}`)
});
const credentialWitnessAfterAnchor = registry.getWitness(credential.credentialKey());
const missionWitness = missionRegistry.getWitness(mission.missionKey());
missionRegistry.set(mission.missionKey(), Field(1));
const holderSignature = Signature.create(
  holder,
  missionAuthorizationMessage(zkapp.address, UInt64.zero, mission)
);

const authorizeTx = await Mina.transaction(feePayer, async () => {
  await zkapp.authorizeMission(
    credential,
    credentialWitnessAfterAnchor,
    mission,
    holderSignature,
    missionWitness
  );
});
await authorizeTx.prove();
await authorizeTx.sign([deployer]).send();

const settleWitness = missionRegistry.getWitness(mission.missionKey());
missionRegistry.set(mission.missionKey(), Field(2));
const settleTx = await Mina.transaction(
  { sender: delegate.toPublicKey(), fee: 100_000_000 },
  async () => {
    await zkapp.settleMission(mission, settleWitness, fieldFromString(`result-${nonce}`));
  }
);
await settleTx.prove();
await settleTx.sign([delegate]).send();

console.log(JSON.stringify({
  zkappAddress: address,
  graphQlUrl,
  issuedAtSlot,
  step1: {
    credentialCommitment: credential.commitment().toString(),
    registryRoot: registry.getRoot().toString()
  },
  step2: {
    missionCommitment: mission.commitment().toString(),
    missionRoot: missionRegistry.getRoot().toString()
  }
}, null, 2));
