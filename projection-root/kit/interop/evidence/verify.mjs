#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_EVIDENCE_KIND = "projection-interop/evidence";
export const INTEROP_EVIDENCE_VERSION = 1;

const CLAIM_STATES = new Set(["disputed", "inferred", "observed", "unknown"]);
const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OBSERVATION_RESULTS = new Set(["accepted", "failed", "inconclusive", "observed", "passed", "received", "rejected", "unknown"]);
const POSITIVE_OBSERVATION_RESULTS = new Set(["accepted", "observed", "passed", "received"]);
const POSITIVE_BINDING_STATES = new Set(["accepted", "observed", "received"]);
const ADAPTER_STATES = new Set(["missing", "planned", "retired", "verified"]);
const BINDING_STATES = new Set(["accepted", "missing", "observed", "received", "rejected", "stale", "unknown"]);
const GUARD_STATES = new Set(["blocked", "expired", "failed", "pending", "satisfied", "unknown", "waived"]);
const GUARD_TARGET_READY_STATES = new Set(["ready", "satisfied", "waived"]);
const GUARD_TARGET_STATES = new Set(["blocked", "pending", "ready", "satisfied", "unknown", "waived"]);
const PARTICIPANT_OBSERVED_STATES = new Set(["active", "completed", "ready"]);
const PARTICIPANT_STATES = new Set(["active", "canceled", "completed", "failed", "invited", "left", "ready"]);
const RISK_SEVERITIES = new Set(["critical", "high", "info", "low", "medium"]);
const RISK_STATES = new Set(["accepted", "mitigated", "open"]);
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

