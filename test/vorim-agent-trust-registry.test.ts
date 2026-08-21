import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
  VorimAgentTrustRegistry,
  VorimMissionAuthorization,
  buildVorimAgentCredential,
  fieldFromString,
  issuerAuthorizationMessage,
  missionAuthorizationMessage
} from "../src/index.js";

describe("VorimAgentTrustRegistry", () => {
  it("anchors a signed Vorim credential and burns its nullifier", async () => {
    const local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(local);
    const [deployer, agent, delegate] = local.testAccounts;
    const issuerKey = PrivateKey.random();
    const zkappKey = PrivateKey.random();
    const zkapp = new VorimAgentTrustRegistry(zkappKey.toPublicKey());
    const registry = new MerkleMap();

    const credential = buildVorimAgentCredential({
      agentAssertion: {
        issuer: "https://api.vorim.ai",
        audience: "vorim-demo-client",
        agentId: "agid_vorim_test_agent_001",
        agentDid: "did:vorim:agent:test-001",
        agentPublicKeyFingerprint: "fp_test_agent_key",
        scopes: ["agent:execute", "agent:transact"]
      },
      clientId: "vorim-demo-client",
      scope: "agent:transact",
      appSalt: "test-salt",
      agentKey: agent.key.toPublicKey(),
      issuedAtSlot: 1n,
      expiresAtSlot: 10n,
      nonce: "test-nonce"
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

    assert.equal(zkapp.registryRoot.get().toString(), registry.getRoot().toString());
    assert.equal(zkapp.lastCredentialCommitment.get().toString(), credential.commitment().toString());

    const missionRegistry = new MerkleMap();
    const mission = new VorimMissionAuthorization({
      credentialCommitment: credential.commitment(),
      delegateKey: delegate.key.toPublicKey(),
      audienceHash: fieldFromString("test-marketplace"),
      actionHash: fieldFromString("buy:compute-credit:10"),
      settlementRecipient: agent.key.toPublicKey(),
      maxAmount: UInt64.from(10_000_000),
      expiresAtSlot: UInt32.from(9),
      missionNullifier: fieldFromString("test-mission-nullifier")
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
      await zkapp.settleMission(mission, settleWitness, fieldFromString("test-result"));
    });
    await settleTx.prove();
    await settleTx.sign([delegate.key]).send();

    assert.equal(zkapp.missionRoot.get().toString(), missionRegistry.getRoot().toString());
    assert.equal(zkapp.lastMissionCommitment.get().toString(), mission.commitment().toString());
  });
});
