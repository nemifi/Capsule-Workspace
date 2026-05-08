#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_GUARD_KIND = "projection-interop/guard";
export const INTEROP_GUARD_VERSION = 1;

const CHECK_STATES = new Set(["blocked", "failed", "pending", "satisfied", "unknown", "waived"]);
const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DECISION_STATES = new Set(["approved", "denied", "pending", "unknown", "waived"]);
const GUARD_STATES = new Set(["blocked", "draft", "expired", "failed", "pending", "satisfied", "waived"]);
const PARTICIPANT_STATES = new Set(["accepted", "declined", "pending", "ready", "unknown"]);
const RISK_SEVERITIES = new Set(["critical", "high", "info", "low", "medium"]);
const RISK_STATES = new Set(["accepted", "mitigated", "open"]);
const TARGET_READY_STATES = new Set(["ready", "satisfied", "waived"]);
const TARGET_STATES = new Set(["blocked", "pending", "ready", "satisfied", "unknown", "waived"]);
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

export async function verifyGuardRecordFile(filePath) {
  const label = "interop guard record";
  const text = await readFile(filePath, "utf8");
  const guard = parseJson(text, label);

  verifyGuardRecord(guard, label);
  if (text !== `${stableStringify(guard)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return guard;
}

export function verifyGuardRecord(guard, label = "interop guard record") {
  assertRecord(guard, label);
  assertKeys(
    guard,
    [
      "artifacts",
      "basis",
      "checks",
      "decisions",
      "guardType",
      "kind",
      "limits",
      "name",
      "participants",
      "proof",
      "proposal",
      "risks",
      "scope",
      "state",
      "targets",
      "version"
    ],
    [],
    label
  );

  if (guard.kind !== INTEROP_GUARD_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_GUARD_KIND}`);
  }
  if (guard.version !== INTEROP_GUARD_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_GUARD_VERSION}`);
  }

  assertToken(guard.name, `${label}.name`);
  assertToken(guard.guardType, `${label}.guardType`);
  if (!GUARD_STATES.has(guard.state)) {
    throw new Error(`${label}.state must be blocked, draft, expired, failed, pending, satisfied, or waived`);
  }

  validateReference(guard.proposal, `${label}.proposal`);
  if (guard.proposal.kind !== "proposal") {
    throw new Error(`${label}.proposal.kind must be proposal`);
  }
  const basisRefs = validateBasis(guard.basis, guard.proposal, `${label}.basis`);
  const participants = validateParticipants(guard.participants, `${label}.participants`);
  const scope = validateScope(guard.scope, guard.proposal, participants, `${label}.scope`);
  const targets = validateTargets(guard.targets, participants, basisRefs, guard.proposal, scope.effects, `${label}.targets`);
  validateScopeSubjectCoverage(scope.subjects, targets, `${label}.scope.subjects`);
  validateScopeEffectsCovered(scope.effects, targets, `${label}.scope.effects`);
  const checkCoverage = validateChecks(guard.checks, targets, `${label}.checks`);
  validateDecisions(guard.decisions, participants, targets, `${label}.decisions`);
  validateLimits(guard.limits, `${label}.limits`);
  validateArtifacts(guard.artifacts, basisRefs, `${label}.artifacts`);
  validateRisks(guard.risks, `${label}.risks`);
  validateProof(guard.proof, `${label}.proof`);
  validateSatisfiedState(guard, participants, targets, checkCoverage, label);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-guard-"));

  try {
    const valid = minimalGuard();
    await verifyGuardRecordFile(await writeGuard(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifyGuardRecordFile(await writePrettyGuard(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const missingProposalBasis = clone(valid);
    missingProposalBasis.basis = [
      {
        commitment: `sha256:${"9".repeat(64)}`,
        kind: "evidence",
        ref: "interop/evidence/policy-review.json"
      }
    ];
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "missing-proposal-basis", missingProposalBasis)),
      "basis must include the proposal reference"
    );

    const unknownDecisionParticipant = clone(valid);
    unknownDecisionParticipant.decisions[0].participant = "projection://missing";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "unknown-decision-participant", unknownDecisionParticipant)),
      "decisions[0].participant must name a declared participant ref"
    );

    const missingParticipantTarget = clone(valid);
    missingParticipantTarget.targets = missingParticipantTarget.targets.filter((target) => target.participant !== "projection://provider");
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "missing-participant-target", missingParticipantTarget)),
      "targets must include each participant ref"
    );

    const targetInterfaceMismatch = clone(valid);
    targetInterfaceMismatch.targets[0].interface.ref = "interop/interfaces/missing.json";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "target-interface-mismatch", targetInterfaceMismatch)),
      "targets[0].interface must match the participant interface"
    );

    const targetRoleMismatch = clone(valid);
    targetRoleMismatch.targets[0].roles = ["requester"];
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "target-role-mismatch", targetRoleMismatch)),
      "targets[0].roles must include the participant role"
    );

    const targetReadyWithUnknownParticipant = clone(valid);
    targetReadyWithUnknownParticipant.participants[0].state = "unknown";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "target-ready-with-unknown-participant", targetReadyWithUnknownParticipant)),
      "targets[0].state ready or satisfied targets must have accepted or ready participants"
    );

    const missingScopeTargetSubject = clone(valid);
    missingScopeTargetSubject.scope.subjects = missingScopeTargetSubject.scope.subjects.filter((entry) => entry.ref !== "interop/interfaces/provider.json");
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "missing-scope-target-subject", missingScopeTargetSubject)),
      "scope.subjects must include each target interface reference"
    );

    const scopeEffectWithoutTarget = clone(valid);
    scopeEffectWithoutTarget.scope.effects = ["filesystem.read", "network.read"];
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "scope-effect-without-target", scopeEffectWithoutTarget)),
      "scope.effects must be covered by target effects"
    );

    const checkUnknownTarget = clone(valid);
    checkUnknownTarget.checks[0].target = "missing-target";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "check-unknown-target", checkUnknownTarget)),
      "checks[0].target must name a declared target"
    );

    const checkSubjectMismatch = clone(valid);
    checkSubjectMismatch.checks[0].subject = "projection://requester";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "check-subject-mismatch", checkSubjectMismatch)),
      "checks[0].subject must match the target participant"
    );

    const decisionTargetMismatch = clone(valid);
    decisionTargetMismatch.decisions[0].target = "requester-target";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "decision-target-mismatch", decisionTargetMismatch)),
      "decisions[0].target must belong to the decision participant"
    );

    const satisfiedWithPendingCheck = clone(valid);
    satisfiedWithPendingCheck.checks[0].state = "pending";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "satisfied-with-pending-check", satisfiedWithPendingCheck)),
      "satisfied guards must not have required unsatisfied checks"
    );

    const satisfiedWithPendingTarget = clone(valid);
    satisfiedWithPendingTarget.targets[0].state = "pending";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "satisfied-with-pending-target", satisfiedWithPendingTarget)),
      "satisfied guards must not have required unready targets"
    );

    const satisfiedWithDeniedDecision = clone(valid);
    satisfiedWithDeniedDecision.decisions[0].state = "denied";
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "satisfied-with-denied-decision", satisfiedWithDeniedDecision)),
      "satisfied guards must not have denied, pending, or unknown decisions"
    );

    const satisfiedWithoutParticipantDecision = clone(valid);
    satisfiedWithoutParticipantDecision.decisions = satisfiedWithoutParticipantDecision.decisions.slice(0, 1);
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "satisfied-without-participant-decision", satisfiedWithoutParticipantDecision)),
      "satisfied guards must include approved or waived decisions for required participants"
    );

    const satisfiedWithoutTargetDecision = clone(valid);
    satisfiedWithoutTargetDecision.participants[1].required = false;
    satisfiedWithoutTargetDecision.decisions = satisfiedWithoutTargetDecision.decisions.slice(0, 1);
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "satisfied-without-target-decision", satisfiedWithoutTargetDecision)),
      "satisfied guards must include approved or waived decisions for required targets"
    );

    const satisfiedWithoutTargetCheck = clone(valid);
    satisfiedWithoutTargetCheck.checks = satisfiedWithoutTargetCheck.checks.filter((check) => check.target !== "provider-target");
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "satisfied-without-target-check", satisfiedWithoutTargetCheck)),
      "satisfied guards must include satisfied or waived checks for required targets"
    );

    const artifactNotInBasis = clone(valid);
    artifactNotInBasis.basis = artifactNotInBasis.basis.filter((entry) => entry.kind !== "evidence");
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "artifact-not-in-basis", artifactNotInBasis)),
      "artifacts[0].reference must name a declared guard basis reference"
    );

    const emptyLimits = clone(valid);
    emptyLimits.limits = [];
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "empty-limits", emptyLimits)),
      "limits must be a non-empty array"
    );

    const tooManyParticipants = clone(valid);
    tooManyParticipants.scope.participantMaximum = 1;
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "too-many-participants", tooManyParticipants)),
      "scope.participantMaximum must be greater than or equal to participants.length"
    );

    const unsortedChecks = clone(valid);
    unsortedChecks.checks = [...unsortedChecks.checks].reverse();
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "unsorted-checks", unsortedChecks)),
      "checks.name must be sorted"
    );

    const emptyProof = clone(valid);
    emptyProof.proof.commands = [];
    await assertRejects(
      async () => verifyGuardRecordFile(await writeGuard(tempRoot, "empty-proof", emptyProof)),
      "proof.commands must be a non-empty array"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateBasis(basis, proposal, label) {
  assertArray(basis, label);
  const refs = [];
  let hasProposal = false;
  for (const [index, entry] of basis.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(entry, itemLabel);
    refs.push(referenceKey(entry));
    if (sameReference(entry, proposal)) {
      hasProposal = true;
    }
  }
  assertSortedUnique(refs, label);
  if (!hasProposal) {
    throw new Error(`${label} must include the proposal reference`);
  }
  return new Set(refs);
}

function validateScope(scope, proposal, participants, label) {
  assertRecord(scope, label);
  assertKeys(scope, ["duration", "effects", "participantMaximum", "subjects"], [], label);
  assertTrimmedString(scope.duration, `${label}.duration`);
  assertTokenArray(scope.effects, `${label}.effects`);
  assertNonNegativeInteger(scope.participantMaximum, `${label}.participantMaximum`);
  if (scope.participantMaximum < participants.size) {
    throw new Error(`${label}.participantMaximum must be greater than or equal to participants.length`);
  }
  const subjectRefs = validateReferences(scope.subjects, `${label}.subjects`);
  if (!subjectRefs.has(referenceKey(proposal))) {
    throw new Error(`${label}.subjects must include the proposal reference`);
  }
  return {
    effects: new Set(scope.effects),
    subjects: subjectRefs
  };
}

function validateParticipants(participants, label) {
  assertArray(participants, label);
  const refs = [];
  const participantsByRef = new Map();
  for (const [index, participant] of participants.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(participant, itemLabel);
    assertKeys(participant, ["anchor", "interface", "ref", "required", "role", "state"], [], itemLabel);
    validateOriginAnchor(participant.anchor, `${itemLabel}.anchor`);
    validateReference(participant.interface, `${itemLabel}.interface`);
    if (participant.interface.kind !== "interface") {
      throw new Error(`${itemLabel}.interface.kind must be interface`);
    }
    assertTrimmedString(participant.ref, `${itemLabel}.ref`);
    if (typeof participant.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    assertToken(participant.role, `${itemLabel}.role`);
    if (!PARTICIPANT_STATES.has(participant.state)) {
      throw new Error(`${itemLabel}.state must be accepted, declined, pending, ready, or unknown`);
    }
    refs.push(participant.ref);
    participantsByRef.set(participant.ref, participant);
  }
  assertSortedUnique(refs, `${label}.ref`);
  return participantsByRef;
}

function validateTargets(targets, participants, basisRefs, proposal, scopeEffects, label) {
  assertArray(targets, label);
  const names = [];
  const participantRefs = [];
  const targetsByName = new Map();
  const targetsByParticipant = new Map();
  for (const [index, target] of targets.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(target, itemLabel);
    assertKeys(target, ["basis", "effects", "interface", "name", "participant", "proposal", "required", "roles", "state", "summary"], [], itemLabel);
    validateTargetBasis(target.basis, basisRefs, `${itemLabel}.basis`);
    const targetBasisRefs = new Set(target.basis.map((entry) => referenceKey(entry)));
    validateReference(target.proposal, `${itemLabel}.proposal`);
    if (target.proposal.kind !== "proposal") {
      throw new Error(`${itemLabel}.proposal.kind must be proposal`);
    }
    if (!sameReference(target.proposal, proposal)) {
      throw new Error(`${itemLabel}.proposal must match guard proposal`);
    }
    if (!targetBasisRefs.has(referenceKey(target.proposal))) {
      throw new Error(`${itemLabel}.basis must include the target proposal reference`);
    }
    validateReference(target.interface, `${itemLabel}.interface`);
    if (target.interface.kind !== "interface") {
      throw new Error(`${itemLabel}.interface.kind must be interface`);
    }
    assertToken(target.name, `${itemLabel}.name`);
    assertTrimmedString(target.participant, `${itemLabel}.participant`);
    const participant = participants.get(target.participant);
    if (!participant) {
      throw new Error(`${itemLabel}.participant must name a declared participant ref`);
    }
    if (!sameReference(target.interface, participant.interface)) {
      throw new Error(`${itemLabel}.interface must match the participant interface`);
    }
    if (!targetBasisRefs.has(referenceKey(target.interface))) {
      throw new Error(`${itemLabel}.basis must include the target interface reference`);
    }
    if (typeof target.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    assertTokenArray(target.roles, `${itemLabel}.roles`);
    if (!target.roles.includes(participant.role)) {
      throw new Error(`${itemLabel}.roles must include the participant role`);
    }
    assertTokenArray(target.effects, `${itemLabel}.effects`);
    for (const effect of target.effects) {
      if (!scopeEffects.has(effect)) {
        throw new Error(`${itemLabel}.effects must be included in guard scope effects`);
      }
    }
    if (!TARGET_STATES.has(target.state)) {
      throw new Error(`${itemLabel}.state must be blocked, pending, ready, satisfied, unknown, or waived`);
    }
    if (TARGET_READY_STATES.has(target.state) && !["accepted", "ready"].includes(participant.state)) {
      throw new Error(`${itemLabel}.state ready or satisfied targets must have accepted or ready participants`);
    }
    assertTrimmedString(target.summary, `${itemLabel}.summary`);
    names.push(target.name);
    participantRefs.push(target.participant);
    targetsByName.set(target.name, target);
    targetsByParticipant.set(target.participant, target);
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(participantRefs, `${label}.participant`);

  const missingParticipants = [...participants.keys()].filter((participant) => !targetsByParticipant.has(participant));
  if (missingParticipants.length > 0) {
    throw new Error(`${label} must include each participant ref: ${missingParticipants.join(", ")}`);
  }

  return targetsByName;
}

function validateTargetBasis(basis, basisRefs, label) {
  assertArray(basis, label);
  const refs = [];
  for (const [index, entry] of basis.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(entry, itemLabel);
    const key = referenceKey(entry);
    if (!basisRefs.has(key)) {
      throw new Error(`${itemLabel} must name a declared guard basis reference`);
    }
    refs.push(key);
  }
  assertSortedUnique(refs, label);
}

function validateScopeSubjectCoverage(subjectRefs, targets, label) {
  const missingInterfaces = [...targets.values()]
    .map((target) => referenceKey(target.interface))
    .filter((ref, index, refs) => refs.indexOf(ref) === index)
    .filter((ref) => !subjectRefs.has(ref));
  if (missingInterfaces.length > 0) {
    throw new Error(`${label} must include each target interface reference: ${missingInterfaces.join(", ")}`);
  }
}

function validateScopeEffectsCovered(scopeEffects, targets, label) {
  const targetEffects = new Set();
  for (const target of targets.values()) {
    for (const effect of target.effects) {
      targetEffects.add(effect);
    }
  }
  const missingEffects = [...scopeEffects].filter((effect) => !targetEffects.has(effect));
  if (missingEffects.length > 0) {
    throw new Error(`${label} must be covered by target effects: ${missingEffects.join(", ")}`);
  }
}

function validateChecks(checks, targets, label) {
  assertArray(checks, label);
  const names = [];
  const readyChecksByTarget = new Map();
  for (const [index, check] of checks.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(check, itemLabel);
    assertKeys(check, ["effects", "kind", "name", "required", "state", "subject", "summary", "target"], [], itemLabel);
    assertTokenArray(check.effects, `${itemLabel}.effects`);
    assertToken(check.kind, `${itemLabel}.kind`);
    assertToken(check.name, `${itemLabel}.name`);
    if (typeof check.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!CHECK_STATES.has(check.state)) {
      throw new Error(`${itemLabel}.state must be blocked, failed, pending, satisfied, unknown, or waived`);
    }
    assertTrimmedString(check.subject, `${itemLabel}.subject`);
    assertToken(check.target, `${itemLabel}.target`);
    const target = targets.get(check.target);
    if (!target) {
      throw new Error(`${itemLabel}.target must name a declared target`);
    }
    if (check.subject !== target.participant) {
      throw new Error(`${itemLabel}.subject must match the target participant`);
    }
    for (const effect of check.effects) {
      if (!target.effects.includes(effect)) {
        throw new Error(`${itemLabel}.effects must be included in the target effects`);
      }
    }
    assertTrimmedString(check.summary, `${itemLabel}.summary`);
    if (check.required && ["satisfied", "waived"].includes(check.state)) {
      readyChecksByTarget.set(check.target, (readyChecksByTarget.get(check.target) ?? 0) + 1);
    }
    names.push(check.name);
  }
  assertSortedUnique(names, `${label}.name`);
  return readyChecksByTarget;
}

function validateDecisions(decisions, participants, targets, label) {
  assertArray(decisions, label);
  const names = [];
  for (const [index, decision] of decisions.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(decision, itemLabel);
    assertKeys(decision, ["kind", "name", "participant", "reason", "state", "target"], [], itemLabel);
    assertToken(decision.kind, `${itemLabel}.kind`);
    assertToken(decision.name, `${itemLabel}.name`);
    assertTrimmedString(decision.participant, `${itemLabel}.participant`);
    if (!participants.has(decision.participant)) {
      throw new Error(`${itemLabel}.participant must name a declared participant ref`);
    }
    assertTrimmedString(decision.reason, `${itemLabel}.reason`);
    if (!DECISION_STATES.has(decision.state)) {
      throw new Error(`${itemLabel}.state must be approved, denied, pending, unknown, or waived`);
    }
    assertToken(decision.target, `${itemLabel}.target`);
    const target = targets.get(decision.target);
    if (!target) {
      throw new Error(`${itemLabel}.target must name a declared target`);
    }
    if (target.participant !== decision.participant) {
      throw new Error(`${itemLabel}.target must belong to the decision participant`);
    }
    names.push(decision.name);
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

function validateArtifacts(artifacts, basisRefs, label) {
  assertAnyArray(artifacts, label);
  const names = [];
  for (const [index, artifact] of artifacts.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(artifact, itemLabel);
    assertKeys(artifact, ["name", "reference", "summary"], [], itemLabel);
    assertToken(artifact.name, `${itemLabel}.name`);
    validateReference(artifact.reference, `${itemLabel}.reference`);
    const artifactRef = referenceKey(artifact.reference);
    if (!basisRefs.has(artifactRef)) {
      throw new Error(`${itemLabel}.reference must name a declared guard basis reference`);
    }
    assertTrimmedString(artifact.summary, `${itemLabel}.summary`);
    names.push(artifact.name);
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

function validateSatisfiedState(guard, participants, targets, checkCoverage, label) {
  if (guard.state !== "satisfied") {
    return;
  }

  const unsatisfiedChecks = guard.checks
    .filter((check) => check.required && !["satisfied", "waived"].includes(check.state))
    .map((check) => check.name);
  if (unsatisfiedChecks.length > 0) {
    throw new Error(`${label} satisfied guards must not have required unsatisfied checks: ${unsatisfiedChecks.join(", ")}`);
  }

  const unreadyParticipants = [...participants.values()]
    .filter((participant) => participant.required && !["accepted", "ready"].includes(participant.state))
    .map((participant) => participant.ref);
  if (unreadyParticipants.length > 0) {
    throw new Error(`${label} satisfied guards must not have required unready participants: ${unreadyParticipants.join(", ")}`);
  }

  const unreadyTargets = [...targets.values()]
    .filter((target) => target.required && !TARGET_READY_STATES.has(target.state))
    .map((target) => target.name);
  if (unreadyTargets.length > 0) {
    throw new Error(`${label} satisfied guards must not have required unready targets: ${unreadyTargets.join(", ")}`);
  }

  const blockingDecisions = guard.decisions
    .filter((decision) => ["denied", "pending", "unknown"].includes(decision.state))
    .map((decision) => decision.name);
  if (blockingDecisions.length > 0) {
    throw new Error(`${label} satisfied guards must not have denied, pending, or unknown decisions: ${blockingDecisions.join(", ")}`);
  }

  const missingDecisions = [...participants.values()]
    .filter((participant) => participant.required)
    .filter((participant) => !guard.decisions.some((decision) =>
      decision.participant === participant.ref && ["approved", "waived"].includes(decision.state)
    ))
    .map((participant) => participant.ref);
  if (missingDecisions.length > 0) {
    throw new Error(`${label} satisfied guards must include approved or waived decisions for required participants: ${missingDecisions.join(", ")}`);
  }

  const missingTargetDecisions = [...targets.values()]
    .filter((target) => target.required)
    .filter((target) => !guard.decisions.some((decision) =>
      decision.target === target.name && ["approved", "waived"].includes(decision.state)
    ))
    .map((target) => target.name);
  if (missingTargetDecisions.length > 0) {
    throw new Error(`${label} satisfied guards must include approved or waived decisions for required targets: ${missingTargetDecisions.join(", ")}`);
  }

  const missingTargetChecks = [...targets.values()]
    .filter((target) => target.required)
    .filter((target) => !checkCoverage.has(target.name))
    .map((target) => target.name);
  if (missingTargetChecks.length > 0) {
    throw new Error(`${label} satisfied guards must include satisfied or waived checks for required targets: ${missingTargetChecks.join(", ")}`);
  }
}

function validateReferences(references, label) {
  assertArray(references, label);
  const refs = [];
  for (const [index, reference] of references.entries()) {
    validateReference(reference, `${label}[${index}]`);
    refs.push(referenceKey(reference));
  }
  assertSortedUnique(refs, label);
  return new Set(refs);
}

function validateReference(reference, label) {
  assertRecord(reference, label);
  assertKeys(reference, ["commitment", "kind", "ref"], [], label);
  assertCommitment(reference.commitment, `${label}.commitment`);
  assertToken(reference.kind, `${label}.kind`);
  assertTrimmedString(reference.ref, `${label}.ref`);
}

function validateOriginAnchor(anchor, label) {
  assertRecord(anchor, label);
  assertKeys(anchor, ["commitment", "kind"], [], label);
  if (anchor.kind !== "origin") {
    throw new Error(`${label}.kind must be origin`);
  }
  assertCommitment(anchor.commitment, `${label}.commitment`);
}

function referenceKey(reference) {
  return `${reference.kind}:${reference.ref}:${reference.commitment}`;
}

function sameReference(left, right) {
  return left.kind === right.kind && left.ref === right.ref && left.commitment === right.commitment;
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

function assertSortedUnique(values, label) {
  const sorted = [...values].sort();
  if (JSON.stringify(values) !== JSON.stringify(sorted)) {
    throw new Error(`${label} must be sorted`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function minimalGuard() {
  const proposal = {
    commitment: `sha256:${"a".repeat(64)}`,
    kind: "proposal",
    ref: "interop/proposals/current.json"
  };
  const policyReview = {
    commitment: `sha256:${"d".repeat(64)}`,
    kind: "evidence",
    ref: "interop/evidence/policy-review.json"
  };
  const providerInterface = {
    commitment: `sha256:${"b".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/provider.json"
  };
  const requesterInterface = {
    commitment: `sha256:${"c".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/requester.json"
  };

  return {
    artifacts: [
      {
        name: "policy-review",
        reference: policyReview,
        summary: "Body-owned policy review is visible as supporting evidence."
      }
    ],
    basis: [policyReview, providerInterface, requesterInterface, proposal],
    checks: [
      {
        effects: ["filesystem.read"],
        kind: "authorization",
        name: "authorization-approved",
        required: true,
        state: "satisfied",
        subject: "projection://provider",
        target: "provider-target",
        summary: "Body-owned authorization check is satisfied before planning proceeds."
      },
      {
        effects: ["filesystem.read"],
        kind: "runtime",
        name: "runtime-ready",
        required: true,
        state: "satisfied",
        subject: "projection://requester",
        target: "requester-target",
        summary: "Required runtime surface is available before a session is opened."
      }
    ],
    decisions: [
      {
        kind: "authorization",
        name: "provider-approval",
        participant: "projection://provider",
        reason: "Provider allows the bounded proposal to proceed as record state.",
        state: "approved",
        target: "provider-target"
      },
      {
        kind: "request",
        name: "requester-approval",
        participant: "projection://requester",
        reason: "Requester confirms the bounded proposal as record state.",
        state: "approved",
        target: "requester-target"
      }
    ],
    guardType: "policy-consent",
    kind: INTEROP_GUARD_KIND,
    limits: [
      {
        kind: "boundary",
        name: "no-consent-capture",
        summary: "The guard records visible consent status but does not capture consent."
      },
      {
        kind: "boundary",
        name: "no-permission-grant",
        summary: "The guard records visible authorization status but does not grant permission."
      }
    ],
    name: "provider-read-guard",
    participants: [
      {
        anchor: {
          commitment: `sha256:${"e".repeat(64)}`,
          kind: "origin"
        },
        interface: providerInterface,
        ref: "projection://provider",
        required: true,
        role: "provider",
        state: "accepted"
      },
      {
        anchor: {
          commitment: `sha256:${"f".repeat(64)}`,
          kind: "origin"
        },
        interface: requesterInterface,
        ref: "projection://requester",
        required: true,
        role: "requester",
        state: "ready"
      }
    ],
    proof: {
      commands: ["node projection-root/kit/interop/guard/verify.mjs interop/guards/current.json"]
    },
    proposal,
    risks: [
      {
        kind: "runtime",
        mitigation: "Treat guard satisfaction as planning input, not body runtime execution.",
        name: "premature-execution",
        severity: "high",
        state: "mitigated"
      }
    ],
    scope: {
      duration: "PT30M",
      effects: ["filesystem.read"],
      participantMaximum: 2,
      subjects: [providerInterface, requesterInterface, proposal]
    },
    state: "satisfied",
    targets: [
      {
        basis: [providerInterface, proposal],
        effects: ["filesystem.read"],
        interface: providerInterface,
        name: "provider-target",
        participant: "projection://provider",
        proposal,
        required: true,
        roles: ["provider"],
        state: "satisfied",
        summary: "Provider target is guarded for the bounded proposal."
      },
      {
        basis: [requesterInterface, proposal],
        effects: ["filesystem.read"],
        interface: requesterInterface,
        name: "requester-target",
        participant: "projection://requester",
        proposal,
        required: true,
        roles: ["requester"],
        state: "ready",
        summary: "Requester target is guarded for the bounded proposal."
      }
    ],
    version: INTEROP_GUARD_VERSION
  };
}

async function writeGuard(tempRoot, name, guard) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(guard)}\n`, "utf8");
  return filePath;
}

async function writePrettyGuard(tempRoot, name, guard) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(guard, null, 2)}\n`, "utf8");
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
    console.log("projection interop guard verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/guard/verify.mjs <guard.json> [--json] | --self-test");
  }

  const guard = await verifyGuardRecordFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(guard));
    return;
  }

  console.log("projection interop guard record ok");
  console.log(`guard: ${guard.name}`);
  console.log(`type: ${guard.guardType}`);
  console.log(`state: ${guard.state}`);
  console.log(`participants: ${guard.participants.length}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop guard: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