export async function verifyEvidenceRecordFile(filePath) {
  const label = "interop evidence record";
  const text = await readFile(filePath, "utf8");
  const evidence = parseJson(text, label);

  verifyEvidenceRecord(evidence, label);
  if (text !== `${stableStringify(evidence)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return evidence;
}

export function verifyEvidenceRecord(evidence, label = "interop evidence record") {
  assertRecord(evidence, label);
  assertKeys(
    evidence,
    [
      "adapters",
      "artifacts",
      "basis",
      "claims",
      "effects",
      "guards",
      "kind",
      "limits",
      "name",
      "observation",
      "observed",
      "observer",
      "participants",
      "proof",
      "proposal",
      "receipts",
      "results",
      "risks",
      "session",
      "subject",
      "version"
    ],
    [],
    label
  );

  if (evidence.kind !== INTEROP_EVIDENCE_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_EVIDENCE_KIND}`);
  }
  if (evidence.version !== INTEROP_EVIDENCE_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_EVIDENCE_VERSION}`);
  }

  assertToken(evidence.name, `${label}.name`);
  validateReference(evidence.subject, `${label}.subject`);
  validateReference(evidence.session, `${label}.session`);
  if (evidence.session.kind !== "session") {
    throw new Error(`${label}.session.kind must be session`);
  }
  validateReference(evidence.proposal, `${label}.proposal`);
  if (evidence.proposal.kind !== "proposal") {
    throw new Error(`${label}.proposal.kind must be proposal`);
  }
  const receipts = validateBindings(evidence.receipts, "receipt", `${label}.receipts`);
  const results = validateBindings(evidence.results, "result", `${label}.results`);
  const participants = validateParticipants(evidence.participants, `${label}.participants`);
  const guards = validateGuards(evidence.guards, evidence.proposal, `${label}.guards`);
  const adapters = validateAdapters(evidence.adapters, participants, guards.targetsByKey, `${label}.adapters`);
  const basisRefs = validateBasis(
    evidence.basis,
    evidence.subject,
    evidence.session,
    evidence.proposal,
    adapters.references,
    guards.references,
    participantInterfaceRefs(evidence.participants),
    receipts,
    results,
    `${label}.basis`
  );
  validateParticipantInterfaceBasis(evidence.participants, basisRefs, `${label}.participants`);
  validateObserver(evidence.observer, `${label}.observer`);
  validateObservation(evidence.observation, `${label}.observation`);
  validateObserved(evidence.observed, `${label}.observed`);
  validateClaims(evidence.claims, `${label}.claims`);
  validateArtifacts(evidence.artifacts, `${label}.artifacts`);
  assertTokenArray(evidence.effects, `${label}.effects`);
  validateEffectsCovered(evidence.effects, adapters.effects, `${label}.effects`);
  validateSubjectBinding(evidence.subject, evidence.session, evidence.proposal, adapters.references, guards.references, `${label}.subject`);
  validateLimits(evidence.limits, `${label}.limits`);
  validateRisks(evidence.risks, `${label}.risks`);
  validateProof(evidence.proof, `${label}.proof`);
  validatePositiveObservation(evidence, adapters.records, guards.records, guards.targetsByKey, label);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-evidence-"));

  try {
    const valid = minimalEvidence();
    await verifyEvidenceRecordFile(await writeEvidence(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifyEvidenceRecordFile(await writePrettyEvidence(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const missingSubjectBasis = clone(valid);
    missingSubjectBasis.basis = missingSubjectBasis.basis.filter((entry) => entry.kind !== "adapter");
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-subject-basis", missingSubjectBasis)),
      "basis must include the subject reference"
    );

    const missingSessionBasis = clone(valid);
    missingSessionBasis.basis = missingSessionBasis.basis.filter((entry) => entry.kind !== "session");
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-session-basis", missingSessionBasis)),
      "basis must include the session reference"
    );

    const missingProposalBasis = clone(valid);
    missingProposalBasis.basis = missingProposalBasis.basis.filter((entry) => entry.kind !== "proposal");
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-proposal-basis", missingProposalBasis)),
      "basis must include the proposal reference"
    );

    const missingGuardBasis = clone(valid);
    missingGuardBasis.basis = missingGuardBasis.basis.filter((entry) => entry.kind !== "guard");
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-guard-basis", missingGuardBasis)),
      "basis must include each guard reference"
    );

    const missingReceiptBasis = clone(valid);
    missingReceiptBasis.basis = missingReceiptBasis.basis.filter((entry) => entry.kind !== "receipt");
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-receipt-basis", missingReceiptBasis)),
      "basis must include each receipt reference"
    );

    const missingResultBasis = clone(valid);
    missingResultBasis.basis = missingResultBasis.basis.filter((entry) => entry.kind !== "result");
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-result-basis", missingResultBasis)),
      "basis must include each result reference"
    );

    const missingParticipantInterfaceBasis = clone(valid);
    missingParticipantInterfaceBasis.basis = missingParticipantInterfaceBasis.basis.filter((entry) => entry.ref !== "interop/interfaces/candidate.json");
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-participant-interface-basis", missingParticipantInterfaceBasis)),
      "basis must include each participant interface reference"
    );

    const emptyReceipts = clone(valid);
    emptyReceipts.receipts = [];
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "empty-receipts", emptyReceipts)),
      "receipts must be a non-empty array"
    );

    const badReceiptKind = clone(valid);
    badReceiptKind.receipts[0].reference.kind = "result";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "bad-receipt-kind", badReceiptKind)),
      "receipts[0].reference.kind must be receipt"
    );

    const badResultKind = clone(valid);
    badResultKind.results[0].reference.kind = "receipt";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "bad-result-kind", badResultKind)),
      "results[0].reference.kind must be result"
    );

    const guardProposalMismatch = clone(valid);
    guardProposalMismatch.guards[0].proposal.ref = "interop/proposals/other.json";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "guard-proposal-mismatch", guardProposalMismatch)),
      "guards[0].proposal must match evidence proposal"
    );

    const missingAdapterGuardTarget = clone(valid);
    missingAdapterGuardTarget.adapters[0].source.guardTarget = "missing-target";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-adapter-guard-target", missingAdapterGuardTarget)),
      "adapters[0].source.guardTarget must name a declared guard target"
    );

    const adapterEffectNotGuarded = clone(valid);
    adapterEffectNotGuarded.guards[0].targets[0].effects = [];
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "adapter-effect-not-guarded", adapterEffectNotGuarded)),
      "adapters[0].source.effects must be covered by guard target"
    );

    const subjectNotBound = clone(valid);
    subjectNotBound.subject.ref = "interop/adapters/other.json";
    subjectNotBound.basis = [
      valid.subject,
      subjectNotBound.subject,
      ...subjectNotBound.basis.filter((entry) => entry.kind !== "adapter")
    ];
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "subject-not-bound", subjectNotBound)),
      "subject must match the session, proposal, or a declared adapter or guard reference"
    );

    const unobservedEffect = clone(valid);
    unobservedEffect.effects = ["filesystem.read", "network.read"];
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "unobserved-effect", unobservedEffect)),
      "effects must be covered by observed adapters"
    );

    const badObserverAnchor = clone(valid);
    badObserverAnchor.observer.anchor.kind = "participant";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "bad-observer-anchor", badObserverAnchor)),
      "observer.anchor.kind must be origin"
    );

    const badResult = clone(valid);
    badResult.observation.result = "true";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "bad-result", badResult)),
      "observation.result must be accepted, failed, inconclusive, observed, passed, received, rejected, or unknown"
    );

    const positiveWithMissingReceipt = clone(valid);
    positiveWithMissingReceipt.receipts[0].state = "missing";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-with-missing-receipt", positiveWithMissingReceipt)),
      "positive evidence observations must not have required missing, stale, rejected, or unknown receipts"
    );

    const positiveWithMissingResult = clone(valid);
    positiveWithMissingResult.results[0].state = "unknown";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-with-missing-result", positiveWithMissingResult)),
      "positive evidence observations must not have required missing, stale, rejected, or unknown results"
    );

    const positiveWithPlannedAdapter = clone(valid);
    positiveWithPlannedAdapter.adapters[0].state = "planned";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-with-planned-adapter", positiveWithPlannedAdapter)),
      "positive evidence observations must not have required unverified adapters"
    );

    const positiveWithPendingGuard = clone(valid);
    positiveWithPendingGuard.guards[0].state = "pending";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-with-pending-guard", positiveWithPendingGuard)),
      "positive evidence observations must not have required unsatisfied guards"
    );

    const positiveWithPendingGuardTarget = clone(valid);
    positiveWithPendingGuardTarget.guards[0].targets[0].state = "pending";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-with-pending-guard-target", positiveWithPendingGuardTarget)),
      "positive evidence observations must not have required unready guard targets"
    );

    const positiveWithUnreadyParticipant = clone(valid);
    positiveWithUnreadyParticipant.participants[0].state = "invited";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-with-unready-participant", positiveWithUnreadyParticipant)),
      "positive evidence observations must not have unready participants"
    );

    const positiveWithUnobservedClaim = clone(valid);
    positiveWithUnobservedClaim.claims[0].state = "inferred";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-with-unobserved-claim", positiveWithUnobservedClaim)),
      "positive evidence observations must not have unobserved claims"
    );

    const positiveWithOpenRisk = clone(valid);
    positiveWithOpenRisk.risks[0].state = "open";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-with-open-risk", positiveWithOpenRisk)),
      "positive evidence observations must not have open risks"
    );

    const positiveWithoutArtifact = clone(valid);
    positiveWithoutArtifact.artifacts = [];
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-without-artifact", positiveWithoutArtifact)),
      "positive evidence observations must include artifacts"
    );

    const positiveEffectOnlyOnUnverifiedAdapter = clone(valid);
    positiveEffectOnlyOnUnverifiedAdapter.adapters[0].required = false;
    positiveEffectOnlyOnUnverifiedAdapter.adapters[0].state = "planned";
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "positive-effect-only-on-unverified-adapter", positiveEffectOnlyOnUnverifiedAdapter)),
      "positive evidence observations effects must be covered by verified adapters"
    );

    const badConfidence = clone(valid);
    badConfidence.claims[0].confidence = 1.1;
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "bad-confidence", badConfidence)),
      "claims[0].confidence must be a number from 0 to 1"
    );

    const missingLimits = clone(valid);
    missingLimits.limits = [];
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "missing-limits", missingLimits)),
      "limits must be a non-empty array"
    );

    const unsortedClaims = clone(valid);
    unsortedClaims.claims = [...unsortedClaims.claims].reverse();
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "unsorted-claims", unsortedClaims)),
      "claims.name must be sorted"
    );

    const emptyProof = clone(valid);
    emptyProof.proof.commands = [];
    await assertRejects(
      async () => verifyEvidenceRecordFile(await writeEvidence(tempRoot, "empty-proof", emptyProof)),
      "proof.commands must be a non-empty array"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateBasis(basis, subject, session, proposal, adapterRefs, guardRefs, participantInterfaceRefs, receiptRefs, resultRefs, label) {
  assertArray(basis, label);
  const refs = [];
  let hasSubject = false;
  let hasSession = false;
  let hasProposal = false;
  for (const [index, entry] of basis.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(entry, itemLabel);
    refs.push(referenceKey(entry));
    if (sameReference(entry, subject)) {
      hasSubject = true;
    }
    if (sameReference(entry, session)) {
      hasSession = true;
    }
    if (sameReference(entry, proposal)) {
      hasProposal = true;
    }
  }
  assertSortedUnique(refs, label);
  if (!hasSubject) {
    throw new Error(`${label} must include the subject reference`);
  }
  if (!hasSession) {
    throw new Error(`${label} must include the session reference`);
  }
  if (!hasProposal) {
    throw new Error(`${label} must include the proposal reference`);
  }

  const basisRefs = new Set(refs);
  const missingAdapters = [...adapterRefs].filter((ref) => !basisRefs.has(ref));
  if (missingAdapters.length > 0) {
    throw new Error(`${label} must include each adapter reference: ${missingAdapters.join(", ")}`);
  }
  const missingGuards = [...guardRefs].filter((ref) => !basisRefs.has(ref));
  if (missingGuards.length > 0) {
    throw new Error(`${label} must include each guard reference: ${missingGuards.join(", ")}`);
  }
  const missingParticipantInterfaces = [...participantInterfaceRefs].filter((ref) => !basisRefs.has(ref));
  if (missingParticipantInterfaces.length > 0) {
    throw new Error(`${label} must include each participant interface reference: ${missingParticipantInterfaces.join(", ")}`);
  }
  const missingReceipts = [...receiptRefs].filter((ref) => !basisRefs.has(ref));
  if (missingReceipts.length > 0) {
    throw new Error(`${label} must include each receipt reference: ${missingReceipts.join(", ")}`);
  }
  const missingResults = [...resultRefs].filter((ref) => !basisRefs.has(ref));
  if (missingResults.length > 0) {
    throw new Error(`${label} must include each result reference: ${missingResults.join(", ")}`);
  }
  return basisRefs;
}

function validateObserver(observer, label) {
  assertRecord(observer, label);
  assertKeys(observer, ["anchor", "ref"], [], label);
  validateOriginAnchor(observer.anchor, `${label}.anchor`);
  assertTrimmedString(observer.ref, `${label}.ref`);
}

function validateObservation(observation, label) {
  assertRecord(observation, label);
  assertKeys(observation, ["kind", "method", "result", "summary"], [], label);
  assertToken(observation.kind, `${label}.kind`);
  assertToken(observation.method, `${label}.method`);
  if (!OBSERVATION_RESULTS.has(observation.result)) {
    throw new Error(`${label}.result must be accepted, failed, inconclusive, observed, passed, received, rejected, or unknown`);
  }
  assertTrimmedString(observation.summary, `${label}.summary`);
}

function validateObserved(observed, label) {
  assertRecord(observed, label);
  assertKeys(observed, ["at", "sequence"], [], label);
  assertTrimmedString(observed.at, `${label}.at`);
  assertNonNegativeInteger(observed.sequence, `${label}.sequence`);
}

function validateBindings(bindings, expectedKind, label) {
  assertArray(bindings, label);
  const names = [];
  const refs = [];
  for (const [index, binding] of bindings.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(binding, itemLabel);
    assertKeys(binding, ["name", "reference", "required", "state", "summary"], [], itemLabel);
    assertToken(binding.name, `${itemLabel}.name`);
    validateReference(binding.reference, `${itemLabel}.reference`);
    if (binding.reference.kind !== expectedKind) {
      throw new Error(`${itemLabel}.reference.kind must be ${expectedKind}`);
    }
    if (typeof binding.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!BINDING_STATES.has(binding.state)) {
      throw new Error(`${itemLabel}.state must be accepted, missing, observed, received, rejected, stale, or unknown`);
    }
    assertTrimmedString(binding.summary, `${itemLabel}.summary`);
    names.push(binding.name);
    refs.push(referenceKey(binding.reference));
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.reference`);
  return new Set(refs);
}

