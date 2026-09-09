import "reflect-metadata";

import {
  Field,
  MerkleMap,
  MerkleMapWitness,
  Permissions,
  Poseidon,
  PublicKey,
  Signature,
  SmartContract,
  State,
  Struct,
  UInt32,
  UInt64,
  method,
  state
} from "o1js";

export const EMPTY_MAP_ROOT = new MerkleMap().getRoot();

const CREDENTIAL_NAMESPACE = Field(7_001);
const NULLIFIER_NAMESPACE = Field(7_002);
const ISSUER_AUTHORIZATION_NAMESPACE = Field(7_003);
const MISSION_NAMESPACE = Field(7_004);
const MISSION_AUTHORIZATION_NAMESPACE = Field(7_005);

export class VorimAgentCredential extends Struct({
  agentCommitment: Field,
  clientIdHash: Field,
  authContextHash: Field,
  scopeHash: Field,
  agentKey: PublicKey,
  issuedAtSlot: UInt64,
  expiresAtSlot: UInt64,
  nullifier: Field
}) {
  fields(): Field[] {
    return [
      this.agentCommitment,
      this.clientIdHash,
      this.authContextHash,
      this.scopeHash,
      ...this.agentKey.toFields(),
      this.issuedAtSlot.value,
      this.expiresAtSlot.value,
      this.nullifier
    ];
  }

  commitment(): Field {
    return Poseidon.hash(this.fields());
  }

  credentialKey(): Field {
    return Poseidon.hash([CREDENTIAL_NAMESPACE, this.agentCommitment, this.scopeHash]);
  }

  nullifierKey(): Field {
    return Poseidon.hash([NULLIFIER_NAMESPACE, this.nullifier]);
  }
}

export class VorimMissionAuthorization extends Struct({
  credentialCommitment: Field,
  delegateKey: PublicKey,
  audienceHash: Field,
  actionHash: Field,
  settlementRecipient: PublicKey,
  maxAmount: UInt64,
  expiresAtSlot: UInt32,
  missionNullifier: Field
}) {
  fields(): Field[] {
    return [
      this.credentialCommitment,
      ...this.delegateKey.toFields(),
      this.audienceHash,
      this.actionHash,
      ...this.settlementRecipient.toFields(),
      this.maxAmount.value,
      this.expiresAtSlot.value,
      this.missionNullifier
    ];
  }

  commitment(): Field {
    return Poseidon.hash([MISSION_NAMESPACE, ...this.fields()]);
  }

  missionKey(): Field {
    return Poseidon.hash([MISSION_NAMESPACE, this.missionNullifier]);
  }
}

export class VorimAgentCredentialAnchoredEvent extends Struct({
  credentialCommitment: Field,
  agentCommitment: Field,
  scopeHash: Field,
  nullifier: Field,
  registryRoot: Field,
  sequence: UInt64
}) {}

export class VorimMissionAuthorizedEvent extends Struct({
  missionCommitment: Field,
  credentialCommitment: Field,
  delegateKey: PublicKey,
  audienceHash: Field,
  actionHash: Field,
  maxAmount: UInt64,
  expiresAtSlot: UInt32,
  missionNullifier: Field,
  missionRoot: Field,
  sequence: UInt64
}) {}

export class VorimMissionSettledEvent extends Struct({
  missionCommitment: Field,
  resultHash: Field,
  settlementRecipient: PublicKey,
  missionRoot: Field
}) {}

export function issuerAuthorizationMessage(
  registryAddress: PublicKey,
  sequence: UInt64,
  credential: VorimAgentCredential
): Field[] {
  return [
    ISSUER_AUTHORIZATION_NAMESPACE,
    ...registryAddress.toFields(),
    sequence.value,
    ...credential.fields()
  ];
}

export function missionAuthorizationMessage(
  registryAddress: PublicKey,
  sequence: UInt64,
  mission: VorimMissionAuthorization
): Field[] {
  return [
    MISSION_AUTHORIZATION_NAMESPACE,
    ...registryAddress.toFields(),
    sequence.value,
    ...mission.fields()
  ];
}

