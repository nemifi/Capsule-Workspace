#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_ADAPTER_KIND = "projection-interop/adapter";
export const INTEROP_ADAPTER_VERSION = 1;

const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;
const ADAPTER_STATES = new Set(["blocked", "draft", "planned", "retired", "verified"]);
const COMPATIBILITY_STATES = new Set(["blocked", "candidate", "partial", "ready"]);
const CONSTRAINT_STATES = new Set(["satisfied", "unknown", "violated", "waived"]);
const EVIDENCE_STATES = new Set(["missing", "observed", "stale"]);
const GUARD_STATES = new Set(["blocked", "expired", "failed", "pending", "satisfied", "unknown", "waived"]);
const GUARD_TARGET_READY_STATES = new Set(["ready", "satisfied", "waived"]);
const GUARD_TARGET_STATES = new Set(["blocked", "pending", "ready", "satisfied", "unknown", "waived"]);
const LOSS_LEVELS = new Set(["bounded", "lossy", "none", "unknown"]);
const MAPPING_AXES = new Set(["effect", "identity", "payload", "protocol", "stream", "vocabulary"]);
const RISK_SEVERITIES = new Set(["critical", "high", "info", "low", "medium"]);
const RISK_STATES = new Set(["accepted", "mitigated", "open"]);
const RESERVED_PAYLOADS = new Set(["opaque"]);

