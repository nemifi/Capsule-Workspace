#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_SESSION_KIND = "projection-interop/session";
export const INTEROP_SESSION_VERSION = 1;

const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;
const ADAPTER_STATES = new Set(["missing", "planned", "retired", "verified"]);
const ADMISSION_STATES = new Set(["admitted", "blocked", "closed", "pending"]);
const EVIDENCE_STATES = new Set(["missing", "observed", "stale"]);
const FAILURE_MODES = new Set(["abort", "compensate", "continue", "retry"]);
const GUARD_STATES = new Set(["blocked", "expired", "failed", "pending", "satisfied", "unknown", "waived"]);
const GUARD_TARGET_READY_STATES = new Set(["ready", "satisfied", "waived"]);
const GUARD_TARGET_STATES = new Set(["blocked", "pending", "ready", "satisfied", "unknown", "waived"]);
const PARTICIPANT_ADMITTED_STATES = new Set(["active", "completed", "ready"]);
const PARTICIPANT_STATES = new Set(["active", "canceled", "completed", "failed", "invited", "left", "ready"]);
const RISK_SEVERITIES = new Set(["critical", "high", "info", "low", "medium"]);
const RISK_STATES = new Set(["accepted", "mitigated", "open"]);
const ROLE_ADMITTED_STATES = new Set(["active", "completed", "ready"]);
const ROLE_STATES = new Set(["active", "blocked", "completed", "failed", "pending", "ready"]);
const SESSION_STATES = new Set(["canceled", "closed", "completed", "failed", "open", "paused", "proposed", "running"]);

