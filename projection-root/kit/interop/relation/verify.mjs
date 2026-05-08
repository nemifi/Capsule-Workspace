#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_RELATION_KIND = "projection-interop/relation";
export const INTEROP_RELATION_VERSION = 1;

const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CONSTRAINT_STATES = new Set(["satisfied", "unknown", "violated", "waived"]);
const CONTINUITY_MODES = new Set(["finite", "ongoing", "renewable", "snapshot", "superseding"]);
const EDGE_STATES = new Set(["active", "blocked", "proposed", "retired", "superseded"]);
const EVIDENCE_STATES = new Set(["accepted", "missing", "rejected", "stale", "unknown"]);
const EVIDENCE_BINDING_STATES = new Set(["accepted", "missing", "observed", "received", "rejected", "stale", "unknown"]);
const PARTICIPANT_CONTINUITY_STATES = new Set(["active", "ready"]);
const PARTICIPANT_STATES = new Set(["active", "invited", "left", "ready", "retired"]);
const POSITIVE_BINDING_STATES = new Set(["accepted", "observed", "received"]);
const RELATION_STATES = new Set(["active", "draft", "failed", "paused", "proposed", "rejected", "retired", "superseded"]);
const RISK_SEVERITIES = new Set(["critical", "high", "info", "low", "medium"]);
const RISK_STATES = new Set(["accepted", "mitigated", "open"]);
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