export class VorimAgentTrustRegistry extends SmartContract {
  @state(PublicKey) issuerKey = State<PublicKey>();
  @state(Field) registryRoot = State<Field>();
  @state(UInt64) sequence = State<UInt64>();
  @state(Field) lastCredentialCommitment = State<Field>();
  @state(Field) missionRoot = State<Field>();
  @state(UInt64) missionSequence = State<UInt64>();
  @state(Field) lastMissionCommitment = State<Field>();

  events = {
    credentialAnchored: VorimAgentCredentialAnchoredEvent,
    missionAuthorized: VorimMissionAuthorizedEvent,
    missionSettled: VorimMissionSettledEvent
  };

  init() {
    super.init();
    this.issuerKey.set(PublicKey.empty());
    this.registryRoot.set(EMPTY_MAP_ROOT);
    this.sequence.set(UInt64.zero);
    this.lastCredentialCommitment.set(Field(0));
    this.missionRoot.set(EMPTY_MAP_ROOT);
    this.missionSequence.set(UInt64.zero);
    this.lastMissionCommitment.set(Field(0));
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      setPermissions: Permissions.signature()
    });
  }

  @method async configure(issuerKey: PublicKey) {
    this.requireSignature();
    const currentIssuer = this.issuerKey.getAndRequireEquals();
    currentIssuer.isEmpty().assertTrue("registry_already_configured");
    issuerKey.isEmpty().assertFalse("issuer_key_required");
    this.issuerKey.set(issuerKey);
  }

  @method async anchorCredential(
    credential: VorimAgentCredential,
    issuerSignature: Signature,
    credentialWitness: MerkleMapWitness,
    nullifierWitness: MerkleMapWitness
  ) {
    const issuerKey = this.issuerKey.getAndRequireEquals();
    const currentRoot = this.registryRoot.getAndRequireEquals();
    const sequence = this.sequence.getAndRequireEquals();

    issuerKey.isEmpty().assertFalse("registry_not_configured");
    credential.agentCommitment.assertNotEquals(Field(0));
    credential.nullifier.assertNotEquals(Field(0));
    credential.expiresAtSlot.value.assertGreaterThan(
      credential.issuedAtSlot.value,
      "credential_expiry_must_follow_issuance"
    );

    issuerSignature
      .verify(issuerKey, issuerAuthorizationMessage(this.address, sequence, credential))
      .assertTrue("invalid_vorim_issuer_signature");

    const credentialCommitment = credential.commitment();
    const [credentialRootBefore, credentialKey] =
      credentialWitness.computeRootAndKey(Field(0));
    credentialRootBefore.assertEquals(currentRoot);
    credentialKey.assertEquals(credential.credentialKey());
    const [credentialRootAfter] =
      credentialWitness.computeRootAndKey(credentialCommitment);

    const [nullifierRootBefore, nullifierKey] =
      nullifierWitness.computeRootAndKey(Field(0));
    nullifierRootBefore.assertEquals(credentialRootAfter);
    nullifierKey.assertEquals(credential.nullifierKey());
    const [nullifierRootAfter] = nullifierWitness.computeRootAndKey(Field(1));
    const nextSequence = sequence.add(1);

    this.registryRoot.set(nullifierRootAfter);
    this.sequence.set(nextSequence);
    this.lastCredentialCommitment.set(credentialCommitment);
    this.emitEvent(
      "credentialAnchored",
      new VorimAgentCredentialAnchoredEvent({
        credentialCommitment,
        agentCommitment: credential.agentCommitment,
        scopeHash: credential.scopeHash,
        nullifier: credential.nullifier,
        registryRoot: nullifierRootAfter,
        sequence: nextSequence
      })
    );
  }

  @method async authorizeMission(
    credential: VorimAgentCredential,
    credentialWitness: MerkleMapWitness,
    mission: VorimMissionAuthorization,
    agentSignature: Signature,
    missionWitness: MerkleMapWitness
  ) {
    const registryRoot = this.registryRoot.getAndRequireEquals();
    const currentMissionRoot = this.missionRoot.getAndRequireEquals();
    const missionSequence = this.missionSequence.getAndRequireEquals();

    credential.agentKey.isEmpty().assertFalse("agent_key_required");
    mission.delegateKey.isEmpty().assertFalse("delegate_key_required");
    mission.settlementRecipient.isEmpty().assertFalse("settlement_recipient_required");
    mission.missionNullifier.assertNotEquals(Field(0));
    mission.maxAmount.assertGreaterThan(UInt64.zero, "mission_amount_required");
    mission.expiresAtSlot.assertGreaterThan(UInt32.zero, "mission_expiry_required");
    credential.expiresAtSlot.assertGreaterThanOrEqual(
      UInt64.from(mission.expiresAtSlot),
      "mission_exceeds_credential_expiry"
    );
    this.currentSlot.requireBetween(UInt32.zero, mission.expiresAtSlot);

    const credentialCommitment = credential.commitment();
    credentialCommitment.assertEquals(mission.credentialCommitment);
    const [credentialRoot, credentialKey] = credentialWitness.computeRootAndKey(
      credentialCommitment
    );
    credentialRoot.assertEquals(registryRoot);
    credentialKey.assertEquals(credential.credentialKey());

    agentSignature
      .verify(
        credential.agentKey,
        missionAuthorizationMessage(this.address, missionSequence, mission)
      )
      .assertTrue("invalid_agent_mission_signature");

    const missionCommitment = mission.commitment();
    const [missionRootBefore, missionKey] = missionWitness.computeRootAndKey(Field(0));
    missionRootBefore.assertEquals(currentMissionRoot);
    missionKey.assertEquals(mission.missionKey());
    const [missionRootAfter] = missionWitness.computeRootAndKey(Field(1));
    const nextSequence = missionSequence.add(1);

    this.missionRoot.set(missionRootAfter);
    this.missionSequence.set(nextSequence);
    this.lastMissionCommitment.set(missionCommitment);
    this.emitEvent(
      "missionAuthorized",
      new VorimMissionAuthorizedEvent({
        missionCommitment,
        credentialCommitment,
        delegateKey: mission.delegateKey,
        audienceHash: mission.audienceHash,
        actionHash: mission.actionHash,
        maxAmount: mission.maxAmount,
        expiresAtSlot: mission.expiresAtSlot,
        missionNullifier: mission.missionNullifier,
        missionRoot: missionRootAfter,
        sequence: nextSequence
      })
    );
  }

  @method async settleMission(
    mission: VorimMissionAuthorization,
    missionWitness: MerkleMapWitness,
    resultHash: Field
  ) {
    const currentMissionRoot = this.missionRoot.getAndRequireEquals();
    const delegate = this.sender.getAndRequireSignature();
    mission.delegateKey.assertEquals(delegate);
    resultHash.assertNotEquals(Field(0));
    resultHash.assertEquals(mission.actionHash, "result_commitment_mismatch");
    this.currentSlot.requireBetween(UInt32.zero, mission.expiresAtSlot);

    const [missionRootBefore, missionKey] = missionWitness.computeRootAndKey(Field(1));
    missionRootBefore.assertEquals(currentMissionRoot);
    missionKey.assertEquals(mission.missionKey());
    const [missionRootAfter] = missionWitness.computeRootAndKey(Field(2));

    this.missionRoot.set(missionRootAfter);
    this.emitEvent(
      "missionSettled",
      new VorimMissionSettledEvent({
        missionCommitment: mission.commitment(),
        resultHash,
        settlementRecipient: mission.settlementRecipient,
        missionRoot: missionRootAfter
      })
    );
  }
}