export async function verifySessionRecordFile(filePath) {
  const label = "interop session record";
  const text = await readFile(filePath, "utf8");
  const session = parseJson(text, label);

  verifySessionRecord(session, label);
  if (text !== `${stableStringify(session)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return session;
}

export function verifySessionRecord(session, label = "interop session record") {
  assertRecord(session, label);
  assertKeys(
    session,
    [
      "admission",
      "adapters",
      "basis",
      "bounds",
      "compatibility",
      "evidenceNeeded",
      "failurePolicy",
      "guards",
      "kind",
      "lifecycle",
      "name",
      "participants",
      "proof",
      "proposal",
      "risks",
      "roles",
      "state",
      "version"
    ],
    [],
    label
  );

  if (session.kind !== INTEROP_SESSION_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_SESSION_KIND}`);
  }
  if (session.version !== INTEROP_SESSION_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_SESSION_VERSION}`);
  }

  assertToken(session.name, `${label}.name`);
  if (!SESSION_STATES.has(session.state)) {
    throw new Error(`${label}.state must be canceled, closed, completed, failed, open, paused, proposed, or running`);
  }

  validateReference(session.compatibility, `${label}.compatibility`);
  if (session.compatibility.kind !== "compatibility") {
    throw new Error(`${label}.compatibility.kind must be compatibility`);
  }
  validateReference(session.proposal, `${label}.proposal`);
  if (session.proposal.kind !== "proposal") {
    throw new Error(`${label}.proposal.kind must be proposal`);
  }
  const guards = validateGuards(session.guards, session.proposal, `${label}.guards`);
  const adapters = validateAdapters(session.adapters, `${label}.adapters`);
  const basisRefs = validateBasis(session.basis, session.compatibility, session.proposal, adapters.references, guards.references, `${label}.basis`);
  validateAdmission(session.admission, `${label}.admission`);
  validateLifecycle(session.lifecycle, session.state, `${label}.lifecycle`);
  const participants = validateParticipants(session.participants, basisRefs, `${label}.participants`);
  const roles = validateRoles(session.roles, participants, `${label}.roles`);
  validateParticipantRoles(session.participants, roles, `${label}.participants`);
  validateAdapterRoles(session.adapters, roles, `${label}.adapters`);
  validateRequiredRoleAdapterCoverage(session.roles, session.adapters, `${label}.roles`);
  validateGuardTargetCoverage(guards.targetsByKey, participants, roles, `${label}.guards`);
  validateAdapterBindings(session.adapters, participants, roles, guards.targetsByKey, `${label}.adapters`);
  validateBounds(session.bounds, session.participants, `${label}.bounds`);
  validateBoundsEffects(session.bounds, session.adapters, `${label}.bounds`);
  validateFailurePolicy(session.failurePolicy, `${label}.failurePolicy`);
  validateRisks(session.risks, `${label}.risks`);
  validateEvidenceNeeded(session.evidenceNeeded, `${label}.evidenceNeeded`);
  validateProof(session.proof, `${label}.proof`);
  validateStateGuards(session, guards, label);
  validateAdmittedState(session, guards, label);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-session-"));

  try {
    const valid = minimalSession();
    await verifySessionRecordFile(await writeSession(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifySessionRecordFile(await writePrettySession(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const missingCompatibilityBasis = clone(valid);
    missingCompatibilityBasis.basis = missingCompatibilityBasis.basis.filter((entry) => entry.kind !== "compatibility");
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "missing-compatibility-basis", missingCompatibilityBasis)),
      "basis must include the compatibility reference"
    );

    const missingAdapterBasis = clone(valid);
    missingAdapterBasis.basis = missingAdapterBasis.basis.filter((entry) => entry.kind !== "adapter");
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "missing-adapter-basis", missingAdapterBasis)),
      "basis must include each adapter reference"
    );

    const missingGuardBasis = clone(valid);
    missingGuardBasis.basis = missingGuardBasis.basis.filter((entry) => entry.kind !== "guard");
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "missing-guard-basis", missingGuardBasis)),
      "basis must include each guard reference"
    );

    const missingProposalBasis = clone(valid);
    missingProposalBasis.basis = missingProposalBasis.basis.filter((entry) => entry.kind !== "proposal");
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "missing-proposal-basis", missingProposalBasis)),
      "basis must include the proposal reference"
    );

    const emptyAdapters = clone(valid);
    emptyAdapters.adapters = [];
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "empty-adapters", emptyAdapters)),
      "adapters must be a non-empty array"
    );

    const missingParticipantInterfaceBasis = clone(valid);
    missingParticipantInterfaceBasis.basis = missingParticipantInterfaceBasis.basis.filter((entry) => entry.ref !== "interop/interfaces/candidate.json");
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "missing-participant-interface-basis", missingParticipantInterfaceBasis)),
      "participants[0].interface must name a declared session basis reference"
    );

    const unknownParticipant = clone(valid);
    unknownParticipant.roles[0].participants = ["projection://missing"];
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "unknown-participant", unknownParticipant)),
      "must name a declared participant ref"
    );

    const unknownRole = clone(valid);
    unknownRole.adapters[0].roles = ["missing"];
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "unknown-role", unknownRole)),
      "must name a declared role"
    );

    const badGuardKind = clone(valid);
    badGuardKind.guards[0].reference.kind = "evidence";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "bad-guard-kind", badGuardKind)),
      "guards[0].reference.kind must be guard"
    );

    const guardProposalMismatch = clone(valid);
    guardProposalMismatch.guards[0].proposal.ref = "interop/proposals/other.json";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "guard-proposal-mismatch", guardProposalMismatch)),
      "guards[0].proposal must match session proposal"
    );

    const missingAdapterGuardTarget = clone(valid);
    missingAdapterGuardTarget.adapters[0].source.guardTarget = "missing-target";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "missing-adapter-guard-target", missingAdapterGuardTarget)),
      "adapters[0].source.guardTarget must name a declared guard target"
    );

    const adapterParticipantMismatch = clone(valid);
    adapterParticipantMismatch.adapters[0].source.participant = "projection://planner";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "adapter-participant-mismatch", adapterParticipantMismatch)),
      "adapters[0].source.role must match participant role"
    );

    const adapterEffectNotGuarded = clone(valid);
    adapterEffectNotGuarded.guards[0].targets[0].effects = [];
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "adapter-effect-not-guarded", adapterEffectNotGuarded)),
      "adapters[0].source.effects must be covered by guard target"
    );

    const requiredRoleWithoutRequiredAdapter = clone(valid);
    requiredRoleWithoutRequiredAdapter.adapters[0].required = false;
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "required-role-without-required-adapter", requiredRoleWithoutRequiredAdapter)),
      "roles required roles must be covered by required adapters"
    );

    const boundsEffectNotCovered = clone(valid);
    boundsEffectNotCovered.bounds.effects = ["filesystem.read", "network.read"];
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "bounds-effect-not-covered", boundsEffectNotCovered)),
      "bounds.effects must be covered by session adapters"
    );

    const openWithoutAdmission = admittedSession(valid);
    openWithoutAdmission.admission.state = "pending";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "open-without-admission", openWithoutAdmission)),
      "open sessions require admitted session admission"
    );

    const openWithPlannedAdapter = admittedSession(valid);
    openWithPlannedAdapter.adapters[0].state = "planned";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "open-with-planned-adapter", openWithPlannedAdapter)),
      "open sessions must not have required unverified adapters"
    );

    const runningWithUnknownGuard = admittedSession(valid);
    runningWithUnknownGuard.state = "running";
    runningWithUnknownGuard.lifecycle.phase = "running";
    runningWithUnknownGuard.guards[0].state = "unknown";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "running-with-unknown-guard", runningWithUnknownGuard)),
      "running sessions must not have required unsatisfied guards"
    );

    const openWithPendingGuardTarget = admittedSession(valid);
    openWithPendingGuardTarget.guards[0].targets[0].state = "pending";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "open-with-pending-guard-target", openWithPendingGuardTarget)),
      "open sessions must not have required unready guard targets"
    );

    const completedWithMissingEvidence = admittedSession(valid);
    completedWithMissingEvidence.state = "completed";
    completedWithMissingEvidence.lifecycle.phase = "completed";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "completed-with-missing-evidence", completedWithMissingEvidence)),
      "completed sessions must not have required missing or stale evidence"
    );

    const admittedWithPlannedAdapter = admissionReadySession(valid);
    admittedWithPlannedAdapter.adapters[0].state = "planned";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "admitted-with-planned-adapter", admittedWithPlannedAdapter)),
      "admitted sessions must not have required unverified adapters"
    );

    const admittedWithUnreadyParticipant = admissionReadySession(valid);
    admittedWithUnreadyParticipant.participants[0].state = "invited";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "admitted-with-unready-participant", admittedWithUnreadyParticipant)),
      "admitted sessions must not have unready participants"
    );

    const admittedWithOpenRisk = admissionReadySession(valid);
    admittedWithOpenRisk.risks[0].state = "open";
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "admitted-with-open-risk", admittedWithOpenRisk)),
      "admitted sessions must not have open risks"
    );

    const unsortedParticipants = clone(valid);
    unsortedParticipants.participants = [...unsortedParticipants.participants].reverse();
    await assertRejects(
      async () => verifySessionRecordFile(await writeSession(tempRoot, "unsorted-participants", unsortedParticipants)),
      "participants.ref must be sorted"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateBasis(basis, compatibility, proposal, adapterRefs, guardRefs, label) {
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
  const missingAdapters = [...adapterRefs].filter((ref) => !basisRefs.has(ref));
  if (missingAdapters.length > 0) {
    throw new Error(`${label} must include each adapter reference: ${missingAdapters.join(", ")}`);
  }

  const missingGuards = [...guardRefs].filter((ref) => !basisRefs.has(ref));
  if (missingGuards.length > 0) {
    throw new Error(`${label} must include each guard reference: ${missingGuards.join(", ")}`);
  }
  return basisRefs;
}

function validateAdmission(admission, label) {
  assertRecord(admission, label);
  assertKeys(admission, ["state", "summary"], [], label);
  if (!ADMISSION_STATES.has(admission.state)) {
    throw new Error(`${label}.state must be admitted, blocked, closed, or pending`);
  }
  assertTrimmedString(admission.summary, `${label}.summary`);
}

function validateLifecycle(lifecycle, state, label) {
  assertRecord(lifecycle, label);
  assertKeys(lifecycle, ["phase", "transitions"], [], label);
  if (!SESSION_STATES.has(lifecycle.phase)) {
    throw new Error(`${label}.phase must be a session state`);
  }
  if (lifecycle.phase !== state) {
    throw new Error(`${label}.phase must match session state`);
  }
  assertArray(lifecycle.transitions, `${label}.transitions`);
  const names = [];
  for (const [index, transition] of lifecycle.transitions.entries()) {
    const itemLabel = `${label}.transitions[${index}]`;
    assertRecord(transition, itemLabel);
    assertKeys(transition, ["from", "name", "required", "to"], [], itemLabel);
    if (!SESSION_STATES.has(transition.from)) {
      throw new Error(`${itemLabel}.from must be a session state`);
    }
    assertToken(transition.name, `${itemLabel}.name`);
    if (typeof transition.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!SESSION_STATES.has(transition.to)) {
      throw new Error(`${itemLabel}.to must be a session state`);
    }
    names.push(transition.name);
  }
  assertSortedUnique(names, `${label}.transitions.name`);
}

function validateParticipants(participants, basisRefs, label) {
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
    if (!basisRefs.has(referenceKey(participant.interface))) {
      throw new Error(`${itemLabel}.interface must name a declared session basis reference`);
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

function validateRoles(roles, participants, label) {
  assertArray(roles, label);
  const names = [];
  const roleNames = new Set();
  for (const [index, role] of roles.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(role, itemLabel);
    assertKeys(role, ["name", "participants", "required", "state"], [], itemLabel);
    assertToken(role.name, `${itemLabel}.name`);
    assertStringArray(role.participants, `${itemLabel}.participants`);
    for (const ref of role.participants) {
      if (!participants.has(ref)) {
        throw new Error(`${itemLabel}.participants ${ref} must name a declared participant ref`);
      }
    }
    if (typeof role.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!ROLE_STATES.has(role.state)) {
      throw new Error(`${itemLabel}.state must be active, blocked, completed, failed, pending, or ready`);
    }
    names.push(role.name);
    roleNames.add(role.name);
  }
  assertSortedUnique(names, `${label}.name`);
  return roleNames;
}

function validateParticipantRoles(participants, roles, label) {
  for (const [index, participant] of participants.entries()) {
    if (!roles.has(participant.role)) {
      throw new Error(`${label}[${index}].role must name a declared role`);
    }
  }
}

function validateAdapters(adapters, label) {
  assertArray(adapters, label);
  const names = [];
  const refs = [];
  for (const [index, adapter] of adapters.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(adapter, itemLabel);
    assertKeys(adapter, ["contract", "effects", "name", "required", "roles", "source", "state", "target"], [], itemLabel);
    validateReference(adapter.contract, `${itemLabel}.contract`);
    if (adapter.contract.kind !== "adapter") {
      throw new Error(`${itemLabel}.contract.kind must be adapter`);
    }
    assertTokenArray(adapter.effects, `${itemLabel}.effects`);
    assertToken(adapter.name, `${itemLabel}.name`);
    if (typeof adapter.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    assertTokenArray(adapter.roles, `${itemLabel}.roles`);
    validateAdapterEndpoint(adapter.source, adapter.effects, `${itemLabel}.source`);
    validateAdapterEndpoint(adapter.target, adapter.effects, `${itemLabel}.target`);
    if (!ADAPTER_STATES.has(adapter.state)) {
      throw new Error(`${itemLabel}.state must be missing, planned, retired, or verified`);
    }
    names.push(adapter.name);
    refs.push(referenceKey(adapter.contract));
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.contract`);
  return {
    references: new Set(refs)
  };
}