export async function verifyRelationRecordFile(filePath) {
  const label = "interop relation record";
  const text = await readFile(filePath, "utf8");
  const relation = parseJson(text, label);

  verifyRelationRecord(relation, label);
  if (text !== `${stableStringify(relation)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return relation;
}

export function verifyRelationRecord(relation, label = "interop relation record") {
  assertRecord(relation, label);
  assertKeys(
    relation,
    [
      "basis",
      "constraints",
      "continuity",
      "edges",
      "effects",
      "evidence",
      "kind",
      "lifecycle",
      "name",
      "participants",
      "proof",
      "proposal",
      "relationType",
      "risks",
      "state",
      "supersedes",
      "version"
    ],
    [],
    label
  );

  if (relation.kind !== INTEROP_RELATION_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_RELATION_KIND}`);
  }
  if (relation.version !== INTEROP_RELATION_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_RELATION_VERSION}`);
  }

  assertToken(relation.name, `${label}.name`);
  assertToken(relation.relationType, `${label}.relationType`);
  if (!RELATION_STATES.has(relation.state)) {
    throw new Error(`${label}.state must be active, draft, failed, paused, proposed, rejected, retired, or superseded`);
  }

  validateReference(relation.proposal, `${label}.proposal`);
  if (relation.proposal.kind !== "proposal") {
    throw new Error(`${label}.proposal.kind must be proposal`);
  }

  const evidenceRefs = validateEvidence(relation.evidence, relation.proposal, `${label}.evidence`);
  const participants = validateParticipants(relation.participants, `${label}.participants`);
  validateBasis(relation.basis, relation.proposal, evidenceRefs, participantInterfaceRefs(relation.participants), `${label}.basis`);
  validateEdges(relation.edges, participants, `${label}.edges`);
  validateContinuity(relation.continuity, `${label}.continuity`);
  validateLifecycle(relation.lifecycle, relation.state, `${label}.lifecycle`);
  validateConstraints(relation.constraints, `${label}.constraints`);
  validateRequiredEvidenceState(relation, label);
  assertTokenArray(relation.effects, `${label}.effects`);
  validateEffectsCovered(relation.effects, evidenceRefs.effects, `${label}.effects`);
  validateSupersedes(relation.supersedes, `${label}.supersedes`);
  validateRisks(relation.risks, `${label}.risks`);
  validateProof(relation.proof, `${label}.proof`);
  validateActiveState(relation, label);
  validateContinuityState(relation, label);
  validateSupersedingMode(relation, label);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-relation-"));

  try {
    const valid = minimalRelation();
    await verifyRelationRecordFile(await writeRelation(tempRoot, "valid", valid));

    const multiEvidence = clone(valid);
    const extraEvidenceReference = {
      commitment: `sha256:${"2".repeat(64)}`,
      kind: "evidence",
      ref: "interop/evidence/z-session-result-extra.json"
    };
    const extraReceiptReference = {
      commitment: `sha256:${"3".repeat(64)}`,
      kind: "receipt",
      ref: "interop/receipts/z-session-result-extra.json"
    };
    const extraResultReference = {
      commitment: `sha256:${"4".repeat(64)}`,
      kind: "result",
      ref: "interop/results/z-session-result-extra.json"
    };
    const extraEvidence = clone(multiEvidence.evidence[0]);
    extraEvidence.effects = ["network.read"];
    extraEvidence.name = "session-result-observed-extra";
    extraEvidence.reference = extraEvidenceReference;
    extraEvidence.receipts[0].name = "session-result-receipt-extra";
    extraEvidence.receipts[0].reference = extraReceiptReference;
    extraEvidence.results[0].name = "session-result-extra";
    extraEvidence.results[0].reference = extraResultReference;
    multiEvidence.basis = [
      ...multiEvidence.basis,
      extraEvidenceReference,
      extraReceiptReference,
      extraResultReference
    ].sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
    multiEvidence.effects = ["filesystem.read", "network.read"];
    multiEvidence.evidence.push(extraEvidence);
    await verifyRelationRecordFile(await writeRelation(tempRoot, "multi-evidence", multiEvidence));

    await assertRejects(
      async () => verifyRelationRecordFile(await writePrettyRelation(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const missingEvidenceBasis = clone(valid);
    missingEvidenceBasis.basis = missingEvidenceBasis.basis.filter((entry) => entry.kind !== "evidence");
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "missing-evidence-basis", missingEvidenceBasis)),
      "basis must include each evidence reference"
    );

    const missingSessionBasis = clone(valid);
    missingSessionBasis.basis = missingSessionBasis.basis.filter((entry) => entry.kind !== "session");
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "missing-session-basis", missingSessionBasis)),
      "basis must include each evidence session reference"
    );

    const missingProposalBasis = clone(valid);
    missingProposalBasis.basis = missingProposalBasis.basis.filter((entry) => entry.kind !== "proposal");
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "missing-proposal-basis", missingProposalBasis)),
      "basis must include the proposal reference"
    );

    const missingReceiptBasis = clone(valid);
    missingReceiptBasis.basis = missingReceiptBasis.basis.filter((entry) => entry.kind !== "receipt");
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "missing-receipt-basis", missingReceiptBasis)),
      "basis must include each evidence receipt reference"
    );

    const missingResultBasis = clone(valid);
    missingResultBasis.basis = missingResultBasis.basis.filter((entry) => entry.kind !== "result");
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "missing-result-basis", missingResultBasis)),
      "basis must include each evidence result reference"
    );

    const missingParticipantInterfaceBasis = clone(valid);
    missingParticipantInterfaceBasis.basis = missingParticipantInterfaceBasis.basis.filter((entry) => entry.kind !== "interface");
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "missing-participant-interface-basis", missingParticipantInterfaceBasis)),
      "basis must include each participant interface reference"
    );

    const badEvidenceSession = clone(valid);
    badEvidenceSession.evidence[0].session.kind = "adapter";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "bad-evidence-session", badEvidenceSession)),
      "evidence[0].session.kind must be session"
    );

    const badEvidenceResult = clone(valid);
    badEvidenceResult.evidence[0].results[0].reference.kind = "receipt";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "bad-evidence-result", badEvidenceResult)),
      "evidence[0].results[0].reference.kind must be result"
    );

    const evidenceProposalMismatch = clone(valid);
    evidenceProposalMismatch.evidence[0].proposal.ref = "interop/proposals/other.json";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "evidence-proposal-mismatch", evidenceProposalMismatch)),
      "evidence[0].proposal must match relation proposal"
    );

    const unboundEffect = clone(valid);
    unboundEffect.effects = ["filesystem.read", "network.read"];
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "unbound-effect", unboundEffect)),
      "effects must be covered by accepted evidence"
    );

    const acceptedWithMissingReceipt = clone(valid);
    acceptedWithMissingReceipt.evidence[0].receipts[0].state = "missing";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "accepted-with-missing-receipt", acceptedWithMissingReceipt)),
      "accepted evidence must not have required missing, stale, rejected, or unknown receipts"
    );

    const acceptedWithMissingResult = clone(valid);
    acceptedWithMissingResult.evidence[0].results[0].state = "stale";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "accepted-with-missing-result", acceptedWithMissingResult)),
      "accepted evidence must not have required missing, stale, rejected, or unknown results"
    );

    const proposedWithMissingEvidence = clone(valid);
    proposedWithMissingEvidence.evidence[0].state = "missing";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "proposed-with-missing-evidence", proposedWithMissingEvidence)),
      "proposed relations must not have required missing, stale, rejected, or unknown evidence"
    );

    const unknownEdgeParticipant = clone(valid);
    unknownEdgeParticipant.edges[0].to = "projection://missing";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "unknown-edge-participant", unknownEdgeParticipant)),
      "edges[0].to must name a declared participant ref"
    );

    const selfEdge = clone(valid);
    selfEdge.edges[0].to = "projection://consumer";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "self-edge", selfEdge)),
      "edges[0] must connect distinct participants"
    );

    const proposedWithInvitedParticipant = clone(valid);
    proposedWithInvitedParticipant.participants[0].state = "invited";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "proposed-with-invited-participant", proposedWithInvitedParticipant)),
      "proposed relations must not have inactive participants"
    );

    const proposedWithUncoveredParticipant = clone(valid);
    const observerParticipant = {
      anchor: {
        commitment: `sha256:${"5".repeat(64)}`,
        kind: "origin"
      },
      interface: {
        commitment: `sha256:${"6".repeat(64)}`,
        kind: "interface",
        ref: "interop/interfaces/observer.json"
      },
      ref: "projection://observer",
      role: "observer",
      state: "ready"
    };
    proposedWithUncoveredParticipant.participants.push(observerParticipant);
    proposedWithUncoveredParticipant.participants.sort((left, right) => left.ref.localeCompare(right.ref));
    proposedWithUncoveredParticipant.basis.push(observerParticipant.interface);
    proposedWithUncoveredParticipant.basis.sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "proposed-with-uncovered-participant", proposedWithUncoveredParticipant)),
      "proposed relations must cover participants with relation edges"
    );

    const proposedWithOpenRisk = clone(valid);
    proposedWithOpenRisk.risks[0].state = "open";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "proposed-with-open-risk", proposedWithOpenRisk)),
      "proposed relations must not have open risks"
    );

    const activeWithMissingEvidence = clone(valid);
    activeWithMissingEvidence.state = "active";
    activeWithMissingEvidence.lifecycle.phase = "active";
    activeWithMissingEvidence.evidence[0].state = "missing";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "active-with-missing-evidence", activeWithMissingEvidence)),
      "active relations must not have required missing, stale, rejected, or unknown evidence"
    );

    const activeWithUnknownConstraint = clone(valid);
    activeWithUnknownConstraint.state = "active";
    activeWithUnknownConstraint.lifecycle.phase = "active";
    activeWithUnknownConstraint.constraints[0].state = "unknown";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "active-with-unknown-constraint", activeWithUnknownConstraint)),
      "active relations must not have required unsatisfied constraints"
    );

    const activeWithInactiveEdge = clone(valid);
    activeWithInactiveEdge.state = "active";
    activeWithInactiveEdge.lifecycle.phase = "active";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "active-with-inactive-edge", activeWithInactiveEdge)),
      "active relations must not have required inactive edges"
    );

    const unsortedParticipants = clone(valid);
    unsortedParticipants.participants = [...unsortedParticipants.participants].reverse();
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "unsorted-participants", unsortedParticipants)),
      "participants.ref must be sorted"
    );

    const badContinuityMode = clone(valid);
    badContinuityMode.continuity.mode = "global";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "bad-continuity-mode", badContinuityMode)),
      "continuity.mode must be finite, ongoing, renewable, snapshot, or superseding"
    );

    const supersedingWithoutSupersedes = clone(valid);
    supersedingWithoutSupersedes.continuity.mode = "superseding";
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "superseding-without-supersedes", supersedingWithoutSupersedes)),
      "superseding continuity must name superseded relation references"
    );

    const emptyProof = clone(valid);
    emptyProof.proof.commands = [];
    await assertRejects(
      async () => verifyRelationRecordFile(await writeRelation(tempRoot, "empty-proof", emptyProof)),
      "proof.commands must be a non-empty array"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateEvidence(evidence, proposal, label) {
  assertArray(evidence, label);
  const names = [];
  const refs = [];
  const effects = new Set();
  const proposalRefs = new Set();
  const sessionRefs = [];
  const receiptRefs = [];
  const resultRefs = [];
  for (const [index, entry] of evidence.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(entry, itemLabel);
    assertKeys(entry, ["effects", "name", "proposal", "receipts", "reference", "required", "results", "session", "state", "summary"], [], itemLabel);
    assertTokenArray(entry.effects, `${itemLabel}.effects`);
    assertToken(entry.name, `${itemLabel}.name`);
    validateReference(entry.proposal, `${itemLabel}.proposal`);
    if (entry.proposal.kind !== "proposal") {
      throw new Error(`${itemLabel}.proposal.kind must be proposal`);
    }
    if (!sameReference(entry.proposal, proposal)) {
      throw new Error(`${itemLabel}.proposal must match relation proposal`);
    }
    validateReference(entry.reference, `${itemLabel}.reference`);
    if (entry.reference.kind !== "evidence") {
      throw new Error(`${itemLabel}.reference.kind must be evidence`);
    }
    validateReference(entry.session, `${itemLabel}.session`);
    if (entry.session.kind !== "session") {
      throw new Error(`${itemLabel}.session.kind must be session`);
    }
    const entryReceiptRefs = validateEvidenceBindings(entry.receipts, "receipt", `${itemLabel}.receipts`);
    const entryResultRefs = validateEvidenceBindings(entry.results, "result", `${itemLabel}.results`);
    if (typeof entry.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!EVIDENCE_STATES.has(entry.state)) {
      throw new Error(`${itemLabel}.state must be accepted, missing, rejected, stale, or unknown`);
    }
    assertTrimmedString(entry.summary, `${itemLabel}.summary`);
    validateAcceptedEvidenceBindings(entry, itemLabel);
    if (entry.state === "accepted") {
      for (const effect of entry.effects) {
        effects.add(effect);
      }
    }
    names.push(entry.name);
    proposalRefs.add(referenceKey(entry.proposal));
    refs.push(referenceKey(entry.reference));
    sessionRefs.push(referenceKey(entry.session));
    receiptRefs.push(...entryReceiptRefs);
    resultRefs.push(...entryResultRefs);
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.reference`);
  return {
    evidence: new Set(refs),
    effects,
    proposals: proposalRefs,
    receipts: new Set(receiptRefs),
    results: new Set(resultRefs),
    sessions: new Set(sessionRefs)
  };
}