function validateParticipants(participants, label) {
  assertArray(participants, label);
  const refs = [];
  const participantsByRef = new Map();
  for (const [index, participant] of participants.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(participant, itemLabel);
    assertKeys(participant, ["anchor", "interface", "ref", "role", "state"], [], itemLabel);
    validateOriginAnchor(participant.anchor, `${itemLabel}.anchor`);
    validateReference(participant.interface, `${itemLabel}.interface`);
    if (participant.interface.kind !== "interface") {
      throw new Error(`${itemLabel}.interface.kind must be interface`);
    }
    assertTrimmedString(participant.ref, `${itemLabel}.ref`);
    assertToken(participant.role, `${itemLabel}.role`);
    if (!PARTICIPANT_STATES.has(participant.state)) {
      throw new Error(`${itemLabel}.state must be active, canceled, completed, failed, invited, left, or ready`);
    }
    refs.push(participant.ref);
    participantsByRef.set(participant.ref, participant);
  }
  assertSortedUnique(refs, `${label}.ref`);
  return participantsByRef;
}

function participantInterfaceRefs(participants) {
  return new Set(participants.map((participant) => referenceKey(participant.interface)));
}

function validateParticipantInterfaceBasis(participants, basisRefs, label) {
  for (const [index, participant] of participants.entries()) {
    if (!basisRefs.has(referenceKey(participant.interface))) {
      throw new Error(`${label}[${index}].interface must name a declared evidence basis reference`);
    }
  }
}

