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
  fetchAccount,
  type NetworkId
} from "o1js";

import {
  VorimAgentTrustRegistry,
  VorimMissionAuthorization,
  buildVorimAgentCredential,
  fieldFromString,
  issuerAuthorizationMessage,
  missionAuthorizationMessage
} from "../src/index.js";

const graphQlUrl = process.env.ZEKO_GRAPHQL_URL ?? "https://testnet.zeko.io/graphql";
const archiveUrl = process.env.ZEKO_ARCHIVE_URL ?? "https://archive.testnet.zeko.io/graphql";
const address = process.env.ZEKO_ZKAPP_ADDRESS;
const deployerPrivateKey = process.env.ZEKO_DEPLOYER_PRIVATE_KEY;
const issuerPrivateKey = process.env.VORIM_ISSUER_PRIVATE_KEY;
// Zeko custom-network strings are runtime-supported; this o1js build narrows the TS type.
const zekoO1jsNetworkId = (process.env.ZEKO_O1JS_NETWORK_ID ?? "zeko") as NetworkId;

if (!address || !deployerPrivateKey || !issuerPrivateKey) {
  throw new Error(
    "Set ZEKO_ZKAPP_ADDRESS, ZEKO_DEPLOYER_PRIVATE_KEY, and VORIM_ISSUER_PRIVATE_KEY."
  );
}

Mina.setActiveInstance(
  Mina.Network({
    mina: graphQlUrl,
    archive: archiveUrl,
    networkId: zekoO1jsNetworkId
  })
);

const deployer = PrivateKey.fromBase58(deployerPrivateKey);
const issuer = PrivateKey.fromBase58(issuerPrivateKey);
const agent = PrivateKey.fromBase58(process.env.VORIM_HOLDER_PRIVATE_KEY ?? deployerPrivateKey);
const delegate = PrivateKey.fromBase58(process.env.VORIM_DELEGATE_PRIVATE_KEY ?? deployerPrivateKey);
const zkapp = new VorimAgentTrustRegistry(PublicKey.fromBase58(address));

const zkappAccount = await fetchAccount({ publicKey: zkapp.address }, graphQlUrl);
if (!zkappAccount.account) {
  throw new Error(`Zeko zkApp account lookup failed: ${zkappAccount.error?.statusText ?? "not found"}`);
}

console.log("Compiling VorimAgentTrustRegistry for live smoke...");
await VorimAgentTrustRegistry.compile();

const issuedAtSlot = 0;
const credentialExpiry = 4_000_000_000n;
const missionExpiry = UInt32.from(4_000_000_000);
const nonce = `zeko-smoke-${Date.now()}`;
const credential = buildVorimAgentCredential({
  agentAssertion: {
    issuer: "https://api.vorim.ai",
    audience: "vorim-demo-client",
    agentId: `agid_smoke_${nonce}`,
    agentDid: `did:vorim:agent:${nonce}`,
    agentPublicKeyFingerprint: `fp_${nonce}`,
    runtimeId: "zeko-smoke",
    scopes: ["agent:execute", "agent:transact"],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString()
  },
  clientId: "vorim-demo-client",
  scope: "agent:transact",
  appSalt: "smoke-test-only",
  authContext: { flow: "runtime-decision", controlPlane: "vorim-agent-trust" },
  agentKey: agent.toPublicKey(),
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
  settlementRecipient: agent.toPublicKey(),
  maxAmount: UInt64.from(100_000_000),
  expiresAtSlot: missionExpiry,
  missionNullifier: fieldFromString(`mission-${nonce}`)
});
const credentialWitnessAfterAnchor = registry.getWitness(credential.credentialKey());
const missionWitness = missionRegistry.getWitness(mission.missionKey());
missionRegistry.set(mission.missionKey(), Field(1));
const agentSignature = Signature.create(
  agent,
  missionAuthorizationMessage(zkapp.address, UInt64.zero, mission)
);

const authorizeTx = await Mina.transaction(feePayer, async () => {
  await zkapp.authorizeMission(
    credential,
    credentialWitnessAfterAnchor,
    mission,
    agentSignature,
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