function validateEvidenceBindings(bindings, expectedKind, label) {
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
    if (!EVIDENCE_BINDING_STATES.has(binding.state)) {
      throw new Error(`${itemLabel}.state must be accepted, missing, observed, received, rejected, stale, or unknown`);
    }
    assertTrimmedString(binding.summary, `${itemLabel}.summary`);
    names.push(binding.name);
    refs.push(referenceKey(binding.reference));
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.reference`);
  return refs;
}

function validateAcceptedEvidenceBindings(evidence, label) {
  if (evidence.state !== "accepted") {
    return;
  }

  const missingReceipts = evidence.receipts
    .filter((receipt) => receipt.required && !POSITIVE_BINDING_STATES.has(receipt.state))
    .map((receipt) => receipt.name);
  if (missingReceipts.length > 0) {
    throw new Error(`${label} accepted evidence must not have required missing, stale, rejected, or unknown receipts: ${missingReceipts.join(", ")}`);
  }

  const missingResults = evidence.results
    .filter((result) => result.required && !POSITIVE_BINDING_STATES.has(result.state))
    .map((result) => result.name);
  if (missingResults.length > 0) {
    throw new Error(`${label} accepted evidence must not have required missing, stale, rejected, or unknown results: ${missingResults.join(", ")}`);
  }
}

function validateBasis(basis, proposal, evidenceRefs, participantInterfaceRefs, label) {
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

  const basisRefs = new Set(refs);
  const missingProposals = [...evidenceRefs.proposals].filter((ref) => !basisRefs.has(ref));
  if (missingProposals.length > 0) {
    throw new Error(`${label} must include each evidence proposal reference: ${missingProposals.join(", ")}`);
  }
  const missingEvidence = [...evidenceRefs.evidence].filter((ref) => !basisRefs.has(ref));
  if (missingEvidence.length > 0) {
    throw new Error(`${label} must include each evidence reference: ${missingEvidence.join(", ")}`);
  }
  const missingSessions = [...evidenceRefs.sessions].filter((ref) => !basisRefs.has(ref));
  if (missingSessions.length > 0) {
    throw new Error(`${label} must include each evidence session reference: ${missingSessions.join(", ")}`);
  }
  const missingReceipts = [...evidenceRefs.receipts].filter((ref) => !basisRefs.has(ref));
  if (missingReceipts.length > 0) {
    throw new Error(`${label} must include each evidence receipt reference: ${missingReceipts.join(", ")}`);
  }
  const missingResults = [...evidenceRefs.results].filter((ref) => !basisRefs.has(ref));
  if (missingResults.length > 0) {
    throw new Error(`${label} must include each evidence result reference: ${missingResults.join(", ")}`);
  }
  const missingParticipantInterfaces = [...participantInterfaceRefs].filter((ref) => !basisRefs.has(ref));
  if (missingParticipantInterfaces.length > 0) {
    throw new Error(`${label} must include each participant interface reference: ${missingParticipantInterfaces.join(", ")}`);
  }
}

function validateParticipants(participants, label) {
  assertArray(participants, label);
  const refs = [];
  const participantsByRef = new Set();
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
      throw new Error(`${itemLabel}.state must be active, invited, left, ready, or retired`);
    }
    refs.push(participant.ref);
    participantsByRef.add(participant.ref);
  }
  assertSortedUnique(refs, `${label}.ref`);
  return participantsByRef;
}

function participantInterfaceRefs(participants) {
  return new Set(participants.map((participant) => referenceKey(participant.interface)));
}

function validateEdges(edges, participants, label) {
  assertArray(edges, label);
  const names = [];
  for (const [index, edge] of edges.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(edge, itemLabel);
    assertKeys(edge, ["from", "kind", "name", "required", "state", "summary", "to"], [], itemLabel);
    assertTrimmedString(edge.from, `${itemLabel}.from`);
    if (!participants.has(edge.from)) {
      throw new Error(`${itemLabel}.from must name a declared participant ref`);
    }
    assertToken(edge.kind, `${itemLabel}.kind`);
    assertToken(edge.name, `${itemLabel}.name`);
    if (typeof edge.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!EDGE_STATES.has(edge.state)) {
      throw new Error(`${itemLabel}.state must be active, blocked, proposed, retired, or superseded`);
    }
    assertTrimmedString(edge.summary, `${itemLabel}.summary`);
    assertTrimmedString(edge.to, `${itemLabel}.to`);
    if (!participants.has(edge.to)) {
      throw new Error(`${itemLabel}.to must name a declared participant ref`);
    }
    if (edge.from === edge.to) {
      throw new Error(`${itemLabel} must connect distinct participants`);
    }
    names.push(edge.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateEffectsCovered(effects, evidenceEffects, label) {
  const missing = effects.filter((effect) => !evidenceEffects.has(effect));
  if (missing.length > 0) {
    throw new Error(`${label} must be covered by accepted evidence: ${missing.join(", ")}`);
  }
}

function validateRequiredEvidenceState(relation, label) {
  if (!["active", "paused", "proposed", "retired", "superseded"].includes(relation.state)) {
    return;
  }

  const missingEvidence = relation.evidence
    .filter((evidence) => evidence.required && evidence.state !== "accepted")
    .map((evidence) => evidence.name);
  if (missingEvidence.length > 0) {
    throw new Error(`${label} ${relation.state} relations must not have required missing, stale, rejected, or unknown evidence: ${missingEvidence.join(", ")}`);
  }
}

function validateContinuity(continuity, label) {
  assertRecord(continuity, label);
  assertKeys(continuity, ["mode", "scope", "since", "until"], [], label);
  if (!CONTINUITY_MODES.has(continuity.mode)) {
    throw new Error(`${label}.mode must be finite, ongoing, renewable, snapshot, or superseding`);
  }
  assertTrimmedString(continuity.scope, `${label}.scope`);
  assertTrimmedString(continuity.since, `${label}.since`);
  assertTrimmedString(continuity.until, `${label}.until`);
}

function validateLifecycle(lifecycle, state, label) {
  assertRecord(lifecycle, label);
  assertKeys(lifecycle, ["phase", "transitions"], [], label);
  if (!RELATION_STATES.has(lifecycle.phase)) {
    throw new Error(`${label}.phase must be a relation state`);
  }
  if (lifecycle.phase !== state) {
    throw new Error(`${label}.phase must match relation state`);
  }
  assertArray(lifecycle.transitions, `${label}.transitions`);
  const names = [];
  for (const [index, transition] of lifecycle.transitions.entries()) {
    const itemLabel = `${label}.transitions[${index}]`;
    assertRecord(transition, itemLabel);
    assertKeys(transition, ["from", "name", "required", "to"], [], itemLabel);
    if (!RELATION_STATES.has(transition.from)) {
      throw new Error(`${itemLabel}.from must be a relation state`);
    }
    assertToken(transition.name, `${itemLabel}.name`);
    if (typeof transition.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!RELATION_STATES.has(transition.to)) {
      throw new Error(`${itemLabel}.to must be a relation state`);
    }
    names.push(transition.name);
  }
  assertSortedUnique(names, `${label}.transitions.name`);
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

function validateSupersedes(supersedes, label) {
  assertAnyArray(supersedes, label);
  const refs = [];
  for (const [index, entry] of supersedes.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(entry, itemLabel);
    if (entry.kind !== "relation") {
      throw new Error(`${itemLabel}.kind must be relation`);
    }
    refs.push(referenceKey(entry));
  }
  assertSortedUnique(refs, label);
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

function validateActiveState(relation, label) {
  if (["active", "paused"].includes(relation.state)) {
    const unsatisfiedConstraints = relation.constraints
      .filter((constraint) => constraint.required && !["satisfied", "waived"].includes(constraint.state))
      .map((constraint) => constraint.name);
    if (unsatisfiedConstraints.length > 0) {
      throw new Error(`${label} ${relation.state} relations must not have required unsatisfied constraints: ${unsatisfiedConstraints.join(", ")}`);
    }
  }

  if (relation.state === "active") {
    const inactiveEdges = relation.edges
      .filter((edge) => edge.required && edge.state !== "active")
      .map((edge) => edge.name);
    if (inactiveEdges.length > 0) {
      throw new Error(`${label} active relations must not have required inactive edges: ${inactiveEdges.join(", ")}`);
    }
  }
}

function validateContinuityState(relation, label) {
  if (!["active", "paused", "proposed"].includes(relation.state)) {
    return;
  }

  const inactiveParticipants = relation.participants
    .filter((participant) => !PARTICIPANT_CONTINUITY_STATES.has(participant.state))
    .map((participant) => participant.ref);
  if (inactiveParticipants.length > 0) {
    throw new Error(`${label} ${relation.state} relations must not have inactive participants: ${inactiveParticipants.join(", ")}`);
  }

  const edgeParticipants = new Set(relation.edges.flatMap((edge) => [edge.from, edge.to]));
  const uncoveredParticipants = relation.participants
    .filter((participant) => PARTICIPANT_CONTINUITY_STATES.has(participant.state) && !edgeParticipants.has(participant.ref))
    .map((participant) => participant.ref);
  if (uncoveredParticipants.length > 0) {
    throw new Error(`${label} ${relation.state} relations must cover participants with relation edges: ${uncoveredParticipants.join(", ")}`);
  }

  const openRisks = relation.risks
    .filter((risk) => risk.state === "open")
    .map((risk) => risk.name);
  if (openRisks.length > 0) {
    throw new Error(`${label} ${relation.state} relations must not have open risks: ${openRisks.join(", ")}`);
  }
}

function validateSupersedingMode(relation, label) {
  if (relation.continuity.mode === "superseding" && relation.supersedes.length === 0) {
    throw new Error(`${label} superseding continuity must name superseded relation references`);
  }
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

function assertSortedUnique(values, label) {
  const sorted = [...values].sort();
  if (JSON.stringify(values) !== JSON.stringify(sorted)) {
    throw new Error(`${label} must be sorted`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function minimalRelation() {
  const evidence = {
    commitment: `sha256:${"a".repeat(64)}`,
    kind: "evidence",
    ref: "interop/evidence/session-result.json"
  };
  const proposal = {
    commitment: `sha256:${"9".repeat(64)}`,
    kind: "proposal",
    ref: "interop/proposals/current.json"
  };
  const receipt = {
    commitment: `sha256:${"b".repeat(64)}`,
    kind: "receipt",
    ref: "interop/receipts/session-result.json"
  };
  const result = {
    commitment: `sha256:${"c".repeat(64)}`,
    kind: "result",
    ref: "interop/results/session-result.json"
  };
  const session = {
    commitment: `sha256:${"d".repeat(64)}`,
    kind: "session",
    ref: "interop/sessions/current.json"
  };
  const consumerInterface = {
    commitment: `sha256:${"f".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/consumer.json"
  };
  const providerInterface = {
    commitment: `sha256:${"1".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/provider.json"
  };

  return {
    basis: [
      evidence,
      consumerInterface,
      providerInterface,
      proposal,
      receipt,
      result,
      session
    ],
    constraints: [
      {
        kind: "authorization",
        name: "participant-consent",
        reason: "participants must authorize preserving continuity",
        required: true,
        state: "satisfied"
      }
    ],
    continuity: {
      mode: "renewable",
      scope: "bounded collaboration continuity",
      since: "declared-by-record",
      until: "review-required"
    },
    edges: [
      {
        from: "projection://consumer",
        kind: "collaboration",
        name: "consumer-provider",
        required: true,
        state: "proposed",
        summary: "Consumer may rely on provider outputs within the declared continuity scope.",
        to: "projection://provider"
      }
    ],
    effects: ["filesystem.read"],
    evidence: [
      {
        effects: ["filesystem.read"],
        name: "session-result-observed",
        proposal,
        receipts: [
          {
            name: "session-result-receipt",
            reference: receipt,
            required: true,
            state: "received",
            summary: "Session receipt was received before preserving continuity."
          }
        ],
        reference: evidence,
        required: true,
        results: [
          {
            name: "session-result",
            reference: result,
            required: true,
            state: "observed",
            summary: "Session result was observed before preserving continuity."
          }
        ],
        session,
        state: "accepted",
        summary: "Session result evidence supports preserving this relation."
      }
    ],
    kind: INTEROP_RELATION_KIND,
    lifecycle: {
      phase: "proposed",
      transitions: [
        {
          from: "proposed",
          name: "a-activate",
          required: true,
          to: "active"
        },
        {
          from: "active",
          name: "b-retire",
          required: false,
          to: "retired"
        }
      ]
    },
    name: "consumer-provider-continuity",
    participants: [
      {
        anchor: {
          commitment: `sha256:${"e".repeat(64)}`,
          kind: "origin"
        },
        interface: consumerInterface,
        ref: "projection://consumer",
        role: "consumer",
        state: "ready"
      },
      {
        anchor: {
          commitment: `sha256:${"0".repeat(64)}`,
          kind: "origin"
        },
        interface: providerInterface,
        ref: "projection://provider",
        role: "provider",
        state: "ready"
      }
    ],
    proof: {
      commands: ["node projection-root/kit/interop/relation/verify.mjs interop/relations/current.json"]
    },
    proposal,
    relationType: "collaboration",
    risks: [
      {
        kind: "staleness",
        mitigation: "supersede the relation when evidence or participant commitments change",
        name: "stale-continuity",
        severity: "medium",
        state: "mitigated"
      }
    ],
    state: "proposed",
    supersedes: [],
    version: INTEROP_RELATION_VERSION
  };
}

async function writeRelation(tempRoot, name, relation) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(relation)}\n`, "utf8");
  return filePath;
}

async function writePrettyRelation(tempRoot, name, relation) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(relation, null, 2)}\n`, "utf8");
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
    console.log("projection interop relation verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/relation/verify.mjs <relation.json> [--json] | --self-test");
  }

  const relation = await verifyRelationRecordFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(relation));
    return;
  }

  console.log("projection interop relation record ok");
  console.log(`relation: ${relation.name}`);
  console.log(`type: ${relation.relationType}`);
  console.log(`state: ${relation.state}`);
  console.log(`participants: ${relation.participants.length}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop relation: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
