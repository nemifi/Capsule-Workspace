#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_COMPATIBILITY_KIND = "projection-interop/compatibility";
export const INTEROP_COMPATIBILITY_VERSION = 1;

const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;
const DECISION_STATES = new Set(["blocked", "candidate", "partial", "ready"]);
const ROLE_STATES = new Set(["blocked", "missing", "partial", "satisfied"]);
const PARTICIPANT_STATES = new Set(["candidate", "rejected", "selected"]);
const ADAPTER_STATES = new Set(["missing", "not-required", "planned", "verified"]);
const RISK_SEVERITIES = new Set(["critical", "high", "info", "low", "medium"]);
const RISK_STATES = new Set(["accepted", "mitigated", "open"]);
const EVIDENCE_STATES = new Set(["missing", "observed", "stale"]);
const GUARD_STATES = new Set(["blocked", "expired", "failed", "pending", "satisfied", "unknown", "waived"]);
const GUARD_TARGET_READY_STATES = new Set(["ready", "satisfied", "waived"]);
const GUARD_TARGET_STATES = new Set(["blocked", "pending", "ready", "satisfied", "unknown", "waived"]);
const SCALE_MODES = new Set(["fanout", "group", "index", "pair", "single"]);
const RESERVED_PAYLOADS = new Set(["opaque"]);