export async function verifyAdapterContractFile(filePath) {
  const label = "interop adapter contract";
  const text = await readFile(filePath, "utf8");
  const contract = parseJson(text, label);

  verifyAdapterContract(contract, label);
  if (text !== `${stableStringify(contract)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return contract;
}

export function verifyAdapterContract(contract, label = "interop adapter contract") {
  assertRecord(contract, label);
  assertKeys(
    contract,
    [
      "basis",
      "compatibility",
      "constraints",
      "effects",
      "evidenceNeeded",
      "guards",
      "kind",
      "loss",
      "mapping",
      "name",
      "proof",
      "proposal",
      "readiness",
      "risks",
      "source",
      "state",
      "target",
      "verification",
      "version",
      "vocabularies"
    ],
    [],
    label
  );

  if (contract.kind !== INTEROP_ADAPTER_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_ADAPTER_KIND}`);
  }
  if (contract.version !== INTEROP_ADAPTER_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_ADAPTER_VERSION}`);
  }

  assertToken(contract.name, `${label}.name`);
  if (!ADAPTER_STATES.has(contract.state)) {
    throw new Error(`${label}.state must be blocked, draft, planned, retired, or verified`);
  }

  validateReference(contract.compatibility, `${label}.compatibility`);
  if (contract.compatibility.kind !== "compatibility") {
    throw new Error(`${label}.compatibility.kind must be compatibility`);
  }
  validateReference(contract.proposal, `${label}.proposal`);
  if (contract.proposal.kind !== "proposal") {
    throw new Error(`${label}.proposal.kind must be proposal`);
  }
  const guards = validateGuards(contract.guards, contract.proposal, `${label}.guards`);
  const basisRefs = validateBasis(contract.basis, contract.compatibility, contract.proposal, guards.references, `${label}.basis`);
  validateReadiness(contract.readiness, `${label}.readiness`);
  validateEffectList(contract.effects, `${label}.effects`);
  const vocabularies = validateVocabularies(contract.vocabularies, `${label}.vocabularies`);
  validateEndpoint(contract.source, contract.effects, vocabularies, basisRefs, `${label}.source`);
  validateEndpoint(contract.target, contract.effects, vocabularies, basisRefs, `${label}.target`);
  validateDeclaredEffectsUsed(contract.effects, [contract.source, contract.target], `${label}.effects`);
  validateEndpointGuardBinding(contract.source, contract.effects, guards.targetsByKey, `${label}.source`);
  validateEndpointGuardBinding(contract.target, contract.effects, guards.targetsByKey, `${label}.target`);
  validateMapping(contract.mapping, contract.source, contract.target, contract.effects, vocabularies, `${label}.mapping`);
  validateLoss(contract.loss, `${label}.loss`);
  validateConstraints(contract.constraints, `${label}.constraints`);
  validateRisks(contract.risks, `${label}.risks`);
  validateEvidenceNeeded(contract.evidenceNeeded, `${label}.evidenceNeeded`);
  validateVerification(contract.verification, `${label}.verification`);
  validateProof(contract.proof, `${label}.proof`);
  validateVerifiedState(contract, guards, label);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-adapter-"));

  try {
    const valid = minimalContract();
    await verifyAdapterContractFile(await writeContract(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifyAdapterContractFile(await writePrettyContract(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const missingCompatibilityBasis = clone(valid);
    missingCompatibilityBasis.basis = missingCompatibilityBasis.basis.filter((entry) => entry.kind !== "compatibility");
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "missing-compatibility-basis", missingCompatibilityBasis)),
      "basis must include the compatibility reference"
    );

    const missingGuardBasis = clone(valid);
    missingGuardBasis.basis = missingGuardBasis.basis.filter((entry) => entry.kind !== "guard");
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "missing-guard-basis", missingGuardBasis)),
      "basis must include each guard reference"
    );

    const missingProposalBasis = clone(valid);
    missingProposalBasis.basis = missingProposalBasis.basis.filter((entry) => entry.kind !== "proposal");
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "missing-proposal-basis", missingProposalBasis)),
      "basis must include the proposal reference"
    );

    const badCompatibilityKind = clone(valid);
    badCompatibilityKind.compatibility.kind = "intent";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "bad-compatibility-kind", badCompatibilityKind)),
      "compatibility.kind must be compatibility"
    );

    const badGuardKind = clone(valid);
    badGuardKind.guards[0].reference.kind = "evidence";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "bad-guard-kind", badGuardKind)),
      "guards[0].reference.kind must be guard"
    );

    const guardProposalMismatch = clone(valid);
    guardProposalMismatch.guards[0].proposal.ref = "interop/proposals/other.json";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "guard-proposal-mismatch", guardProposalMismatch)),
      "guards[0].proposal must match adapter proposal"
    );

    const undeclaredPayload = clone(valid);
    undeclaredPayload.target.payload = "projection.unknown.v1";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "undeclared-payload", undeclaredPayload)),
      "must be opaque or named in vocabularies"
    );

    const missingEndpointInterfaceBasis = clone(valid);
    missingEndpointInterfaceBasis.basis = missingEndpointInterfaceBasis.basis.filter((entry) => entry.ref !== "interop/interfaces/candidate.json");
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "missing-endpoint-interface-basis", missingEndpointInterfaceBasis)),
      "source.interface must name a declared adapter basis reference"
    );

    const undeclaredEffect = clone(valid);
    undeclaredEffect.target.effects = ["filesystem.write"];
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "undeclared-effect", undeclaredEffect)),
      "must be declared in effects"
    );

    const unusedDeclaredEffect = clone(valid);
    unusedDeclaredEffect.effects = ["filesystem.read", "network.read"];
    unusedDeclaredEffect.guards[0].targets[0].effects = ["filesystem.read", "network.read"];
    unusedDeclaredEffect.guards[0].targets[1].effects = ["filesystem.read", "network.read"];
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "unused-declared-effect", unusedDeclaredEffect)),
      "effects must be used by at least one endpoint"
    );

    const missingEndpointGuardTarget = clone(valid);
    missingEndpointGuardTarget.source.guardTarget = "missing-target";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "missing-endpoint-guard-target", missingEndpointGuardTarget)),
      "source.guardTarget must name a declared guard target"
    );

    const endpointParticipantMismatch = clone(valid);
    endpointParticipantMismatch.source.participant = "projection://other";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "endpoint-participant-mismatch", endpointParticipantMismatch)),
      "source.participant must match guard target participant"
    );

    const endpointInterfaceMismatch = clone(valid);
    endpointInterfaceMismatch.guards[0].targets[0].interface.ref = "interop/interfaces/other.json";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "endpoint-interface-mismatch", endpointInterfaceMismatch)),
      "source.interface must match guard target interface"
    );

    const unguardedContractEffect = clone(valid);
    unguardedContractEffect.guards[0].targets[0].effects = [];
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "unguarded-contract-effect", unguardedContractEffect)),
      "source.effects must be covered by guard target"
    );

    const payloadMappingMismatch = clone(valid);
    payloadMappingMismatch.mapping[1].source = "projection.compatibility.v1";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "payload-mapping-mismatch", payloadMappingMismatch)),
      "mapping[1].source must match source payload"
    );

    const missingEffectMapping = clone(valid);
    missingEffectMapping.mapping = missingEffectMapping.mapping.filter((entry) => entry.axis !== "effect");
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "missing-effect-mapping", missingEffectMapping)),
      "mapping must include effect mappings for declared effects"
    );

    const unsortedMapping = clone(valid);
    unsortedMapping.mapping = [...unsortedMapping.mapping].reverse();
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "unsorted-mapping", unsortedMapping)),
      "mapping.name must be sorted"
    );

    const verifiedWithMissingEvidence = clone(valid);
    verifiedWithMissingEvidence.state = "verified";
    verifiedWithMissingEvidence.readiness.state = "ready";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "verified-missing-evidence", verifiedWithMissingEvidence)),
      "verified adapter contracts must not have required missing or stale evidence"
    );

    const verifiedWithoutReadyCompatibility = clone(valid);
    verifiedWithoutReadyCompatibility.state = "verified";
    verifiedWithoutReadyCompatibility.evidenceNeeded[0].state = "observed";
    verifiedWithoutReadyCompatibility.risks[0].state = "mitigated";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "verified-without-ready-compatibility", verifiedWithoutReadyCompatibility)),
      "verified adapter contracts require compatibility readiness"
    );

    const verifiedWithPendingGuard = clone(valid);
    verifiedWithPendingGuard.state = "verified";
    verifiedWithPendingGuard.readiness.state = "ready";
    verifiedWithPendingGuard.evidenceNeeded[0].state = "observed";
    verifiedWithPendingGuard.risks[0].state = "mitigated";
    verifiedWithPendingGuard.guards[0].state = "pending";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "verified-with-pending-guard", verifiedWithPendingGuard)),
      "verified adapter contracts must not have required unsatisfied guards"
    );

    const verifiedWithPendingGuardTarget = clone(valid);
    verifiedWithPendingGuardTarget.state = "verified";
    verifiedWithPendingGuardTarget.readiness.state = "ready";
    verifiedWithPendingGuardTarget.evidenceNeeded[0].state = "observed";
    verifiedWithPendingGuardTarget.risks[0].state = "mitigated";
    verifiedWithPendingGuardTarget.guards[0].targets[0].state = "pending";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "verified-with-pending-guard-target", verifiedWithPendingGuardTarget)),
      "verified adapter contracts must not have required unready guard targets"
    );

    const verifiedWithViolatedConstraint = clone(valid);
    verifiedWithViolatedConstraint.state = "verified";
    verifiedWithViolatedConstraint.readiness.state = "ready";
    verifiedWithViolatedConstraint.evidenceNeeded[0].state = "observed";
    verifiedWithViolatedConstraint.risks[0].state = "mitigated";
    verifiedWithViolatedConstraint.constraints[0].state = "violated";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "verified-with-violated-constraint", verifiedWithViolatedConstraint)),
      "verified adapter contracts must not have required unsatisfied constraints"
    );

    const verifiedWithUnknownMappingLoss = clone(valid);
    verifiedWithUnknownMappingLoss.state = "verified";
    verifiedWithUnknownMappingLoss.readiness.state = "ready";
    verifiedWithUnknownMappingLoss.evidenceNeeded[0].state = "observed";
    verifiedWithUnknownMappingLoss.risks[0].state = "mitigated";
    verifiedWithUnknownMappingLoss.mapping[0].loss = "unknown";
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "verified-with-unknown-mapping-loss", verifiedWithUnknownMappingLoss)),
      "verified adapter contracts must not have required mappings with unknown loss"
    );

    const verifiedWithoutFixture = clone(valid);
    verifiedWithoutFixture.state = "verified";
    verifiedWithoutFixture.readiness.state = "ready";
    verifiedWithoutFixture.evidenceNeeded[0].state = "observed";
    verifiedWithoutFixture.risks[0].state = "mitigated";
    verifiedWithoutFixture.verification.fixtures = [];
    await assertRejects(
      async () => verifyAdapterContractFile(await writeContract(tempRoot, "verified-without-fixture", verifiedWithoutFixture)),
      "verified adapter contracts must include verification fixtures"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateBasis(basis, compatibility, proposal, guardRefs, label) {
  assertArray(basis, label);
  const refs = [];
  let hasCompatibility = false;
  let hasProposal = false;
  for (const [index, entry] of basis.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(entry, itemLabel);
    refs.push(referenceKey(entry));
    if (sameReference(entry, compatibility)) {
      hasCompatibility = true;
    }
    if (sameReference(entry, proposal)) {
      hasProposal = true;
    }
  }
  assertSortedUnique(refs, label);
  if (!hasCompatibility) {
    throw new Error(`${label} must include the compatibility reference`);
  }
  if (!hasProposal) {
    throw new Error(`${label} must include the proposal reference`);
  }

  const basisRefs = new Set(refs);
  const missingGuards = [...guardRefs].filter((ref) => !basisRefs.has(ref));
  if (missingGuards.length > 0) {
    throw new Error(`${label} must include each guard reference: ${missingGuards.join(", ")}`);
  }
  return basisRefs;
}

function validateGuards(guards, proposal, label) {
  assertArray(guards, label);
  const names = [];
  const refs = [];
  const targetsByKey = new Map();
  for (const [index, guard] of guards.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(guard, itemLabel);
    assertKeys(guard, ["name", "proposal", "reference", "required", "state", "summary", "targets"], [], itemLabel);
    assertToken(guard.name, `${itemLabel}.name`);
    validateReference(guard.proposal, `${itemLabel}.proposal`);
    if (guard.proposal.kind !== "proposal") {
      throw new Error(`${itemLabel}.proposal.kind must be proposal`);
    }
    if (!sameReference(guard.proposal, proposal)) {
      throw new Error(`${itemLabel}.proposal must match adapter proposal`);
    }
    validateReference(guard.reference, `${itemLabel}.reference`);
    if (guard.reference.kind !== "guard") {
      throw new Error(`${itemLabel}.reference.kind must be guard`);
    }
    if (typeof guard.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!GUARD_STATES.has(guard.state)) {
      throw new Error(`${itemLabel}.state must be blocked, expired, failed, pending, satisfied, unknown, or waived`);
    }
    assertTrimmedString(guard.summary, `${itemLabel}.summary`);
    const targets = validateGuardTargets(guard.targets, `${itemLabel}.targets`);
    for (const target of targets) {
      targetsByKey.set(guardTargetKey(guard.name, target.target), {
        ...target,
        guardName: guard.name,
        label: target.label
      });
    }
    names.push(guard.name);
    refs.push(referenceKey(guard.reference));
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.reference`);
  return {
    references: new Set(refs),
    targetsByKey
  };
}