function validateAdapterEndpoint(endpoint, adapterEffects, label) {
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
}

function validateAdapterRoles(adapters, roles, label) {
  for (const [index, adapter] of adapters.entries()) {
    for (const role of adapter.roles) {
      if (!roles.has(role)) {
        throw new Error(`${label}[${index}].roles ${role} must name a declared role`);
      }
    }

    const endpointRoles = [...new Set([adapter.source.role, adapter.target.role])].sort();
    if (JSON.stringify(adapter.roles) !== JSON.stringify(endpointRoles)) {
      throw new Error(`${label}[${index}].roles must match source and target roles`);
    }
  }
}

function validateRequiredRoleAdapterCoverage(roles, adapters, label) {
  const requiredAdapterRoles = new Set(adapters.filter((adapter) => adapter.required).flatMap((adapter) => adapter.roles));
  const uncoveredRoles = roles
    .filter((role) => role.required && !requiredAdapterRoles.has(role.name))
    .map((role) => role.name);
  if (uncoveredRoles.length > 0) {
    throw new Error(`${label} required roles must be covered by required adapters: ${uncoveredRoles.join(", ")}`);
  }
}

function validateAdapterBindings(adapters, participants, roles, targetsByKey, label) {
  for (const [index, adapter] of adapters.entries()) {
    validateAdapterEndpointBinding(adapter.source, participants, roles, targetsByKey, `${label}[${index}].source`);
    validateAdapterEndpointBinding(adapter.target, participants, roles, targetsByKey, `${label}[${index}].target`);

    const usedEffects = new Set([...adapter.source.effects, ...adapter.target.effects]);
    const unusedEffects = adapter.effects.filter((effect) => !usedEffects.has(effect));
    if (unusedEffects.length > 0) {
      throw new Error(`${label}[${index}].effects must be used by at least one endpoint: ${unusedEffects.join(", ")}`);
    }
  }
}