function validateGuards(guards, proposal, label) {
  assertArray(guards, label);
  const names = [];
  const refs = [];
  const targetsByKey = new Map();
  const records = [];
  for (const [index, guard] of guards.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(guard, itemLabel);
    assertKeys(guard, ["kind", "name", "proposal", "reference", "required", "state", "summary", "targets"], [], itemLabel);
    assertToken(guard.kind, `${itemLabel}.kind`);
    assertToken(guard.name, `${itemLabel}.name`);
    validateReference(guard.proposal, `${itemLabel}.proposal`);
    if (guard.proposal.kind !== "proposal") {
      throw new Error(`${itemLabel}.proposal.kind must be proposal`);
    }
    if (!sameReference(guard.proposal, proposal)) {
      throw new Error(`${itemLabel}.proposal must match evidence proposal`);
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
    records.push(guard);
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.reference`);
  return {
    records,
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
    assertTokenArray(target.effects, `${itemLabel}.effects`);
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

function validateAdapters(adapters, participants, targetsByKey, label) {
  assertAnyArray(adapters, label);
  const names = [];
  const refs = [];
  const effects = new Set();
  const records = [];
  for (const [index, adapter] of adapters.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(adapter, itemLabel);
    assertKeys(adapter, ["contract", "effects", "name", "required", "source", "state", "target"], [], itemLabel);
    validateReference(adapter.contract, `${itemLabel}.contract`);
    if (adapter.contract.kind !== "adapter") {
      throw new Error(`${itemLabel}.contract.kind must be adapter`);
    }
    assertTokenArray(adapter.effects, `${itemLabel}.effects`);
    assertToken(adapter.name, `${itemLabel}.name`);
    if (typeof adapter.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    validateAdapterEndpoint(adapter.source, adapter.effects, participants, targetsByKey, `${itemLabel}.source`);
    validateAdapterEndpoint(adapter.target, adapter.effects, participants, targetsByKey, `${itemLabel}.target`);
    if (!ADAPTER_STATES.has(adapter.state)) {
      throw new Error(`${itemLabel}.state must be missing, planned, retired, or verified`);
    }
    for (const effect of adapter.effects) {
      effects.add(effect);
    }
    names.push(adapter.name);
    refs.push(referenceKey(adapter.contract));
    records.push(adapter);
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.contract`);
  return {
    effects,
    records,
    references: new Set(refs)
  };
}

function validateAdapterEndpoint(endpoint, adapterEffects, participants, targetsByKey, label) {
  assertRecord(endpoint, label);
  assertKeys(endpoint, ["effects", "guard", "guardTarget", "interface", "participant", "role"], [], label);
  assertTokenArray(endpoint.effects, `${label}.effects`);
  for (const effect of endpoint.effects) {
    if (!adapterEffects.includes(effect)) {
      throw new Error(`${label}.effects ${effect} must be declared in adapter effects`);
    }
  }
  assertToken(endpoint.guard, `${label}.guard`);
  assertToken(endpoint.guardTarget, `${label}.guardTarget`);
  validateReference(endpoint.interface, `${label}.interface`);
  if (endpoint.interface.kind !== "interface") {
    throw new Error(`${label}.interface.kind must be interface`);
  }
  assertTrimmedString(endpoint.participant, `${label}.participant`);
  assertToken(endpoint.role, `${label}.role`);

  const participant = participants.get(endpoint.participant);
  if (!participant) {
    throw new Error(`${label}.participant must name a declared participant ref`);
  }
  if (endpoint.role !== participant.role) {
    throw new Error(`${label}.role must match participant role`);
  }
  if (!sameReference(endpoint.interface, participant.interface)) {
    throw new Error(`${label}.interface must match participant interface`);
  }

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
  const missing = endpoint.effects.filter((effect) => !targetEffects.has(effect));
  if (missing.length > 0) {
    throw new Error(`${label}.effects must be covered by guard target ${key}: ${missing.join(", ")}`);
  }
}

function validateEffectsCovered(effects, adapterEffects, label) {
  const missing = effects.filter((effect) => !adapterEffects.has(effect));
  if (missing.length > 0) {
    throw new Error(`${label} must be covered by observed adapters: ${missing.join(", ")}`);
  }
}

function validateSubjectBinding(subject, session, proposal, adapterRefs, guardRefs, label) {
  if (sameReference(subject, session) || sameReference(subject, proposal)) {
    return;
  }

  const key = referenceKey(subject);
  if (subject.kind === "adapter" && adapterRefs.has(key)) {
    return;
  }
  if (subject.kind === "guard" && guardRefs.has(key)) {
    return;
  }

  throw new Error(`${label} must match the session, proposal, or a declared adapter or guard reference`);
}

function validateClaims(claims, label) {
  assertArray(claims, label);
  const names = [];
  for (const [index, claim] of claims.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(claim, itemLabel);
    assertKeys(claim, ["confidence", "kind", "name", "state", "summary"], [], itemLabel);
    assertConfidence(claim.confidence, `${itemLabel}.confidence`);
    assertToken(claim.kind, `${itemLabel}.kind`);
    assertToken(claim.name, `${itemLabel}.name`);
    if (!CLAIM_STATES.has(claim.state)) {
      throw new Error(`${itemLabel}.state must be disputed, inferred, observed, or unknown`);
    }
    assertTrimmedString(claim.summary, `${itemLabel}.summary`);
    names.push(claim.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateArtifacts(artifacts, label) {
  assertAnyArray(artifacts, label);
  const names = [];
  for (const [index, artifact] of artifacts.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(artifact, itemLabel);
    assertKeys(artifact, ["commitment", "kind", "name", "ref"], [], itemLabel);
    assertCommitment(artifact.commitment, `${itemLabel}.commitment`);
    assertToken(artifact.kind, `${itemLabel}.kind`);
    assertToken(artifact.name, `${itemLabel}.name`);
    assertTrimmedString(artifact.ref, `${itemLabel}.ref`);
    names.push(artifact.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateLimits(limits, label) {
  assertArray(limits, label);
  const names = [];
  for (const [index, limit] of limits.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(limit, itemLabel);
    assertKeys(limit, ["kind", "name", "summary"], [], itemLabel);
    assertToken(limit.kind, `${itemLabel}.kind`);
    assertToken(limit.name, `${itemLabel}.name`);
    assertTrimmedString(limit.summary, `${itemLabel}.summary`);
    names.push(limit.name);
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

function validateProof(proof, label) {
  assertRecord(proof, label);
  assertKeys(proof, ["commands"], [], label);
  assertStringArray(proof.commands, `${label}.commands`);
  if (proof.commands.length === 0) {
    throw new Error(`${label}.commands must be a non-empty array`);
  }
}

function validatePositiveObservation(evidence, adapters, guards, targetsByKey, label) {
  if (!POSITIVE_OBSERVATION_RESULTS.has(evidence.observation.result)) {
    return;
  }

  const missingReceipts = evidence.receipts
    .filter((receipt) => receipt.required && !POSITIVE_BINDING_STATES.has(receipt.state))
    .map((receipt) => receipt.name);
  if (missingReceipts.length > 0) {
    throw new Error(`${label} positive evidence observations must not have required missing, stale, rejected, or unknown receipts: ${missingReceipts.join(", ")}`);
  }

  const missingResults = evidence.results
    .filter((result) => result.required && !POSITIVE_BINDING_STATES.has(result.state))
    .map((result) => result.name);
  if (missingResults.length > 0) {
    throw new Error(`${label} positive evidence observations must not have required missing, stale, rejected, or unknown results: ${missingResults.join(", ")}`);
  }

  const unverifiedAdapters = adapters
    .filter((adapter) => adapter.required && adapter.state !== "verified")
    .map((adapter) => adapter.name);
  if (unverifiedAdapters.length > 0) {
    throw new Error(`${label} positive evidence observations must not have required unverified adapters: ${unverifiedAdapters.join(", ")}`);
  }

  const unsatisfiedGuards = guards
    .filter((guard) => guard.required && !["satisfied", "waived"].includes(guard.state))
    .map((guard) => guard.name);
  if (unsatisfiedGuards.length > 0) {
    throw new Error(`${label} positive evidence observations must not have required unsatisfied guards: ${unsatisfiedGuards.join(", ")}`);
  }

  const unreadyTargets = [...targetsByKey.values()]
    .filter((target) => target.required && !GUARD_TARGET_READY_STATES.has(target.state))
    .map((target) => `${target.guardName}/${target.target}`);
  if (unreadyTargets.length > 0) {
    throw new Error(`${label} positive evidence observations must not have required unready guard targets: ${unreadyTargets.join(", ")}`);
  }

  const unreadyParticipants = evidence.participants
    .filter((participant) => !PARTICIPANT_OBSERVED_STATES.has(participant.state))
    .map((participant) => participant.ref);
  if (unreadyParticipants.length > 0) {
    throw new Error(`${label} positive evidence observations must not have unready participants: ${unreadyParticipants.join(", ")}`);
  }

  const unobservedClaims = evidence.claims
    .filter((claim) => claim.state !== "observed")
    .map((claim) => claim.name);
  if (unobservedClaims.length > 0) {
    throw new Error(`${label} positive evidence observations must not have unobserved claims: ${unobservedClaims.join(", ")}`);
  }

  const openRisks = evidence.risks
    .filter((risk) => risk.state === "open")
    .map((risk) => risk.name);
  if (openRisks.length > 0) {
    throw new Error(`${label} positive evidence observations must not have open risks: ${openRisks.join(", ")}`);
  }

  if (evidence.artifacts.length === 0) {
    throw new Error(`${label} positive evidence observations must include artifacts`);
  }

  const verifiedAdapterEffects = new Set(adapters.filter((adapter) => adapter.state === "verified").flatMap((adapter) => adapter.effects));
  const unverifiedEffects = evidence.effects.filter((effect) => !verifiedAdapterEffects.has(effect));
  if (unverifiedEffects.length > 0) {
    throw new Error(`${label} positive evidence observations effects must be covered by verified adapters: ${unverifiedEffects.join(", ")}`);
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

function validateOriginAnchor(anchor, label) {
  assertRecord(anchor, label);
  assertKeys(anchor, ["commitment", "kind"], [], label);
  if (anchor.kind !== "origin") {
    throw new Error(`${label}.kind must be origin`);
  }
  assertCommitment(anchor.commitment, `${label}.commitment`);
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

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function assertConfidence(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number from 0 to 1`);
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

function minimalEvidence() {
  const subject = {
    commitment: `sha256:${"a".repeat(64)}`,
    kind: "adapter",
    ref: "interop/adapters/current.json"
  };
  const proposal = {
    commitment: `sha256:${"9".repeat(64)}`,
    kind: "proposal",
    ref: "interop/proposals/current.json"
  };
  const guard = {
    commitment: `sha256:${"8".repeat(64)}`,
    kind: "guard",
    ref: "interop/guards/session-admission.json"
  };
  const receipt = {
    commitment: `sha256:${"b".repeat(64)}`,
    kind: "receipt",
    ref: "interop/receipts/adapter-verifier.json"
  };
  const result = {
    commitment: `sha256:${"c".repeat(64)}`,
    kind: "result",
    ref: "interop/results/adapter-verifier.json"
  };
  const session = {
    commitment: `sha256:${"d".repeat(64)}`,
    kind: "session",
    ref: "interop/sessions/current.json"
  };
  const candidateInterface = {
    commitment: `sha256:${"1".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/candidate.json"
  };
  const plannerInterface = {
    commitment: `sha256:${"2".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/planner.json"
  };

  return {
    adapters: [
      {
        contract: subject,
        effects: ["filesystem.read"],
        name: "interface-to-compatibility",
        required: true,
        source: {
          effects: ["filesystem.read"],
          guard: "session-admission",
          guardTarget: "candidate-target",
          interface: candidateInterface,
          participant: "projection://candidate",
          role: "candidate"
        },
        state: "verified",
        target: {
          effects: ["filesystem.read"],
          guard: "session-admission",
          guardTarget: "planner-target",
          interface: plannerInterface,
          participant: "projection://planner",
          role: "planner"
        }
      }
    ],
    artifacts: [
      {
        commitment: `sha256:${"e".repeat(64)}`,
        kind: "json",
        name: "adapter-contract",
        ref: "interop/adapters/current.json"
      },
      {
        commitment: `sha256:${"f".repeat(64)}`,
        kind: "stdout",
        name: "verifier-output",
        ref: "proof/adapter-verifier.txt"
      }
    ],
    basis: [
      subject,
      guard,
      candidateInterface,
      plannerInterface,
      proposal,
      receipt,
      result,
      session
    ],
    claims: [
      {
        confidence: 0.92,
        kind: "readability",
        name: "adapter-contract-readable",
        state: "observed",
        summary: "The adapter contract could be parsed and checked as canonical JSON."
      },
      {
        confidence: 0.88,
        kind: "verification",
        name: "verification-self-test-passed",
        state: "observed",
        summary: "The reusable verifier accepted the referenced adapter contract shape."
      }
    ],
    effects: ["filesystem.read"],
    guards: [
      {
        kind: "admission",
        name: "session-admission",
        proposal,
        reference: guard,
        required: true,
        state: "satisfied",
        summary: "Required guard target state was ready when evidence was observed.",
        targets: [
          {
            effects: ["filesystem.read"],
            interface: candidateInterface,
            participant: "projection://candidate",
            required: true,
            role: "candidate",
            state: "satisfied",
            target: "candidate-target"
          },
          {
            effects: ["filesystem.read"],
            interface: plannerInterface,
            participant: "projection://planner",
            required: true,
            role: "planner",
            state: "satisfied",
            target: "planner-target"
          }
        ]
      }
    ],
    kind: INTEROP_EVIDENCE_KIND,
    limits: [
      {
        kind: "permission",
        name: "not-authorization",
        summary: "This observation does not grant permission to run the adapter or access data."
      },
      {
        kind: "runtime",
        name: "not-runtime-execution",
        summary: "This observation does not prove that adapter execution occurred."
      }
    ],
    name: "adapter-contract-observed",
    observation: {
      kind: "adapter",
      method: "self-test",
      result: "passed",
      summary: "The adapter contract was observed through a reusable verifier."
    },
    observed: {
      at: "declared-by-record",
      sequence: 1
    },
    observer: {
      anchor: {
        commitment: `sha256:${"e".repeat(64)}`,
        kind: "origin"
      },
      ref: "projection://observer"
    },
    participants: [
      {
        anchor: {
          commitment: `sha256:${"3".repeat(64)}`,
          kind: "origin"
        },
        interface: candidateInterface,
        ref: "projection://candidate",
        role: "candidate",
        state: "ready"
      },
      {
        anchor: {
          commitment: `sha256:${"4".repeat(64)}`,
          kind: "origin"
        },
        interface: plannerInterface,
        ref: "projection://planner",
        role: "planner",
        state: "ready"
      }
    ],
    proof: {
      commands: ["node projection-root/kit/interop/evidence/verify.mjs interop/evidence/current.json"]
    },
    proposal,
    receipts: [
      {
        name: "adapter-verifier-receipt",
        reference: receipt,
        required: true,
        state: "received",
        summary: "Verifier receipt was received for the adapter evidence observation."
      }
    ],
    results: [
      {
        name: "adapter-verifier-result",
        reference: result,
        required: true,
        state: "observed",
        summary: "Verifier result was observed for the adapter evidence observation."
      }
    ],
    risks: [
      {
        kind: "staleness",
        mitigation: "refresh the evidence when the subject commitment changes",
        name: "stale-subject",
        severity: "medium",
        state: "mitigated"
      }
    ],
    session,
    subject,
    version: INTEROP_EVIDENCE_VERSION
  };
}

async function writeEvidence(tempRoot, name, evidence) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(evidence)}\n`, "utf8");
  return filePath;
}

async function writePrettyEvidence(tempRoot, name, evidence) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
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
    console.log("projection interop evidence verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/evidence/verify.mjs <evidence.json> [--json] | --self-test");
  }

  const evidence = await verifyEvidenceRecordFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(evidence));
    return;
  }

  console.log("projection interop evidence record ok");
  console.log(`evidence: ${evidence.name}`);
  console.log(`subject: ${evidence.subject.kind}:${evidence.subject.ref}`);
  console.log(`result: ${evidence.observation.result}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop evidence: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
