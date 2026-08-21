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
  VorimAiCredentialRegistry,
  VorimMissionAuthorization,
  buildVorimCredential,
  fieldFromString,
  issuerAuthorizationMessage,
  missionAuthorizationMessage
} from "../src/index.js";

describe("VorimAiCredentialRegistry", () => {
  it("anchors a signed Vorim credential and burns its nullifier", async () => {
    const local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(local);
    const [deployer, holder, delegate] = local.testAccounts;
    const issuerKey = PrivateKey.random();
    const zkappKey = PrivateKey.random();
    const zkapp = new VorimAiCredentialRegistry(zkappKey.toPublicKey());
    const registry = new MerkleMap();

    const credential = buildVorimCredential({
      idTokenPayload: {
        iss: "https://connect.vorim.ai",
        aud: "vorim-demo-client",
        sub: "vorim-subject-demo-001",
        external_user_id: "customer-user-123"
      },
      clientId: "vorim-demo-client",
      scope: "zeko:human-liveness:v1",
      appSalt: "test-salt",
      holderKey: holder.key.toPublicKey(),
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
      settlementRecipient: holder.key.toPublicKey(),
      maxAmount: UInt64.from(10_000_000),
      expiresAtSlot: UInt32.from(9),
      missionNullifier: fieldFromString("test-mission-nullifier")
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
      await zkapp.settleMission(mission, settleWitness, fieldFromString("test-result"));
    });
    await settleTx.prove();
    await settleTx.sign([delegate.key]).send();

    assert.equal(zkapp.missionRoot.get().toString(), missionRegistry.getRoot().toString());
    assert.equal(zkapp.lastMissionCommitment.get().toString(), mission.commitment().toString());
  });
});