function validateAdapterEndpointBinding(endpoint, participants, roles, targetsByKey, label) {
  const participant = participants.get(endpoint.participant);
  if (!participant) {
    throw new Error(`${label}.participant must name a declared participant ref`);
  }
  if (!roles.has(endpoint.role)) {
    throw new Error(`${label}.role must name a declared role`);
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

function validateBounds(bounds, participants, label) {
  assertRecord(bounds, label);
  assertKeys(bounds, ["duration", "effects", "participantMaximum"], [], label);
  assertTrimmedString(bounds.duration, `${label}.duration`);
  assertTokenArray(bounds.effects, `${label}.effects`);
  assertNonNegativeInteger(bounds.participantMaximum, `${label}.participantMaximum`);
  if (bounds.participantMaximum < participants.length) {
    throw new Error(`${label}.participantMaximum must be greater than or equal to participants.length`);
  }
}

function validateBoundsEffects(bounds, adapters, label) {
  const adapterEffects = new Set(adapters.flatMap((adapter) => adapter.effects));
  const missing = bounds.effects.filter((effect) => !adapterEffects.has(effect));
  if (missing.length > 0) {
    throw new Error(`${label}.effects must be covered by session adapters: ${missing.join(", ")}`);
  }
}

function validateFailurePolicy(failurePolicy, label) {
  assertRecord(failurePolicy, label);
  assertKeys(failurePolicy, ["conditions", "mode"], [], label);
  if (!FAILURE_MODES.has(failurePolicy.mode)) {
    throw new Error(`${label}.mode must be abort, compensate, continue, or retry`);
  }
  assertArray(failurePolicy.conditions, `${label}.conditions`);
  const names = [];
  for (const [index, condition] of failurePolicy.conditions.entries()) {
    const itemLabel = `${label}.conditions[${index}]`;
    assertRecord(condition, itemLabel);
    assertKeys(condition, ["action", "name", "reason"], [], itemLabel);
    assertToken(condition.action, `${itemLabel}.action`);
    assertToken(condition.name, `${itemLabel}.name`);
    assertTrimmedString(condition.reason, `${itemLabel}.reason`);
    names.push(condition.name);
  }
  assertSortedUnique(names, `${label}.conditions.name`);
}

function validateGuards(guards, proposal, label) {
  assertArray(guards, label);
  const names = [];
  const refs = [];
  const targetsByKey = new Map();
  for (const [index, guard] of guards.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(guard, itemLabel);
    assertKeys(guard, ["kind", "name", "proposal", "reason", "reference", "required", "state", "targets"], [], itemLabel);
    assertToken(guard.kind, `${itemLabel}.kind`);
    assertToken(guard.name, `${itemLabel}.name`);
    validateReference(guard.proposal, `${itemLabel}.proposal`);
    if (guard.proposal.kind !== "proposal") {
      throw new Error(`${itemLabel}.proposal.kind must be proposal`);
    }
    if (!sameReference(guard.proposal, proposal)) {
      throw new Error(`${itemLabel}.proposal must match session proposal`);
    }
    assertTrimmedString(guard.reason, `${itemLabel}.reason`);
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

function validateGuardTargetCoverage(targetsByKey, participants, roles, label) {
  const coveredParticipants = new Set();
  for (const target of targetsByKey.values()) {
    const participant = participants.get(target.participant);
    if (!participant) {
      throw new Error(`${target.label}.participant must name a declared participant ref`);
    }
    if (!roles.has(target.role)) {
      throw new Error(`${target.label}.role must name a declared role`);
    }
    if (target.role !== participant.role) {
      throw new Error(`${target.label}.role must match participant role`);
    }
    if (!sameReference(target.interface, participant.interface)) {
      throw new Error(`${target.label}.interface must match participant interface`);
    }
    coveredParticipants.add(target.participant);
  }

  const uncovered = [...participants.values()]
    .filter((participant) => ["active", "ready"].includes(participant.state) && !coveredParticipants.has(participant.ref))
    .map((participant) => participant.ref);
  if (uncovered.length > 0) {
    throw new Error(`${label} active or ready participants must have guard targets: ${uncovered.join(", ")}`);
  }
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

function validateProof(proof, label) {
  assertRecord(proof, label);
  assertKeys(proof, ["commands"], [], label);
  assertStringArray(proof.commands, `${label}.commands`);
  if (proof.commands.length === 0) {
    throw new Error(`${label}.commands must be a non-empty array`);
  }
}

function validateStateGuards(session, guards, label) {
  if (["open", "running", "paused", "completed", "closed"].includes(session.state)) {
    if (session.admission.state !== "admitted") {
      throw new Error(`${label} ${session.state} sessions require admitted session admission`);
    }

    const unverifiedAdapters = session.adapters
      .filter((adapter) => adapter.required && adapter.state !== "verified")
      .map((adapter) => adapter.name);
    if (unverifiedAdapters.length > 0) {
      throw new Error(`${label} ${session.state} sessions must not have required unverified adapters: ${unverifiedAdapters.join(", ")}`);
    }

    const unsatisfiedGuards = session.guards
      .filter((guard) => guard.required && !["satisfied", "waived"].includes(guard.state))
      .map((guard) => guard.name);
    if (unsatisfiedGuards.length > 0) {
      throw new Error(`${label} ${session.state} sessions must not have required unsatisfied guards: ${unsatisfiedGuards.join(", ")}`);
    }

    const unreadyTargets = [...guards.targetsByKey.values()]
      .filter((target) => target.required && !GUARD_TARGET_READY_STATES.has(target.state))
      .map((target) => `${target.guardName}/${target.target}`);
    if (unreadyTargets.length > 0) {
      throw new Error(`${label} ${session.state} sessions must not have required unready guard targets: ${unreadyTargets.join(", ")}`);
    }
  }

  if (["completed", "closed"].includes(session.state)) {
    const missingEvidence = session.evidenceNeeded
      .filter((evidence) => evidence.required && evidence.state !== "observed")
      .map((evidence) => evidence.name);
    if (missingEvidence.length > 0) {
      throw new Error(`${label} ${session.state} sessions must not have required missing or stale evidence: ${missingEvidence.join(", ")}`);
    }
  }
}

function validateAdmittedState(session, guards, label) {
  if (session.admission.state !== "admitted") {
    return;
  }

  const unverifiedAdapters = session.adapters
    .filter((adapter) => adapter.required && adapter.state !== "verified")
    .map((adapter) => adapter.name);
  if (unverifiedAdapters.length > 0) {
    throw new Error(`${label} admitted sessions must not have required unverified adapters: ${unverifiedAdapters.join(", ")}`);
  }

  const unsatisfiedGuards = session.guards
    .filter((guard) => guard.required && !["satisfied", "waived"].includes(guard.state))
    .map((guard) => guard.name);
  if (unsatisfiedGuards.length > 0) {
    throw new Error(`${label} admitted sessions must not have required unsatisfied guards: ${unsatisfiedGuards.join(", ")}`);
  }

  const unreadyTargets = [...guards.targetsByKey.values()]
    .filter((target) => target.required && !GUARD_TARGET_READY_STATES.has(target.state))
    .map((target) => `${target.guardName}/${target.target}`);
  if (unreadyTargets.length > 0) {
    throw new Error(`${label} admitted sessions must not have required unready guard targets: ${unreadyTargets.join(", ")}`);
  }

  const unreadyParticipants = session.participants
    .filter((participant) => !PARTICIPANT_ADMITTED_STATES.has(participant.state))
    .map((participant) => participant.ref);
  if (unreadyParticipants.length > 0) {
    throw new Error(`${label} admitted sessions must not have unready participants: ${unreadyParticipants.join(", ")}`);
  }

  const unreadyRoles = session.roles
    .filter((role) => role.required && !ROLE_ADMITTED_STATES.has(role.state))
    .map((role) => role.name);
  if (unreadyRoles.length > 0) {
    throw new Error(`${label} admitted sessions must not have required unready roles: ${unreadyRoles.join(", ")}`);
  }

  const openRisks = session.risks
    .filter((risk) => risk.state === "open")
    .map((risk) => risk.name);
  if (openRisks.length > 0) {
    throw new Error(`${label} admitted sessions must not have open risks: ${openRisks.join(", ")}`);
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

function assertSortedUnique(values, label) {
  const sorted = [...values].sort();
  if (JSON.stringify(values) !== JSON.stringify(sorted)) {
    throw new Error(`${label} must be sorted`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function minimalSession() {
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
  const adapter = {
    commitment: `sha256:${"b".repeat(64)}`,
    kind: "adapter",
    ref: "interop/adapters/interface-to-compatibility.json"
  };
  const adapterReadyGuard = {
    commitment: `sha256:${"2".repeat(64)}`,
    kind: "guard",
    ref: "interop/guards/adapter-ready.json"
  };
  const participantConsentGuard = {
    commitment: `sha256:${"3".repeat(64)}`,
    kind: "guard",
    ref: "interop/guards/participant-consent.json"
  };
  const candidateInterface = {
    commitment: `sha256:${"e".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/candidate.json"
  };
  const plannerInterface = {
    commitment: `sha256:${"1".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/planner.json"
  };

  return {
    admission: {
      state: "pending",
      summary: "Session remains proposed until compatibility, adapters, and guards are admitted."
    },
    adapters: [
      {
        contract: adapter,
        effects: ["filesystem.read"],
        name: "interface-to-compatibility",
        required: true,
        roles: ["candidate", "planner"],
        source: {
          effects: ["filesystem.read"],
          guard: "adapter-ready",
          guardTarget: "candidate-target",
          interface: candidateInterface,
          participant: "projection://candidate",
          role: "candidate"
        },
        state: "planned",
        target: {
          effects: ["filesystem.read"],
          guard: "adapter-ready",
          guardTarget: "planner-target",
          interface: plannerInterface,
          participant: "projection://planner",
          role: "planner"
        }
      }
    ],
    basis: [
      adapter,
      compatibility,
      adapterReadyGuard,
      participantConsentGuard,
      {
        commitment: `sha256:${"c".repeat(64)}`,
        kind: "intent",
        ref: "interop/intents/current.json"
      },
      candidateInterface,
      plannerInterface,
      proposal
    ],
    bounds: {
      duration: "PT10M",
      effects: ["filesystem.read"],
      participantMaximum: 2
    },
    compatibility,
    evidenceNeeded: [
      {
        kind: "adapter",
        name: "adapter-contract-observed",
        reason: "required adapter contract must be observed before completion",
        required: true,
        state: "missing",
        subject: "interface-to-compatibility"
      },
      {
        kind: "receipt",
        name: "session-result",
        reason: "session result receipt is needed before relation records",
        required: true,
        state: "missing",
        subject: "projection-session"
      }
    ],
    failurePolicy: {
      conditions: [
        {
          action: "close",
          name: "adapter-unavailable",
          reason: "required adapter cannot be verified or used"
        }
      ],
      mode: "abort"
    },
    guards: [
      {
        kind: "adapter",
        name: "adapter-ready",
        proposal,
        reason: "required adapter must be available before opening",
        reference: adapterReadyGuard,
        required: true,
        state: "unknown",
        targets: [
          {
            effects: ["filesystem.read"],
            interface: candidateInterface,
            participant: "projection://candidate",
            required: true,
            role: "candidate",
            state: "unknown",
            target: "candidate-target"
          },
          {
            effects: ["filesystem.read"],
            interface: plannerInterface,
            participant: "projection://planner",
            required: true,
            role: "planner",
            state: "unknown",
            target: "planner-target"
          }
        ]
      },
      {
        kind: "authorization",
        name: "participant-consent",
        proposal,
        reason: "participants must authorize runtime coordination before opening",
        reference: participantConsentGuard,
        required: true,
        state: "unknown",
        targets: [
          {
            effects: ["filesystem.read"],
            interface: candidateInterface,
            participant: "projection://candidate",
            required: true,
            role: "candidate",
            state: "unknown",
            target: "candidate-consent"
          },
          {
            effects: ["filesystem.read"],
            interface: plannerInterface,
            participant: "projection://planner",
            required: true,
            role: "planner",
            state: "unknown",
            target: "planner-consent"
          }
        ]
      }
    ],
    kind: INTEROP_SESSION_KIND,
    lifecycle: {
      phase: "proposed",
      transitions: [
        {
          from: "proposed",
          name: "a-open",
          required: true,
          to: "open"
        },
        {
          from: "open",
          name: "b-complete",
          required: true,
          to: "completed"
        }
      ]
    },
    name: "projection-coordination-session",
    participants: [
      {
        anchor: {
          commitment: `sha256:${"d".repeat(64)}`,
          kind: "origin"
        },
        interface: candidateInterface,
        ref: "projection://candidate",
        role: "candidate",
        state: "ready"
      },
      {
        anchor: {
          commitment: `sha256:${"f".repeat(64)}`,
          kind: "origin"
        },
        interface: plannerInterface,
        ref: "projection://planner",
        role: "planner",
        state: "ready"
      }
    ],
    proof: {
      commands: ["node projection-root/kit/interop/session/verify.mjs interop/sessions/current.json"]
    },
    proposal,
    risks: [
      {
        kind: "runtime",
        mitigation: "keep the session proposed until guards are satisfied",
        name: "premature-runtime",
        severity: "high",
        state: "mitigated"
      }
    ],
    roles: [
      {
        name: "candidate",
        participants: ["projection://candidate"],
        required: true,
        state: "ready"
      },
      {
        name: "planner",
        participants: ["projection://planner"],
        required: true,
        state: "ready"
      }
    ],
    state: "proposed",
    version: INTEROP_SESSION_VERSION
  };
}

async function writeSession(tempRoot, name, session) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(session)}\n`, "utf8");
  return filePath;
}

async function writePrettySession(tempRoot, name, session) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
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

function admittedSession(session) {
  const copy = clone(session);
  copy.state = "open";
  copy.lifecycle.phase = "open";
  copy.admission.state = "admitted";
  copy.adapters = copy.adapters.map((adapter) => ({
    ...adapter,
    state: "verified"
  }));
  copy.guards = copy.guards.map((guard) => ({
    ...guard,
    state: "satisfied",
    targets: guard.targets.map((target) => ({
      ...target,
      state: "satisfied"
    }))
  }));
  return copy;
}

function admissionReadySession(session) {
  const copy = admittedSession(session);
  copy.state = "proposed";
  copy.lifecycle.phase = "proposed";
  return copy;
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
    console.log("projection interop session verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/session/verify.mjs <session.json> [--json] | --self-test");
  }

  const session = await verifySessionRecordFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(session));
    return;
  }

  console.log("projection interop session record ok");
  console.log(`session: ${session.name}`);
  console.log(`state: ${session.state}`);
  console.log(`participants: ${session.participants.length}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop session: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