export async function verifyCompatibilityPlanFile(filePath) {
  const label = "interop compatibility plan";
  const text = await readFile(filePath, "utf8");
  const plan = parseJson(text, label);

  verifyCompatibilityPlan(plan, label);
  if (text !== `${stableStringify(plan)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return plan;
}

export function verifyCompatibilityPlan(plan, label = "interop compatibility plan") {
  assertRecord(plan, label);
  assertKeys(
    plan,
    [
      "adapters",
      "basis",
      "constraints",
      "decision",
      "evidenceNeeded",
      "guards",
      "intent",
      "kind",
      "participants",
      "proof",
      "proposal",
      "risks",
      "roles",
      "scale",
      "version",
      "vocabularies"
    ],
    [],
    label
  );

  if (plan.kind !== INTEROP_COMPATIBILITY_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_COMPATIBILITY_KIND}`);
  }
  if (plan.version !== INTEROP_COMPATIBILITY_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_COMPATIBILITY_VERSION}`);
  }

  validateReference(plan.intent, `${label}.intent`);
  if (plan.intent.kind !== "intent") {
    throw new Error(`${label}.intent.kind must be intent`);
  }
  validateReference(plan.proposal, `${label}.proposal`);
  if (plan.proposal.kind !== "proposal") {
    throw new Error(`${label}.proposal.kind must be proposal`);
  }
  const guards = validateGuards(plan.guards, plan.proposal, `${label}.guards`);
  validateBasis(plan.basis, plan.intent, plan.proposal, guards.references, `${label}.basis`);
  validateDecision(plan.decision, `${label}.decision`);
  validateScale(plan.scale, plan.participants, `${label}.scale`);
  const vocabularies = validateVocabularies(plan.vocabularies, `${label}.vocabularies`);
  const participants = validateParticipants(plan.participants, `${label}.participants`);
  const roles = validateRoles(plan.roles, participants, `${label}.roles`);
  validateParticipantRoles(plan.participants, roles, `${label}.participants`);
  const guardCoverage = validateGuardTargets(guards.targets, participants, roles, `${label}.guards`);
  validateConstraints(plan.constraints, `${label}.constraints`);
  validateAdapters(plan.adapters, roles, vocabularies, guardCoverage, `${label}.adapters`);
  validateRisks(plan.risks, `${label}.risks`);
  validateEvidenceNeeded(plan.evidenceNeeded, `${label}.evidenceNeeded`);
  validateProof(plan.proof, `${label}.proof`);
  validateReadyState(plan, guards, label);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-compatibility-"));

  try {
    const valid = minimalPlan();
    await verifyCompatibilityPlanFile(await writePlan(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePrettyPlan(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const badIntentBasis = clone(valid);
    badIntentBasis.basis = badIntentBasis.basis.filter((entry) => entry.kind !== "intent");
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "missing-intent-basis", badIntentBasis)),
      "basis must include the intent reference"
    );

    const missingGuardBasis = clone(valid);
    missingGuardBasis.basis = missingGuardBasis.basis.filter((entry) => entry.kind !== "guard");
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "missing-guard-basis", missingGuardBasis)),
      "basis must include each guard reference"
    );

    const missingProposalBasis = clone(valid);
    missingProposalBasis.basis = missingProposalBasis.basis.filter((entry) => entry.kind !== "proposal");
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "missing-proposal-basis", missingProposalBasis)),
      "basis must include the proposal reference"
    );

    const wrongGuardKind = clone(valid);
    wrongGuardKind.guards[0].reference.kind = "evidence";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "wrong-guard-kind", wrongGuardKind)),
      "guards[0].reference.kind must be guard"
    );

    const guardProposalMismatch = clone(valid);
    guardProposalMismatch.guards[0].proposal.ref = "interop/proposals/other.json";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "guard-proposal-mismatch", guardProposalMismatch)),
      "guards[0].proposal must match plan proposal"
    );

    const missingSelectedParticipantTarget = clone(valid);
    missingSelectedParticipantTarget.guards[0].targets = missingSelectedParticipantTarget.guards[0].targets.slice(0, 1);
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "missing-selected-participant-target", missingSelectedParticipantTarget)),
      "guards selected participants must have guard targets"
    );

    const targetInterfaceMismatch = clone(valid);
    targetInterfaceMismatch.guards[0].targets[0].interface.ref = "interop/interfaces/missing.json";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "target-interface-mismatch", targetInterfaceMismatch)),
      "guards[0].targets[0].interface must match the participant interface"
    );

    const targetRoleMismatch = clone(valid);
    targetRoleMismatch.guards[0].targets[0].role = "planner";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "target-role-mismatch", targetRoleMismatch)),
      "guards[0].targets[0].role must match the participant role"
    );

    const unknownRole = clone(valid);
    unknownRole.participants[0].role = "unknown";
    unknownRole.roles[0].assigned = [];
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "unknown-role", unknownRole)),
      "must name a declared role"
    );

    const selectedParticipantNotAssigned = clone(valid);
    selectedParticipantNotAssigned.roles[0].assigned = [];
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "selected-participant-not-assigned", selectedParticipantNotAssigned)),
      "participants[0].ref selected participants must be assigned to their declared role"
    );

    const roleAssignedWrongParticipant = clone(valid);
    roleAssignedWrongParticipant.roles[0].assigned = ["projection://planner"];
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "role-assigned-wrong-participant", roleAssignedWrongParticipant)),
      "roles[0].assigned projection://planner must have role candidate"
    );

    const unknownParticipant = clone(valid);
    unknownParticipant.roles[0].assigned = ["projection://missing"];
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "unknown-participant", unknownParticipant)),
      "must name a declared participant ref"
    );

    const undeclaredPayload = clone(valid);
    undeclaredPayload.adapters[0].source.payload = "projection.unknown.v1";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "undeclared-payload", undeclaredPayload)),
      "must be opaque or named in vocabularies"
    );

    const unguardedAdapterEffect = clone(valid);
    unguardedAdapterEffect.adapters[0].effects = ["filesystem.write"];
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "unguarded-adapter-effect", unguardedAdapterEffect)),
      "adapters[0].effects must be covered by ready guard targets for source role"
    );

    const adapterCoveredByPendingGuardTarget = clone(valid);
    adapterCoveredByPendingGuardTarget.guards[0].targets[0].state = "pending";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "adapter-covered-by-pending-guard-target", adapterCoveredByPendingGuardTarget)),
      "adapters[0].effects must be covered by ready guard targets for source role"
    );

    const badScale = clone(valid);
    badScale.scale.participants = 1;
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "bad-scale", badScale)),
      "participants must equal participants.length"
    );

    const readyWithoutGuards = clone(valid);
    readyWithoutGuards.decision.state = "ready";
    delete readyWithoutGuards.guards;
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "ready-without-guards", readyWithoutGuards)),
      "missing required keys: guards"
    );

    const readyWithPendingGuard = clone(valid);
    readyWithPendingGuard.decision.state = "ready";
    readyWithPendingGuard.guards[0].state = "pending";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "ready-with-pending-guard", readyWithPendingGuard)),
      "ready compatibility plans must not have required unsatisfied guards"
    );

    const readyWithPendingGuardTarget = clone(valid);
    readyWithPendingGuardTarget.decision.state = "ready";
    readyWithPendingGuardTarget.adapters = [];
    readyWithPendingGuardTarget.guards[0].targets[0].state = "pending";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "ready-with-pending-guard-target", readyWithPendingGuardTarget)),
      "ready compatibility plans must not have required unready guard targets"
    );

    const readyWithCandidateParticipant = clone(valid);
    readyWithCandidateParticipant.decision.state = "ready";
    readyWithCandidateParticipant.participants[0].state = "candidate";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "ready-with-candidate-participant", readyWithCandidateParticipant)),
      "ready compatibility plans must not have unselected participants"
    );

    const readyWithMissingRole = clone(valid);
    readyWithMissingRole.decision.state = "ready";
    readyWithMissingRole.roles[0].state = "partial";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "ready-with-missing-role", readyWithMissingRole)),
      "ready compatibility plans must not have required unsatisfied roles"
    );

    const readyWithPlannedAdapter = clone(valid);
    readyWithPlannedAdapter.decision.state = "ready";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "ready-with-planned-adapter", readyWithPlannedAdapter)),
      "ready compatibility plans must not have required unverified adapters"
    );

    const readyWithMissingEvidence = clone(valid);
    readyWithMissingEvidence.decision.state = "ready";
    readyWithMissingEvidence.adapters[0].state = "verified";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "ready-with-missing-evidence", readyWithMissingEvidence)),
      "ready compatibility plans must not have required missing or stale evidence"
    );

    const readyWithViolatedConstraint = clone(valid);
    readyWithViolatedConstraint.decision.state = "ready";
    readyWithViolatedConstraint.adapters[0].state = "verified";
    readyWithViolatedConstraint.evidenceNeeded[0].state = "observed";
    readyWithViolatedConstraint.constraints[0].state = "violated";
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "ready-with-violated-constraint", readyWithViolatedConstraint)),
      "ready compatibility plans must not have violated or unknown constraints"
    );

    const unsortedRisks = clone(valid);
    unsortedRisks.risks = [...unsortedRisks.risks].reverse();
    await assertRejects(
      async () => verifyCompatibilityPlanFile(await writePlan(tempRoot, "unsorted-risks", unsortedRisks)),
      "risks.name must be sorted"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateBasis(basis, intent, proposal, guardRefs, label) {
  assertArray(basis, label);
  const refs = [];
  let hasIntent = false;
  let hasProposal = false;
  for (const [index, entry] of basis.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(entry, itemLabel);
    assertToken(entry.kind, `${itemLabel}.kind`);
    refs.push(referenceKey(entry));
    if (sameReference(entry, intent)) {
      hasIntent = true;
    }
    if (sameReference(entry, proposal)) {
      hasProposal = true;
    }
  }
  assertSortedUnique(refs, label);
  if (!hasIntent) {
    throw new Error(`${label} must include the intent reference`);
  }
  if (!hasProposal) {
    throw new Error(`${label} must include the proposal reference`);
  }

  const basisRefs = new Set(refs);
  const missingGuards = [...guardRefs].filter((ref) => !basisRefs.has(ref));
  if (missingGuards.length > 0) {
    throw new Error(`${label} must include each guard reference: ${missingGuards.join(", ")}`);
  }
}

function validateGuards(guards, proposal, label) {
  assertArray(guards, label);
  const names = [];
  const refs = [];
  const targets = [];
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
      throw new Error(`${itemLabel}.proposal must match plan proposal`);
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
    targets.push(...validateGuardTargetEntries(guard.targets, guard.name, `${itemLabel}.targets`));
    names.push(guard.name);
    refs.push(referenceKey(guard.reference));
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.reference`);
  return {
    references: new Set(refs),
    targets
  };
}