function validateGuardTargets(targets, label) {
  assertArray(targets, label);
  const targetNames = [];
  const participants = [];
  const entries = [];
  for (const [index, target] of targets.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(target, itemLabel);
    assertKeys(target, ["effects", "interface", "participant", "required", "role", "state", "target"], [], itemLabel);
    validateEffectList(target.effects, `${itemLabel}.effects`);
    validateReference(target.interface, `${itemLabel}.interface`);
    if (target.interface.kind !== "interface") {
      throw new Error(`${itemLabel}.interface.kind must be interface`);
    }
    assertTrimmedString(target.participant, `${itemLabel}.participant`);
    if (typeof target.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    assertToken(target.role, `${itemLabel}.role`);
    if (!GUARD_TARGET_STATES.has(target.state)) {
      throw new Error(`${itemLabel}.state must be blocked, pending, ready, satisfied, unknown, or waived`);
    }
    assertToken(target.target, `${itemLabel}.target`);
    targetNames.push(target.target);
    participants.push(target.participant);
    entries.push({ ...target, label: itemLabel });
  }
  assertSortedUnique(targetNames, `${label}.target`);
  assertSortedUnique(participants, `${label}.participant`);
  return entries;
}

function validateReadiness(readiness, label) {
  assertRecord(readiness, label);
  assertKeys(readiness, ["state", "summary"], [], label);
  if (!COMPATIBILITY_STATES.has(readiness.state)) {
    throw new Error(`${label}.state must be blocked, candidate, partial, or ready`);
  }
  assertTrimmedString(readiness.summary, `${label}.summary`);
}

function validateVocabularies(vocabularies, label) {
  assertAnyArray(vocabularies, label);
  const names = [];
  for (const [index, vocabulary] of vocabularies.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(vocabulary, itemLabel);
    assertKeys(vocabulary, ["kind", "name", "ref"], [], itemLabel);
    assertToken(vocabulary.kind, `${itemLabel}.kind`);
    assertToken(vocabulary.name, `${itemLabel}.name`);
    assertTrimmedString(vocabulary.ref, `${itemLabel}.ref`);
    names.push(vocabulary.name);
  }
  assertSortedUnique(names, `${label}.name`);
  return new Set(names);
}

function validateEndpoint(endpoint, declaredEffects, vocabularies, basisRefs, label) {
  assertRecord(endpoint, label);
  assertKeys(
    endpoint,
    [
      "capability",
      "effects",
      "guard",
      "guardTarget",
      "identity",
      "interface",
      "participant",
      "payload",
      "protocol",
      "role",
      "stream",
      "surface"
    ],
    [],
    label
  );
  assertToken(endpoint.capability, `${label}.capability`);
  validateEffectList(endpoint.effects, `${label}.effects`);
  for (const effect of endpoint.effects) {
    if (!declaredEffects.includes(effect)) {
      throw new Error(`${label}.effects ${effect} must be declared in effects`);
    }
  }
  assertToken(endpoint.guard, `${label}.guard`);
  assertToken(endpoint.guardTarget, `${label}.guardTarget`);
  assertToken(endpoint.identity, `${label}.identity`);
  validateReference(endpoint.interface, `${label}.interface`);
  if (endpoint.interface.kind !== "interface") {
    throw new Error(`${label}.interface.kind must be interface`);
  }
  if (!basisRefs.has(referenceKey(endpoint.interface))) {
    throw new Error(`${label}.interface must name a declared adapter basis reference`);
  }
  assertTrimmedString(endpoint.participant, `${label}.participant`);
  assertPayloadRef(endpoint.payload, vocabularies, `${label}.payload`);
  assertToken(endpoint.protocol, `${label}.protocol`);
  assertToken(endpoint.role, `${label}.role`);
  assertToken(endpoint.stream, `${label}.stream`);
  assertToken(endpoint.surface, `${label}.surface`);
}

function validateDeclaredEffectsUsed(effects, endpoints, label) {
  const usedEffects = new Set(endpoints.flatMap((endpoint) => endpoint.effects));
  const unused = effects.filter((effect) => !usedEffects.has(effect));
  if (unused.length > 0) {
    throw new Error(`${label} must be used by at least one endpoint: ${unused.join(", ")}`);
  }
}

function validateEndpointGuardBinding(endpoint, declaredEffects, targetsByKey, label) {
  const key = guardTargetKey(endpoint.guard, endpoint.guardTarget);
  const target = targetsByKey.get(key);
  if (!target) {
    throw new Error(`${label}.guardTarget must name a declared guard target`);
  }
  if (endpoint.participant !== target.participant) {
    throw new Error(`${label}.participant must match guard target participant`);
  }
  if (endpoint.role !== target.role) {
    throw new Error(`${label}.role must match guard target role`);
  }
  if (!sameReference(endpoint.interface, target.interface)) {
    throw new Error(`${label}.interface must match guard target interface`);
  }

  const targetEffects = new Set(target.effects);
  const requiredEffects = [...new Set([...declaredEffects, ...endpoint.effects])].sort();
  const missing = requiredEffects.filter((effect) => !targetEffects.has(effect));
  if (missing.length > 0) {
    throw new Error(`${label}.effects must be covered by guard target ${key}: ${missing.join(", ")}`);
  }
}

function validateMapping(mapping, sourceEndpoint, targetEndpoint, declaredEffects, vocabularies, label) {
  assertArray(mapping, label);
  const names = [];
  const effectMappings = new Set();
  const payloadMappings = new Set();
  for (const [index, entry] of mapping.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(entry, itemLabel);
    assertKeys(entry, ["axis", "loss", "name", "required", "source", "target", "transform"], [], itemLabel);
    if (!MAPPING_AXES.has(entry.axis)) {
      throw new Error(`${itemLabel}.axis must be effect, identity, payload, protocol, stream, or vocabulary`);
    }
    if (!LOSS_LEVELS.has(entry.loss)) {
      throw new Error(`${itemLabel}.loss must be bounded, lossy, none, or unknown`);
    }
    assertToken(entry.name, `${itemLabel}.name`);
    if (typeof entry.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    assertTrimmedString(entry.source, `${itemLabel}.source`);
    assertTrimmedString(entry.target, `${itemLabel}.target`);
    if (entry.axis === "effect") {
      validateMappedEffect(entry.source, declaredEffects, `${itemLabel}.source`);
      validateMappedEffect(entry.target, declaredEffects, `${itemLabel}.target`);
      if (entry.required) {
        effectMappings.add(entry.source);
        effectMappings.add(entry.target);
      }
    }
    if (entry.axis === "payload") {
      if (entry.source !== sourceEndpoint.payload) {
        throw new Error(`${itemLabel}.source must match source payload`);
      }
      if (entry.target !== targetEndpoint.payload) {
        throw new Error(`${itemLabel}.target must match target payload`);
      }
      if (entry.required) {
        payloadMappings.add(`${entry.source}->${entry.target}`);
      }
    }
    if (entry.axis === "vocabulary") {
      assertPayloadRef(entry.source, vocabularies, `${itemLabel}.source`);
      assertPayloadRef(entry.target, vocabularies, `${itemLabel}.target`);
    }
    assertToken(entry.transform, `${itemLabel}.transform`);
    names.push(entry.name);
  }
  assertSortedUnique(names, `${label}.name`);

  const expectedPayloadMapping = `${sourceEndpoint.payload}->${targetEndpoint.payload}`;
  if ((!RESERVED_PAYLOADS.has(sourceEndpoint.payload) || !RESERVED_PAYLOADS.has(targetEndpoint.payload)) && !payloadMappings.has(expectedPayloadMapping)) {
    throw new Error(`${label} must include payload mapping from source payload to target payload: ${expectedPayloadMapping}`);
  }

  const unmappedEffects = declaredEffects.filter((effect) => !effectMappings.has(effect));
  if (unmappedEffects.length > 0) {
    throw new Error(`${label} must include effect mappings for declared effects: ${unmappedEffects.join(", ")}`);
  }
}

function validateMappedEffect(effect, declaredEffects, label) {
  assertToken(effect, label);
  if (!declaredEffects.includes(effect)) {
    throw new Error(`${label} must name a declared effect`);
  }
}

function validateLoss(loss, label) {
  assertRecord(loss, label);
  assertKeys(loss, ["level", "summary"], [], label);
  if (!LOSS_LEVELS.has(loss.level)) {
    throw new Error(`${label}.level must be bounded, lossy, none, or unknown`);
  }
  assertTrimmedString(loss.summary, `${label}.summary`);
}

function validateConstraints(constraints, label) {
  assertAnyArray(constraints, label);
  const names = [];
  for (const [index, constraint] of constraints.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(constraint, itemLabel);
    assertKeys(constraint, ["kind", "name", "reason", "required", "state"], [], itemLabel);
    assertToken(constraint.kind, `${itemLabel}.kind`);
    assertToken(constraint.name, `${itemLabel}.name`);
    assertTrimmedString(constraint.reason, `${itemLabel}.reason`);
    if (typeof constraint.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!CONSTRAINT_STATES.has(constraint.state)) {
      throw new Error(`${itemLabel}.state must be satisfied, unknown, violated, or waived`);
    }
    names.push(constraint.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateRisks(risks, label) {
  assertAnyArray(risks, label);
  const names = [];
  for (const [index, risk] of risks.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(risk, itemLabel);
    assertKeys(risk, ["kind", "mitigation", "name", "severity", "state"], [], itemLabel);
    assertToken(risk.kind, `${itemLabel}.kind`);
    assertTrimmedString(risk.mitigation, `${itemLabel}.mitigation`);
    assertToken(risk.name, `${itemLabel}.name`);
    if (!RISK_SEVERITIES.has(risk.severity)) {
      throw new Error(`${itemLabel}.severity must be critical, high, info, low, or medium`);
    }
    if (!RISK_STATES.has(risk.state)) {
      throw new Error(`${itemLabel}.state must be accepted, mitigated, or open`);
    }
    names.push(risk.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateEvidenceNeeded(evidenceNeeded, label) {
  assertAnyArray(evidenceNeeded, label);
  const names = [];
  for (const [index, evidence] of evidenceNeeded.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(evidence, itemLabel);
    assertKeys(evidence, ["kind", "name", "reason", "required", "state", "subject"], [], itemLabel);
    assertToken(evidence.kind, `${itemLabel}.kind`);
    assertToken(evidence.name, `${itemLabel}.name`);
    assertTrimmedString(evidence.reason, `${itemLabel}.reason`);
    if (typeof evidence.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!EVIDENCE_STATES.has(evidence.state)) {
      throw new Error(`${itemLabel}.state must be missing, observed, or stale`);
    }
    assertTrimmedString(evidence.subject, `${itemLabel}.subject`);
    names.push(evidence.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateVerification(verification, label) {
  assertRecord(verification, label);
  assertKeys(verification, ["commands", "fixtures", "method"], [], label);
  assertStringArray(verification.commands, `${label}.commands`);
  if (verification.commands.length === 0) {
    throw new Error(`${label}.commands must be a non-empty array`);
  }
  assertStringArray(verification.fixtures, `${label}.fixtures`);
  assertToken(verification.method, `${label}.method`);
}

function validateProof(proof, label) {
  assertRecord(proof, label);
  assertKeys(proof, ["commands"], [], label);
  assertStringArray(proof.commands, `${label}.commands`);
  if (proof.commands.length === 0) {
    throw new Error(`${label}.commands must be a non-empty array`);
  }
}

function validateVerifiedState(contract, guards, label) {
  if (contract.state !== "verified") {
    return;
  }

  if (contract.readiness.state !== "ready") {
    throw new Error(`${label} verified adapter contracts require compatibility readiness`);
  }

  const unsatisfiedGuards = contract.guards
    .filter((guard) => guard.required && !["satisfied", "waived"].includes(guard.state))
    .map((guard) => guard.name);
  if (unsatisfiedGuards.length > 0) {
    throw new Error(`${label} verified adapter contracts must not have required unsatisfied guards: ${unsatisfiedGuards.join(", ")}`);
  }

  const unreadyGuardTargets = [...guards.targetsByKey.values()]
    .filter((target) => target.required && !GUARD_TARGET_READY_STATES.has(target.state))
    .map((target) => `${target.guardName}/${target.target}`);
  if (unreadyGuardTargets.length > 0) {
    throw new Error(`${label} verified adapter contracts must not have required unready guard targets: ${unreadyGuardTargets.join(", ")}`);
  }

  const unsatisfiedConstraints = contract.constraints
    .filter((constraint) => constraint.required && !["satisfied", "waived"].includes(constraint.state))
    .map((constraint) => constraint.name);
  if (unsatisfiedConstraints.length > 0) {
    throw new Error(`${label} verified adapter contracts must not have required unsatisfied constraints: ${unsatisfiedConstraints.join(", ")}`);
  }

  const blockingEvidence = contract.evidenceNeeded
    .filter((evidence) => evidence.required && evidence.state !== "observed")
    .map((evidence) => evidence.name);
  if (blockingEvidence.length > 0) {
    throw new Error(`${label} verified adapter contracts must not have required missing or stale evidence: ${blockingEvidence.join(", ")}`);
  }

  const openRisks = contract.risks
    .filter((risk) => risk.state === "open")
    .map((risk) => risk.name);
  if (openRisks.length > 0) {
    throw new Error(`${label} verified adapter contracts must not have open risks: ${openRisks.join(", ")}`);
  }

  const unknownMappings = contract.mapping
    .filter((mapping) => mapping.required && mapping.loss === "unknown")
    .map((mapping) => mapping.name);
  if (unknownMappings.length > 0) {
    throw new Error(`${label} verified adapter contracts must not have required mappings with unknown loss: ${unknownMappings.join(", ")}`);
  }

  if (contract.verification.fixtures.length === 0) {
    throw new Error(`${label} verified adapter contracts must include verification fixtures`);
  }
}

function validateReference(reference, label) {
  assertRecord(reference, label);
  assertKeys(reference, ["commitment", "kind", "ref"], [], label);
  assertCommitment(reference.commitment, `${label}.commitment`);
  assertToken(reference.kind, `${label}.kind`);
  assertTrimmedString(reference.ref, `${label}.ref`);
}

function referenceKey(reference) {
  return `${reference.kind}:${reference.ref}:${reference.commitment}`;
}

function sameReference(left, right) {
  return left.kind === right.kind && left.ref === right.ref && left.commitment === right.commitment;
}

function guardTargetKey(guardName, targetName) {
  return `${guardName}/${targetName}`;
}

function assertPayloadRef(value, vocabularies, label) {
  assertToken(value, label);
  if (!RESERVED_PAYLOADS.has(value) && !vocabularies.has(value)) {
    throw new Error(`${label} must be opaque or named in vocabularies`);
  }
}

function validateEffectList(effects, label) {
  assertTokenArray(effects, label);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
}

function assertAnyArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function assertKeys(value, required, optional, label) {
  assertRecord(value, label);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value).sort();
  const missing = required.filter((key) => !keys.includes(key));
  if (missing.length > 0) {
    throw new Error(`${label} missing required keys: ${missing.join(", ")}`);
  }

  const unexpected = keys.filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} has unexpected keys: ${unexpected.join(", ")}`);
  }
}

function assertCommitment(value, label) {
  if (typeof value !== "string" || !COMMITMENT_PATTERN.test(value)) {
    throw new Error(`${label} must be a sha256 commitment`);
  }
}

function assertToken(value, label) {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new Error(`${label} must be a token`);
  }
}

function assertTokenArray(value, label) {
  assertAnyArray(value, label);
  for (const [index, item] of value.entries()) {
    assertToken(item, `${label}[${index}]`);
  }
  assertSortedUnique(value, label);
}

function assertStringArray(value, label) {
  assertAnyArray(value, label);
  for (const [index, item] of value.entries()) {
    assertTrimmedString(item, `${label}[${index}]`);
  }
  assertSortedUnique(value, label);
}

function assertTrimmedString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be one trimmed string`);
  }
}

function assertSortedUnique(values, label) {
  const sorted = [...values].sort();
  if (JSON.stringify(values) !== JSON.stringify(sorted)) {
    throw new Error(`${label} must be sorted`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function minimalContract() {
  const compatibility = {
    commitment: `sha256:${"a".repeat(64)}`,
    kind: "compatibility",
    ref: "interop/compatibility/current.json"
  };
  const proposal = {
    commitment: `sha256:${"9".repeat(64)}`,
    kind: "proposal",
    ref: "interop/proposals/current.json"
  };
  const guard = {
    commitment: `sha256:${"b".repeat(64)}`,
    kind: "guard",
    ref: "interop/guards/current.json"
  };
  const sourceInterface = {
    commitment: `sha256:${"b".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/candidate.json"
  };
  const targetInterface = {
    commitment: `sha256:${"d".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/planner.json"
  };

  return {
    basis: [
      compatibility,
      guard,
      {
        commitment: `sha256:${"c".repeat(64)}`,
        kind: "intent",
        ref: "interop/intents/current.json"
      },
      sourceInterface,
      targetInterface,
      proposal
    ],
    compatibility,
    constraints: [
      {
        kind: "format",
        name: "canonical-source",
        reason: "source payload must be canonical JSON before mapping",
        required: true,
        state: "satisfied"
      },
      {
        kind: "safety",
        name: "no-runtime-execution",
        reason: "adapter contract verification does not execute participating bodies",
        required: true,
        state: "satisfied"
      }
    ],
    effects: ["filesystem.read"],
    evidenceNeeded: [
      {
        kind: "fixture",
        name: "roundtrip-sample",
        reason: "sample input and output are needed before the adapter can be marked verified",
        required: true,
        state: "missing",
        subject: "payload-record"
      }
    ],
    guards: [
      {
        name: "policy-consent-guard",
        proposal,
        reference: guard,
        required: true,
        state: "satisfied",
        summary: "Required pre-runtime guard state remains visible before adapter verification.",
        targets: [
          {
            effects: ["filesystem.read"],
            interface: sourceInterface,
            participant: "projection://candidate",
            required: true,
            role: "candidate",
            state: "satisfied",
            target: "candidate-target"
          },
          {
            effects: ["filesystem.read"],
            interface: targetInterface,
            participant: "projection://planner",
            required: true,
            role: "planner",
            state: "satisfied",
            target: "planner-target"
          }
        ]
      }
    ],
    kind: INTEROP_ADAPTER_KIND,
    loss: {
      level: "bounded",
      summary: "The target compatibility record abstracts body-specific runtime meaning."
    },
    mapping: [
      {
        axis: "effect",
        loss: "bounded",
        name: "effect-filesystem-read",
        required: true,
        source: "filesystem.read",
        target: "filesystem.read",
        transform: "preserve.effect-bound"
      },
      {
        axis: "payload",
        loss: "bounded",
        name: "payload-record",
        required: true,
        source: "projection.interface.v1",
        target: "projection.compatibility.v1",
        transform: "derive.compatibility-record"
      },
      {
        axis: "protocol",
        loss: "none",
        name: "protocol-envelope",
        required: true,
        source: "command.stdout",
        target: "record.input",
        transform: "parse.canonical-json"
      }
    ],
    name: "interface-to-compatibility",
    proof: {
      commands: ["node projection-root/kit/interop/adapter/verify.mjs interop/adapters/current.json"]
    },
    proposal,
    readiness: {
      state: "partial",
      summary: "Compatibility plan has named the adapter need, but adapter evidence is still missing."
    },
    risks: [
      {
        kind: "meaning",
        mitigation: "record bounded loss and require fixture evidence before verified state",
        name: "semantic-loss",
        severity: "medium",
        state: "open"
      }
    ],
    source: {
      capability: "projection.inspect",
      effects: [],
      guard: "policy-consent-guard",
      guardTarget: "candidate-target",
      identity: "opaque",
      interface: sourceInterface,
      participant: "projection://candidate",
      payload: "projection.interface.v1",
      protocol: "command",
      role: "candidate",
      stream: "none",
      surface: "verify"
    },
    state: "planned",
    target: {
      capability: "projection.plan",
      effects: ["filesystem.read"],
      guard: "policy-consent-guard",
      guardTarget: "planner-target",
      identity: "opaque",
      interface: targetInterface,
      participant: "projection://planner",
      payload: "projection.compatibility.v1",
      protocol: "command",
      role: "planner",
      stream: "none",
      surface: "plan"
    },
    verification: {
      commands: ["node projection-root/kit/interop/adapter/verify.mjs interop/adapters/current.json"],
      fixtures: ["adapter-fixtures/interface-sample.json"],
      method: "canonical-json"
    },
    version: INTEROP_ADAPTER_VERSION,
    vocabularies: [
      {
        kind: "record",
        name: "projection.compatibility.v1",
        ref: "projection-root/kit/interop/manifest.json"
      },
      {
        kind: "record",
        name: "projection.interface.v1",
        ref: "projection-root/kit/interop/manifest.json"
      }
    ]
  };
}

async function writeContract(tempRoot, name, contract) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(contract)}\n`, "utf8");
  return filePath;
}

async function writePrettyContract(tempRoot, name, contract) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  return filePath;
}

async function assertRejects(action, expectedMessage) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedMessage)) {
      return;
    }

    throw new Error(`expected ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(message)}`);
  }

  throw new Error("expected rejection");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  for (const flag of flags) {
    if (!["--json", "--self-test"].includes(flag)) {
      throw new Error(`unknown option: ${flag}`);
    }
  }

  if (flags.has("--self-test")) {
    await runSelfTest();
    console.log("projection interop adapter verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/adapter/verify.mjs <contract.json> [--json] | --self-test");
  }

  const contract = await verifyAdapterContractFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(contract));
    return;
  }

  console.log("projection interop adapter contract ok");
  console.log(`adapter: ${contract.name}`);
  console.log(`state: ${contract.state}`);
  console.log(`mapping: ${contract.mapping.length}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop adapter: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