function validateGuardTargetEntries(targets, guardName, label) {
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
    entries.push({ ...target, guardName, label: itemLabel });
  }
  assertSortedUnique(targetNames, `${label}.target`);
  assertSortedUnique(participants, `${label}.participant`);
  return entries;
}

function validateDecision(decision, label) {
  assertRecord(decision, label);
  assertKeys(decision, ["state", "summary"], [], label);
  if (!DECISION_STATES.has(decision.state)) {
    throw new Error(`${label}.state must be blocked, candidate, partial, or ready`);
  }
  assertTrimmedString(decision.summary, `${label}.summary`);
}

function validateScale(scale, participants, label) {
  assertRecord(scale, label);
  assertKeys(scale, ["candidates", "mode", "participants"], [], label);
  if (!SCALE_MODES.has(scale.mode)) {
    throw new Error(`${label}.mode must be fanout, group, index, pair, or single`);
  }
  assertNonNegativeInteger(scale.candidates, `${label}.candidates`);
  assertNonNegativeInteger(scale.participants, `${label}.participants`);
  if (scale.participants !== participants.length) {
    throw new Error(`${label}.participants must equal participants.length`);
  }
  if (scale.candidates < scale.participants) {
    throw new Error(`${label}.candidates must be greater than or equal to participants`);
  }
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

function validateParticipants(participants, label) {
  assertAnyArray(participants, label);
  const refs = [];
  const participantsByRef = new Map();
  for (const [index, participant] of participants.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(participant, itemLabel);
    assertKeys(participant, ["anchor", "interface", "reasons", "ref", "role", "score", "state"], [], itemLabel);
    validateOptionalAnchor(participant.anchor, `${itemLabel}.anchor`);
    validateReference(participant.interface, `${itemLabel}.interface`);
    if (participant.interface.kind !== "interface") {
      throw new Error(`${itemLabel}.interface.kind must be interface`);
    }
    assertStringArray(participant.reasons, `${itemLabel}.reasons`);
    assertTrimmedString(participant.ref, `${itemLabel}.ref`);
    assertToken(participant.role, `${itemLabel}.role`);
    assertScore(participant.score, `${itemLabel}.score`);
    if (!PARTICIPANT_STATES.has(participant.state)) {
      throw new Error(`${itemLabel}.state must be candidate, rejected, or selected`);
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
  const rolesByName = new Map();
  for (const [index, role] of roles.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(role, itemLabel);
    assertKeys(role, ["assigned", "missing", "name", "required", "state"], [], itemLabel);
    assertStringArray(role.assigned, `${itemLabel}.assigned`);
    for (const ref of role.assigned) {
      const participant = participants.get(ref);
      if (!participant) {
        throw new Error(`${itemLabel}.assigned ${ref} must name a declared participant ref`);
      }
      if (participant.role !== role.name) {
        throw new Error(`${itemLabel}.assigned ${ref} must have role ${role.name}`);
      }
    }
    assertNonNegativeInteger(role.missing, `${itemLabel}.missing`);
    assertToken(role.name, `${itemLabel}.name`);
    if (typeof role.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!ROLE_STATES.has(role.state)) {
      throw new Error(`${itemLabel}.state must be blocked, missing, partial, or satisfied`);
    }
    names.push(role.name);
    rolesByName.set(role.name, role);
  }
  assertSortedUnique(names, `${label}.name`);
  return rolesByName;
}

function validateParticipantRoles(participants, roles, label) {
  for (const [index, participant] of participants.entries()) {
    const role = roles.get(participant.role);
    if (!role) {
      throw new Error(`${label}[${index}].role must name a declared role`);
    }
    if (participant.state === "selected" && !role.assigned.includes(participant.ref)) {
      throw new Error(`${label}[${index}].ref selected participants must be assigned to their declared role`);
    }
  }
}

function validateGuardTargets(targets, participants, roles, label) {
  const coveredParticipants = new Set();
  const roleEffects = new Map();
  for (const target of targets) {
    const participant = participants.get(target.participant);
    if (!participant) {
      throw new Error(`${target.label}.participant must name a declared participant ref`);
    }
    if (target.role !== participant.role) {
      throw new Error(`${target.label}.role must match the participant role`);
    }
    if (!roles.has(target.role)) {
      throw new Error(`${target.label}.role must name a declared role`);
    }
    if (!sameReference(target.interface, participant.interface)) {
      throw new Error(`${target.label}.interface must match the participant interface`);
    }
    coveredParticipants.add(target.participant);
    if (GUARD_TARGET_READY_STATES.has(target.state)) {
      const effects = roleEffects.get(target.role) ?? new Set();
      for (const effect of target.effects) {
        effects.add(effect);
      }
      roleEffects.set(target.role, effects);
    }
  }

  const unguardedSelected = [...participants.values()]
    .filter((participant) => participant.state === "selected" && !coveredParticipants.has(participant.ref))
    .map((participant) => participant.ref);
  if (unguardedSelected.length > 0) {
    throw new Error(`${label} selected participants must have guard targets: ${unguardedSelected.join(", ")}`);
  }

  return {
    roleEffects
  };
}

function validateConstraints(constraints, label) {
  assertAnyArray(constraints, label);
  const names = [];
  for (const [index, constraint] of constraints.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(constraint, itemLabel);
    assertKeys(constraint, ["name", "reason", "state"], [], itemLabel);
    assertToken(constraint.name, `${itemLabel}.name`);
    assertTrimmedString(constraint.reason, `${itemLabel}.reason`);
    if (!["satisfied", "unknown", "violated", "waived"].includes(constraint.state)) {
      throw new Error(`${itemLabel}.state must be satisfied, unknown, violated, or waived`);
    }
    names.push(constraint.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateAdapters(adapters, roles, vocabularies, guardCoverage, label) {
  assertAnyArray(adapters, label);
  const names = [];
  for (const [index, adapter] of adapters.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(adapter, itemLabel);
    assertKeys(
      adapter,
      ["effects", "kind", "loss", "name", "required", "source", "state", "target", "verification"],
      [],
      itemLabel
    );
    assertTokenArray(adapter.effects, `${itemLabel}.effects`);
    assertToken(adapter.kind, `${itemLabel}.kind`);
    assertTrimmedString(adapter.loss, `${itemLabel}.loss`);
    assertToken(adapter.name, `${itemLabel}.name`);
    if (typeof adapter.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    validateAdapterEndpoint(adapter.source, roles, vocabularies, `${itemLabel}.source`);
    validateAdapterEndpoint(adapter.target, roles, vocabularies, `${itemLabel}.target`);
    validateAdapterEffects(adapter, guardCoverage, itemLabel);
    if (!ADAPTER_STATES.has(adapter.state)) {
      throw new Error(`${itemLabel}.state must be missing, not-required, planned, or verified`);
    }
    assertStringArray(adapter.verification, `${itemLabel}.verification`);
    names.push(adapter.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateAdapterEffects(adapter, guardCoverage, label) {
  for (const endpointName of ["source", "target"]) {
    const role = adapter[endpointName].role;
    const effects = guardCoverage.roleEffects.get(role) ?? new Set();
    const missing = adapter.effects.filter((effect) => !effects.has(effect));
    if (missing.length > 0) {
      throw new Error(`${label}.effects must be covered by ready guard targets for ${endpointName} role ${role}: ${missing.join(", ")}`);
    }
  }
}

function validateAdapterEndpoint(endpoint, roles, vocabularies, label) {
  assertRecord(endpoint, label);
  assertKeys(endpoint, ["payload", "role"], [], label);
  assertPayloadRef(endpoint.payload, vocabularies, `${label}.payload`);
  assertToken(endpoint.role, `${label}.role`);
  if (!roles.has(endpoint.role)) {
    throw new Error(`${label}.role must name a declared role`);
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
  assertSortedUnique(proof.commands, `${label}.commands`);
}

function validateReadyState(plan, guards, label) {
  if (plan.decision.state !== "ready") {
    return;
  }

  const unselectedParticipants = plan.participants
    .filter((participant) => participant.state !== "selected")
    .map((participant) => participant.ref);
  if (unselectedParticipants.length > 0) {
    throw new Error(`${label} ready compatibility plans must not have unselected participants: ${unselectedParticipants.join(", ")}`);
  }

  const unsatisfiedRoles = plan.roles
    .filter((role) => role.required && (role.state !== "satisfied" || role.missing !== 0))
    .map((role) => role.name);
  if (unsatisfiedRoles.length > 0) {
    throw new Error(`${label} ready compatibility plans must not have required unsatisfied roles: ${unsatisfiedRoles.join(", ")}`);
  }

  const unsatisfiedGuards = plan.guards
    .filter((guard) => guard.required && !["satisfied", "waived"].includes(guard.state))
    .map((guard) => guard.name);
  if (unsatisfiedGuards.length > 0) {
    throw new Error(`${label} ready compatibility plans must not have required unsatisfied guards: ${unsatisfiedGuards.join(", ")}`);
  }

  const unreadyTargets = guards.targets
    .filter((target) => target.required && !GUARD_TARGET_READY_STATES.has(target.state))
    .map((target) => `${target.guardName}/${target.target}`);
  if (unreadyTargets.length > 0) {
    throw new Error(`${label} ready compatibility plans must not have required unready guard targets: ${unreadyTargets.join(", ")}`);
  }

  const unverifiedAdapters = plan.adapters
    .filter((adapter) => adapter.required && adapter.state !== "verified")
    .map((adapter) => adapter.name);
  if (unverifiedAdapters.length > 0) {
    throw new Error(`${label} ready compatibility plans must not have required unverified adapters: ${unverifiedAdapters.join(", ")}`);
  }

  const missingEvidence = plan.evidenceNeeded
    .filter((evidence) => evidence.required && evidence.state !== "observed")
    .map((evidence) => evidence.name);
  if (missingEvidence.length > 0) {
    throw new Error(`${label} ready compatibility plans must not have required missing or stale evidence: ${missingEvidence.join(", ")}`);
  }

  const unresolvedConstraints = plan.constraints
    .filter((constraint) => !["satisfied", "waived"].includes(constraint.state))
    .map((constraint) => constraint.name);
  if (unresolvedConstraints.length > 0) {
    throw new Error(`${label} ready compatibility plans must not have violated or unknown constraints: ${unresolvedConstraints.join(", ")}`);
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

function validateOptionalAnchor(anchor, label) {
  assertRecord(anchor, label);
  assertKeys(anchor, ["commitment", "kind"], [], label);
  if (anchor.kind !== "origin") {
    throw new Error(`${label}.kind must be origin`);
  }
  assertCommitment(anchor.commitment, `${label}.commitment`);
}

function assertPayloadRef(value, vocabularies, label) {
  assertToken(value, label);
  if (!RESERVED_PAYLOADS.has(value) && !vocabularies.has(value)) {
    throw new Error(`${label} must be opaque or named in vocabularies`);
  }
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

function assertScore(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number between 0 and 1`);
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

function minimalPlan() {
  const intent = {
    commitment: `sha256:${"c".repeat(64)}`,
    kind: "intent",
    ref: "interop/intents/current.json"
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
  const candidateInterface = {
    commitment: `sha256:${"d".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/candidate.json"
  };
  const plannerInterface = {
    commitment: `sha256:${"a".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/planner.json"
  };

  return {
    adapters: [
      {
        effects: ["filesystem.read"],
        kind: "payload",
        loss: "none expected for shared manifest payloads",
        name: "interface-to-compatibility",
        required: true,
        source: {
          payload: "projection.interface.v1",
          role: "candidate"
        },
        state: "planned",
        target: {
          payload: "projection.compatibility.v1",
          role: "planner"
        },
        verification: ["adapter contract is required before session"]
      }
    ],
    basis: [
      guard,
      intent,
      candidateInterface,
      plannerInterface,
      proposal
    ],
    constraints: [
      {
        name: "adapter-required",
        reason: "non-identical payload interpretation needs an explicit adapter",
        state: "satisfied"
      }
    ],
    decision: {
      state: "partial",
      summary: "Candidate role is readable, but adapter evidence is still required before a session."
    },
    evidenceNeeded: [
      {
        kind: "adapter",
        name: "adapter-contract",
        reason: "planned payload translation needs a bounded adapter contract",
        required: true,
        state: "missing",
        subject: "interface-to-compatibility"
      }
    ],
    guards: [
      {
        name: "policy-consent-guard",
        proposal,
        reference: guard,
        required: true,
        state: "satisfied",
        summary: "Required pre-runtime guard state is visible before compatibility readiness.",
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
    intent,
    kind: INTEROP_COMPATIBILITY_KIND,
    participants: [
      {
        anchor: {
          commitment: `sha256:${"e".repeat(64)}`,
          kind: "origin"
        },
        interface: candidateInterface,
        reasons: ["declares projection.inspect capability"],
        ref: "projection://candidate",
        role: "candidate",
        score: 0.82,
        state: "selected"
      },
      {
        anchor: {
          commitment: `sha256:${"f".repeat(64)}`,
          kind: "origin"
        },
        interface: plannerInterface,
        reasons: ["can produce compatibility records"],
        ref: "projection://planner",
        role: "planner",
        score: 1,
        state: "selected"
      }
    ],
    proof: {
      commands: ["node projection-root/kit/interop/compatibility/verify.mjs interop/compatibility/current.json"]
    },
    proposal,
    risks: [
      {
        kind: "runtime",
        mitigation: "do not open a session until adapter evidence is observed",
        name: "adapter-not-yet-verified",
        severity: "medium",
        state: "open"
      },
      {
        kind: "lifecycle",
        mitigation: "keep compatibility planning separate from session opening",
        name: "session-before-evidence",
        severity: "high",
        state: "mitigated"
      }
    ],
    roles: [
      {
        assigned: ["projection://candidate"],
        missing: 0,
        name: "candidate",
        required: true,
        state: "satisfied"
      },
      {
        assigned: ["projection://planner"],
        missing: 0,
        name: "planner",
        required: true,
        state: "satisfied"
      }
    ],
    scale: {
      candidates: 2,
      mode: "pair",
      participants: 2
    },
    version: INTEROP_COMPATIBILITY_VERSION,
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

async function writePlan(tempRoot, name, plan) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(plan)}\n`, "utf8");
  return filePath;
}

async function writePrettyPlan(tempRoot, name, plan) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
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
    console.log("projection interop compatibility verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/compatibility/verify.mjs <plan.json> [--json] | --self-test");
  }

  const plan = await verifyCompatibilityPlanFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(plan));
    return;
  }

  console.log("projection interop compatibility plan ok");
  console.log(`intent: ${plan.intent.ref}`);
  console.log(`decision: ${plan.decision.state}`);
  console.log(`participants: ${plan.participants.length}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop compatibility: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
