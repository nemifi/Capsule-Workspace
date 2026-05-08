#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_PROPOSAL_KIND = "projection-interop/proposal";
export const INTEROP_PROPOSAL_VERSION = 1;

const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const BINDING_SOURCE_KINDS = new Set(["evidence", "relation"]);
const BINDING_STATES = new Set(["accepted", "current", "missing", "rejected", "stale", "unknown"]);
const BINDING_READY_STATES = new Set(["accepted", "current"]);
const MATERIAL_STATES = new Set(["accepted", "missing", "observed", "received", "rejected", "stale", "unknown"]);
const MATERIAL_READY_STATES = new Set(["accepted", "observed", "received"]);
const PARTICIPANT_STATES = new Set(["accepted", "declined", "invited", "pending", "ready", "unknown"]);
const PROPOSAL_STATES = new Set(["accepted", "countered", "draft", "expired", "negotiating", "proposed", "rejected", "superseded", "withdrawn"]);
const RESPONSE_STATES = new Set(["accepted", "countered", "declined", "pending", "unknown"]);
const RISK_SEVERITIES = new Set(["critical", "high", "info", "low", "medium"]);
const RISK_STATES = new Set(["accepted", "mitigated", "open"]);
const TARGET_STATES = new Set(["candidate", "excluded", "selected", "stale", "unknown"]);
const TERM_STATES = new Set(["accepted", "countered", "pending", "rejected", "waived"]);
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

export async function verifyProposalRecordFile(filePath) {
  const label = "interop proposal record";
  const text = await readFile(filePath, "utf8");
  const proposal = parseJson(text, label);

  verifyProposalRecord(proposal, label);
  if (text !== `${stableStringify(proposal)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return proposal;
}

export function verifyProposalRecord(proposal, label = "interop proposal record") {
  assertRecord(proposal, label);
  assertKeys(
    proposal,
    [
      "basis",
      "bounds",
      "index",
      "intent",
      "kind",
      "lifecycle",
      "name",
      "offers",
      "participants",
      "proof",
      "proposalType",
      "requester",
      "requests",
      "responses",
      "risks",
      "state",
      "targets",
      "terms",
      "version"
    ],
    [],
    label
  );

  if (proposal.kind !== INTEROP_PROPOSAL_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_PROPOSAL_KIND}`);
  }
  if (proposal.version !== INTEROP_PROPOSAL_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_PROPOSAL_VERSION}`);
  }

  assertToken(proposal.name, `${label}.name`);
  assertToken(proposal.proposalType, `${label}.proposalType`);
  if (!PROPOSAL_STATES.has(proposal.state)) {
    throw new Error(`${label}.state must be accepted, countered, draft, expired, negotiating, proposed, rejected, superseded, or withdrawn`);
  }

  validateReference(proposal.intent, `${label}.intent`);
  if (proposal.intent.kind !== "intent") {
    throw new Error(`${label}.intent.kind must be intent`);
  }
  validateReference(proposal.index, `${label}.index`);
  if (proposal.index.kind !== "index") {
    throw new Error(`${label}.index.kind must be index`);
  }
  const basisRefs = validateBasis(proposal.basis, proposal.intent, proposal.index, `${label}.basis`);
  const participants = validateParticipants(proposal.participants, `${label}.participants`);
  const targets = validateTargets(proposal.targets, participants, basisRefs, proposal.index, `${label}.targets`);
  validateRequester(proposal.requester, participants, `${label}.requester`);
  validateBounds(proposal.bounds, proposal.participants, `${label}.bounds`);
  validateTargetEffectsCovered(targets, proposal.bounds, `${label}.targets`);
  validateExchanges(proposal.offers, participants, targets, proposal.bounds, `${label}.offers`);
  validateExchanges(proposal.requests, participants, targets, proposal.bounds, `${label}.requests`);
  validateTerms(proposal.terms, `${label}.terms`);
  validateResponses(proposal.responses, participants, `${label}.responses`);
  validateLifecycle(proposal.lifecycle, proposal.state, `${label}.lifecycle`);
  validateRisks(proposal.risks, `${label}.risks`);
  validateProof(proposal.proof, `${label}.proof`);
  validateAcceptedState(proposal, participants, targets, label);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-proposal-"));

  try {
    const valid = minimalProposal();
    await verifyProposalRecordFile(await writeProposal(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifyProposalRecordFile(await writePrettyProposal(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const missingIntentBasis = clone(valid);
    missingIntentBasis.basis = missingIntentBasis.basis.filter((entry) => entry.kind !== "intent");
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "missing-intent-basis", missingIntentBasis)),
      "basis must include the intent reference"
    );

    const requesterNotParticipant = clone(valid);
    requesterNotParticipant.requester.ref = "projection://missing";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "requester-not-participant", requesterNotParticipant)),
      "requester.ref must name a declared participant ref"
    );

    const requesterInterfaceMismatch = clone(valid);
    requesterInterfaceMismatch.requester.interface.ref = "interop/interfaces/missing.json";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "requester-interface-mismatch", requesterInterfaceMismatch)),
      "requester.interface must match the requester participant interface"
    );

    const requestToUnknownParticipant = clone(valid);
    requestToUnknownParticipant.requests[0].to = "projection://missing";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "request-to-unknown-participant", requestToUnknownParticipant)),
      "requests[0].to must name a declared participant ref"
    );

    const missingParticipantTarget = clone(valid);
    missingParticipantTarget.targets = missingParticipantTarget.targets.filter((target) => target.participant !== "projection://provider");
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "missing-participant-target", missingParticipantTarget)),
      "targets must include each participant ref"
    );

    const targetInterfaceMismatch = clone(valid);
    targetInterfaceMismatch.targets[0].interface.ref = "interop/interfaces/missing.json";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "target-interface-mismatch", targetInterfaceMismatch)),
      "targets[0].interface must match the participant interface"
    );

    const targetRoleMismatch = clone(valid);
    targetRoleMismatch.targets[0].roles = ["consumer"];
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "target-role-mismatch", targetRoleMismatch)),
      "targets[0].roles must include the participant role"
    );

    const missingTargetBasisIndex = clone(valid);
    missingTargetBasisIndex.targets[0].basis = missingTargetBasisIndex.targets[0].basis.filter((entry) => entry.kind !== "index");
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "missing-target-basis-index", missingTargetBasisIndex)),
      "targets[0].basis must include the target index reference"
    );

    const missingTargetBindingReceipt = clone(valid);
    missingTargetBindingReceipt.targets[0].basis = missingTargetBindingReceipt.targets[0].basis.filter((entry) => entry.kind !== "receipt");
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "missing-target-binding-receipt", missingTargetBindingReceipt)),
      "targets[0].basis must include each bound receipt reference"
    );

    const missingProposalBasisTargetRef = clone(valid);
    missingProposalBasisTargetRef.basis = missingProposalBasisTargetRef.basis.filter((entry) => entry.kind !== "receipt");
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "missing-proposal-basis-target-ref", missingProposalBasisTargetRef)),
      "targets[0].basis[2] must name a declared proposal basis reference"
    );

    const readyTargetWithMissingBindingResult = clone(valid);
    readyTargetWithMissingBindingResult.targets[0].bindings[0].results[0].state = "unknown";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "ready-target-with-missing-binding-result", readyTargetWithMissingBindingResult)),
      "ready target bindings must not have required missing, stale, rejected, or unknown results"
    );

    const selectedTargetWithStaleBinding = clone(valid);
    selectedTargetWithStaleBinding.targets[0].bindings[0].required = false;
    selectedTargetWithStaleBinding.targets[0].bindings[0].state = "stale";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "selected-target-with-stale-binding", selectedTargetWithStaleBinding)),
      "targets[0].basis must use only ready evidence or relation target bindings"
    );

    const targetEffectOutsideBounds = clone(valid);
    targetEffectOutsideBounds.targets[0].effects = ["filesystem.read", "network.read"];
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "target-effect-outside-bounds", targetEffectOutsideBounds)),
      "targets target effects must be covered by proposal bounds.effects"
    );

    const offerEffectOutsideBounds = clone(valid);
    offerEffectOutsideBounds.offers[0].effects = ["network.read"];
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "offer-effect-outside-bounds", offerEffectOutsideBounds)),
      "offers[0].effects must be covered by proposal bounds.effects"
    );

    const offerEffectOutsideTargets = clone(valid);
    offerEffectOutsideTargets.bounds.effects = ["filesystem.read", "network.read"];
    offerEffectOutsideTargets.offers[0].effects = ["network.read"];
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "offer-effect-outside-targets", offerEffectOutsideTargets)),
      "offers[0].effects must be covered by an endpoint target"
    );

    const missingResponseParticipant = clone(valid);
    missingResponseParticipant.responses = missingResponseParticipant.responses.filter((response) => response.participant !== "projection://provider");
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "missing-response-participant", missingResponseParticipant)),
      "responses must include each participant ref"
    );

    const acceptedWithPendingTerm = clone(valid);
    acceptedWithPendingTerm.state = "accepted";
    acceptedWithPendingTerm.lifecycle.phase = "accepted";
    acceptedWithPendingTerm.terms[0].state = "pending";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "accepted-with-pending-term", acceptedWithPendingTerm)),
      "accepted proposals must not have required pending, countered, or rejected terms"
    );

    const acceptedWithPendingResponse = clone(valid);
    acceptedWithPendingResponse.state = "accepted";
    acceptedWithPendingResponse.lifecycle.phase = "accepted";
    acceptedWithPendingResponse.responses[0].state = "pending";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "accepted-with-pending-response", acceptedWithPendingResponse)),
      "accepted proposals must not have required participants without accepted responses"
    );

    const acceptedWithDeclinedParticipant = clone(valid);
    acceptedWithDeclinedParticipant.state = "accepted";
    acceptedWithDeclinedParticipant.lifecycle.phase = "accepted";
    acceptedWithDeclinedParticipant.participants[0].state = "declined";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "accepted-with-declined-participant", acceptedWithDeclinedParticipant)),
      "accepted proposals must not have required unaccepted participants"
    );

    const acceptedWithUnselectedTarget = clone(valid);
    acceptedWithUnselectedTarget.state = "accepted";
    acceptedWithUnselectedTarget.lifecycle.phase = "accepted";
    acceptedWithUnselectedTarget.targets[0].state = "candidate";
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "accepted-with-unselected-target", acceptedWithUnselectedTarget)),
      "accepted proposals must not have required unselected, stale, excluded, or unknown targets"
    );

    const unsortedParticipants = clone(valid);
    unsortedParticipants.participants = [...unsortedParticipants.participants].reverse();
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "unsorted-participants", unsortedParticipants)),
      "participants.ref must be sorted"
    );

    const tooManyParticipants = clone(valid);
    tooManyParticipants.bounds.participantMaximum = 1;
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "too-many-participants", tooManyParticipants)),
      "bounds.participantMaximum must be greater than or equal to participants.length"
    );

    const emptyProof = clone(valid);
    emptyProof.proof.commands = [];
    await assertRejects(
      async () => verifyProposalRecordFile(await writeProposal(tempRoot, "empty-proof", emptyProof)),
      "proof.commands must be a non-empty array"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateBasis(basis, intent, index, label) {
  assertArray(basis, label);
  const refs = [];
  let hasIntent = false;
  let hasIndex = false;
  for (const [position, entry] of basis.entries()) {
    const itemLabel = `${label}[${position}]`;
    validateReference(entry, itemLabel);
    refs.push(referenceKey(entry));
    if (sameReference(entry, intent)) {
      hasIntent = true;
    }
    if (sameReference(entry, index)) {
      hasIndex = true;
    }
  }
  assertSortedUnique(refs, label);
  if (!hasIntent) {
    throw new Error(`${label} must include the intent reference`);
  }
  if (!hasIndex) {
    throw new Error(`${label} must include the index reference`);
  }
  return new Set(refs);
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
      throw new Error(`${itemLabel}.state must be accepted, declined, invited, pending, ready, or unknown`);
    }
    refs.push(participant.ref);
    participantsByRef.set(participant.ref, participant);
  }
  assertSortedUnique(refs, `${label}.ref`);
  return participantsByRef;
}

function validateRequester(requester, participants, label) {
  assertRecord(requester, label);
  assertKeys(requester, ["anchor", "interface", "ref"], [], label);
  validateOriginAnchor(requester.anchor, `${label}.anchor`);
  validateReference(requester.interface, `${label}.interface`);
  if (requester.interface.kind !== "interface") {
    throw new Error(`${label}.interface.kind must be interface`);
  }
  assertTrimmedString(requester.ref, `${label}.ref`);
  const participant = participants.get(requester.ref);
  if (!participant) {
    throw new Error(`${label}.ref must name a declared participant ref`);
  }
  if (!sameReference(requester.interface, participant.interface)) {
    throw new Error(`${label}.interface must match the requester participant interface`);
  }
  if (!sameAnchor(requester.anchor, participant.anchor)) {
    throw new Error(`${label}.anchor must match the requester participant anchor`);
  }
}

function validateTargets(targets, participants, proposalBasisRefs, index, label) {
  assertArray(targets, label);
  const names = [];
  const participantRefs = [];
  const targetsByParticipant = new Map();
  for (const [indexPosition, target] of targets.entries()) {
    const itemLabel = `${label}[${indexPosition}]`;
    assertRecord(target, itemLabel);
    assertKeys(target, ["basis", "bindings", "candidate", "effects", "index", "interface", "name", "participant", "required", "roles", "state", "summary"], [], itemLabel);
    validateTargetBasis(target.basis, proposalBasisRefs, `${itemLabel}.basis`);
    const basisRefs = new Set(target.basis.map((entry) => referenceKey(entry)));
    const bindings = validateTargetBindings(target.bindings, `${itemLabel}.bindings`);
    assertTrimmedString(target.candidate, `${itemLabel}.candidate`);
    validateReference(target.index, `${itemLabel}.index`);
    if (target.index.kind !== "index") {
      throw new Error(`${itemLabel}.index.kind must be index`);
    }
    if (!sameReference(target.index, index)) {
      throw new Error(`${itemLabel}.index must match proposal index`);
    }
    if (!basisRefs.has(referenceKey(target.index))) {
      throw new Error(`${itemLabel}.basis must include the target index reference`);
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
    if (target.candidate !== target.participant) {
      throw new Error(`${itemLabel}.candidate must match participant ref`);
    }
    assertTokenArray(target.effects, `${itemLabel}.effects`);
    assertTokenArray(target.roles, `${itemLabel}.roles`);
    if (!target.roles.includes(participant.role)) {
      throw new Error(`${itemLabel}.roles must include the participant role`);
    }
    if (!sameReference(target.interface, participant.interface)) {
      throw new Error(`${itemLabel}.interface must match the participant interface`);
    }
    if (!basisRefs.has(referenceKey(target.interface))) {
      throw new Error(`${itemLabel}.basis must include the target interface reference`);
    }
    if (typeof target.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!TARGET_STATES.has(target.state)) {
      throw new Error(`${itemLabel}.state must be candidate, excluded, selected, stale, or unknown`);
    }
    assertTrimmedString(target.summary, `${itemLabel}.summary`);
    validateTargetBindingBasis(bindings, basisRefs, `${itemLabel}.basis`, ["candidate", "selected"].includes(target.state));
    names.push(target.name);
    participantRefs.push(target.participant);
    targetsByParticipant.set(target.participant, target);
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(participantRefs, `${label}.participant`);

  const missingParticipants = [...participants.keys()].filter((participant) => !targetsByParticipant.has(participant));
  if (missingParticipants.length > 0) {
    throw new Error(`${label} must include each participant ref: ${missingParticipants.join(", ")}`);
  }

  return targetsByParticipant;
}

function validateTargetBasis(basis, proposalBasisRefs, label) {
  assertArray(basis, label);
  const refs = [];
  for (const [index, entry] of basis.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(entry, itemLabel);
    const key = referenceKey(entry);
    if (!proposalBasisRefs.has(key)) {
      throw new Error(`${itemLabel} must name a declared proposal basis reference`);
    }
    refs.push(key);
  }
  assertSortedUnique(refs, label);
}

function validateTargetBindings(bindings, label) {
  assertAnyArray(bindings, label);
  const names = [];
  const refs = [];
  const bindingsBySource = new Map();
  for (const [index, binding] of bindings.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(binding, itemLabel);
    assertKeys(binding, ["name", "receipts", "required", "results", "session", "source", "state", "summary"], [], itemLabel);
    assertToken(binding.name, `${itemLabel}.name`);
    validateReference(binding.source, `${itemLabel}.source`);
    if (!BINDING_SOURCE_KINDS.has(binding.source.kind)) {
      throw new Error(`${itemLabel}.source.kind must be evidence or relation`);
    }
    const sourceKey = referenceKey(binding.source);
    validateReference(binding.session, `${itemLabel}.session`);
    if (binding.session.kind !== "session") {
      throw new Error(`${itemLabel}.session.kind must be session`);
    }
    const sessionKey = referenceKey(binding.session);
    const receiptRefs = validateMaterialBindings(binding.receipts, "receipt", `${itemLabel}.receipts`);
    const resultRefs = validateMaterialBindings(binding.results, "result", `${itemLabel}.results`);
    if (typeof binding.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!BINDING_STATES.has(binding.state)) {
      throw new Error(`${itemLabel}.state must be accepted, current, missing, rejected, stale, or unknown`);
    }
    assertTrimmedString(binding.summary, `${itemLabel}.summary`);
    validateReadyTargetBinding(binding, itemLabel);
    names.push(binding.name);
    refs.push(sourceKey);
    bindingsBySource.set(sourceKey, {
      receipts: new Set(receiptRefs),
      results: new Set(resultRefs),
      session: sessionKey,
      state: binding.state
    });
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.source`);
  return bindingsBySource;
}

function validateMaterialBindings(bindings, expectedKind, label) {
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
    const key = referenceKey(binding.reference);
    if (typeof binding.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!MATERIAL_STATES.has(binding.state)) {
      throw new Error(`${itemLabel}.state must be accepted, missing, observed, received, rejected, stale, or unknown`);
    }
    assertTrimmedString(binding.summary, `${itemLabel}.summary`);
    names.push(binding.name);
    refs.push(key);
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.reference`);
  return refs;
}

function validateReadyTargetBinding(binding, label) {
  if (!BINDING_READY_STATES.has(binding.state)) {
    return;
  }

  const missingReceipts = binding.receipts
    .filter((receipt) => receipt.required && !MATERIAL_READY_STATES.has(receipt.state))
    .map((receipt) => receipt.name);
  if (missingReceipts.length > 0) {
    throw new Error(`${label} ready target bindings must not have required missing, stale, rejected, or unknown receipts: ${missingReceipts.join(", ")}`);
  }

  const missingResults = binding.results
    .filter((result) => result.required && !MATERIAL_READY_STATES.has(result.state))
    .map((result) => result.name);
  if (missingResults.length > 0) {
    throw new Error(`${label} ready target bindings must not have required missing, stale, rejected, or unknown results: ${missingResults.join(", ")}`);
  }
}

function validateTargetBindingBasis(bindings, basisRefs, label, requireReadyBindings = false) {
  for (const [source, binding] of bindings.entries()) {
    if (!basisRefs.has(source)) {
      throw new Error(`${label} must include each bound source reference: ${source}`);
    }
    if (requireReadyBindings && !BINDING_READY_STATES.has(binding.state)) {
      throw new Error(`${label} must use only ready evidence or relation target bindings: ${source}`);
    }
    if (!basisRefs.has(binding.session)) {
      throw new Error(`${label} must include each bound session reference: ${binding.session}`);
    }
    const missingReceipts = [...binding.receipts].filter((receipt) => !basisRefs.has(receipt));
    if (missingReceipts.length > 0) {
      throw new Error(`${label} must include each bound receipt reference: ${missingReceipts.join(", ")}`);
    }
    const missingResults = [...binding.results].filter((result) => !basisRefs.has(result));
    if (missingResults.length > 0) {
      throw new Error(`${label} must include each bound result reference: ${missingResults.join(", ")}`);
    }
  }
}

function validateTargetEffectsCovered(targets, bounds, label) {
  const boundsEffects = new Set(bounds.effects);
  const missing = [];
  for (const target of targets.values()) {
    for (const effect of target.effects) {
      if (!boundsEffects.has(effect)) {
        missing.push(`${target.name}:${effect}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`${label} target effects must be covered by proposal bounds.effects: ${missing.join(", ")}`);
  }
}

function validateExchanges(exchanges, participants, targets, bounds, label) {
  assertAnyArray(exchanges, label);
  const names = [];
  const boundsEffects = new Set(bounds.effects);
  for (const [index, exchange] of exchanges.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(exchange, itemLabel);
    assertKeys(exchange, ["effects", "from", "kind", "name", "payload", "required", "summary", "to"], [], itemLabel);
    assertTokenArray(exchange.effects, `${itemLabel}.effects`);
    assertTrimmedString(exchange.from, `${itemLabel}.from`);
    if (!participants.has(exchange.from)) {
      throw new Error(`${itemLabel}.from must name a declared participant ref`);
    }
    assertToken(exchange.kind, `${itemLabel}.kind`);
    assertToken(exchange.name, `${itemLabel}.name`);
    assertTrimmedString(exchange.payload, `${itemLabel}.payload`);
    if (typeof exchange.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    assertTrimmedString(exchange.summary, `${itemLabel}.summary`);
    assertTrimmedString(exchange.to, `${itemLabel}.to`);
    if (!participants.has(exchange.to)) {
      throw new Error(`${itemLabel}.to must name a declared participant ref`);
    }
    validateExchangeEffects(exchange, targets, boundsEffects, itemLabel);
    names.push(exchange.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateExchangeEffects(exchange, targets, boundsEffects, label) {
  const outsideBounds = exchange.effects.filter((effect) => !boundsEffects.has(effect));
  if (outsideBounds.length > 0) {
    throw new Error(`${label}.effects must be covered by proposal bounds.effects: ${outsideBounds.join(", ")}`);
  }

  if (exchange.required) {
    const unreadyTargets = [exchange.from, exchange.to].filter((participant) => {
      const target = targets.get(participant);
      return !target || !["candidate", "selected"].includes(target.state);
    });
    if (unreadyTargets.length > 0) {
      throw new Error(`${label} required exchanges must use candidate or selected targets: ${unreadyTargets.join(", ")}`);
    }
  }

  const fromEffects = new Set(targets.get(exchange.from)?.effects ?? []);
  const toEffects = new Set(targets.get(exchange.to)?.effects ?? []);
  const outsideTargets = exchange.effects.filter((effect) => !fromEffects.has(effect) && !toEffects.has(effect));
  if (outsideTargets.length > 0) {
    throw new Error(`${label}.effects must be covered by an endpoint target: ${outsideTargets.join(", ")}`);
  }
}

function validateTerms(terms, label) {
  assertArray(terms, label);
  const names = [];
  for (const [index, term] of terms.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(term, itemLabel);
    assertKeys(term, ["kind", "name", "required", "state", "summary"], [], itemLabel);
    assertToken(term.kind, `${itemLabel}.kind`);
    assertToken(term.name, `${itemLabel}.name`);
    if (typeof term.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!TERM_STATES.has(term.state)) {
      throw new Error(`${itemLabel}.state must be accepted, countered, pending, rejected, or waived`);
    }
    assertTrimmedString(term.summary, `${itemLabel}.summary`);
    names.push(term.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateResponses(responses, participants, label) {
  assertArray(responses, label);
  const refs = [];
  for (const [index, response] of responses.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(response, itemLabel);
    assertKeys(response, ["participant", "reason", "state"], [], itemLabel);
    assertTrimmedString(response.participant, `${itemLabel}.participant`);
    if (!participants.has(response.participant)) {
      throw new Error(`${itemLabel}.participant must name a declared participant ref`);
    }
    assertTrimmedString(response.reason, `${itemLabel}.reason`);
    if (!RESPONSE_STATES.has(response.state)) {
      throw new Error(`${itemLabel}.state must be accepted, countered, declined, pending, or unknown`);
    }
    refs.push(response.participant);
  }
  assertSortedUnique(refs, `${label}.participant`);
  const responseRefs = new Set(refs);
  const missingParticipants = [...participants.keys()].filter((participant) => !responseRefs.has(participant));
  if (missingParticipants.length > 0) {
    throw new Error(`${label} must include each participant ref: ${missingParticipants.join(", ")}`);
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

function validateLifecycle(lifecycle, state, label) {
  assertRecord(lifecycle, label);
  assertKeys(lifecycle, ["phase", "transitions"], [], label);
  if (!PROPOSAL_STATES.has(lifecycle.phase)) {
    throw new Error(`${label}.phase must be a proposal state`);
  }
  if (lifecycle.phase !== state) {
    throw new Error(`${label}.phase must match proposal state`);
  }
  assertArray(lifecycle.transitions, `${label}.transitions`);
  const names = [];
  for (const [index, transition] of lifecycle.transitions.entries()) {
    const itemLabel = `${label}.transitions[${index}]`;
    assertRecord(transition, itemLabel);
    assertKeys(transition, ["from", "name", "required", "to"], [], itemLabel);
    if (!PROPOSAL_STATES.has(transition.from)) {
      throw new Error(`${itemLabel}.from must be a proposal state`);
    }
    assertToken(transition.name, `${itemLabel}.name`);
    if (typeof transition.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!PROPOSAL_STATES.has(transition.to)) {
      throw new Error(`${itemLabel}.to must be a proposal state`);
    }
    names.push(transition.name);
  }
  assertSortedUnique(names, `${label}.transitions.name`);
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

function validateAcceptedState(proposal, participants, targets, label) {
  if (proposal.state !== "accepted") {
    return;
  }

  const unacceptedTerms = proposal.terms
    .filter((term) => term.required && !["accepted", "waived"].includes(term.state))
    .map((term) => term.name);
  if (unacceptedTerms.length > 0) {
    throw new Error(`${label} accepted proposals must not have required pending, countered, or rejected terms: ${unacceptedTerms.join(", ")}`);
  }

  const responsesByParticipant = new Map(proposal.responses.map((response) => [response.participant, response]));
  const unacceptedParticipants = [...participants.values()]
    .filter((participant) => participant.required && participant.state !== "accepted")
    .map((participant) => participant.ref);
  if (unacceptedParticipants.length > 0) {
    throw new Error(`${label} accepted proposals must not have required unaccepted participants: ${unacceptedParticipants.join(", ")}`);
  }

  const missingResponses = [...participants.values()]
    .filter((participant) => participant.required)
    .filter((participant) => responsesByParticipant.get(participant.ref)?.state !== "accepted")
    .map((participant) => participant.ref);
  if (missingResponses.length > 0) {
    throw new Error(`${label} accepted proposals must not have required participants without accepted responses: ${missingResponses.join(", ")}`);
  }

  const unselectedTargets = [...targets.values()]
    .filter((target) => target.required && target.state !== "selected")
    .map((target) => target.name);
  if (unselectedTargets.length > 0) {
    throw new Error(`${label} accepted proposals must not have required unselected, stale, excluded, or unknown targets: ${unselectedTargets.join(", ")}`);
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

function sameAnchor(left, right) {
  return left.kind === right.kind && left.commitment === right.commitment;
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

function minimalProposal() {
  const intent = {
    commitment: `sha256:${"a".repeat(64)}`,
    kind: "intent",
    ref: "interop/intents/current.json"
  };
  const index = {
    commitment: `sha256:${"b".repeat(64)}`,
    kind: "index",
    ref: "interop/indexes/current.json"
  };
  const requesterInterface = {
    commitment: `sha256:${"c".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/requester.json"
  };
  const providerInterface = {
    commitment: `sha256:${"d".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/provider.json"
  };
  const evidence = {
    commitment: `sha256:${"e".repeat(64)}`,
    kind: "evidence",
    ref: "interop/evidence/session-result.json"
  };
  const receipt = {
    commitment: `sha256:${"f".repeat(64)}`,
    kind: "receipt",
    ref: "interop/receipts/session-result.json"
  };
  const relation = {
    commitment: `sha256:${"0".repeat(64)}`,
    kind: "relation",
    ref: "interop/relations/consumer-provider.json"
  };
  const result = {
    commitment: `sha256:${"1".repeat(64)}`,
    kind: "result",
    ref: "interop/results/session-result.json"
  };
  const session = {
    commitment: `sha256:${"2".repeat(64)}`,
    kind: "session",
    ref: "interop/sessions/current.json"
  };

  return {
    basis: [evidence, index, intent, providerInterface, requesterInterface, receipt, relation, result, session],
    bounds: {
      duration: "PT30M",
      effects: ["filesystem.read"],
      participantMaximum: 2
    },
    index,
    intent,
    kind: INTEROP_PROPOSAL_KIND,
    lifecycle: {
      phase: "proposed",
      transitions: [
        {
          from: "proposed",
          name: "a-accept",
          required: true,
          to: "accepted"
        },
        {
          from: "proposed",
          name: "b-counter",
          required: false,
          to: "countered"
        }
      ]
    },
    name: "provider-read-proposal",
    offers: [
      {
        effects: ["filesystem.read"],
        from: "projection://provider",
        kind: "capability",
        name: "read-access",
        payload: "projection.payload.read.v1",
        required: true,
        summary: "Provider offers bounded read access for the requested outcome.",
        to: "projection://requester"
      }
    ],
    participants: [
      {
        anchor: {
          commitment: `sha256:${"3".repeat(64)}`,
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
          commitment: `sha256:${"4".repeat(64)}`,
          kind: "origin"
        },
        interface: requesterInterface,
        ref: "projection://requester",
        required: true,
        role: "requester",
        state: "accepted"
      }
    ],
    proof: {
      commands: ["node projection-root/kit/interop/proposal/verify.mjs interop/proposals/current.json"]
    },
    proposalType: "coordination",
    requester: {
      anchor: {
        commitment: `sha256:${"4".repeat(64)}`,
        kind: "origin"
      },
      interface: requesterInterface,
      ref: "projection://requester"
    },
    requests: [
      {
        effects: ["filesystem.read"],
        from: "projection://requester",
        kind: "capability",
        name: "bounded-read",
        payload: "projection.payload.read.v1",
        required: true,
        summary: "Requester asks provider to expose bounded read capability.",
        to: "projection://provider"
      }
    ],
    responses: [
      {
        participant: "projection://provider",
        reason: "provider accepts the bounded request as record state",
        state: "accepted"
      },
      {
        participant: "projection://requester",
        reason: "requester accepts the provider offer as record state",
        state: "accepted"
      }
    ],
    risks: [
      {
        kind: "runtime",
        mitigation: "treat proposal acceptance as planning input, not runtime permission",
        name: "premature-execution",
        severity: "high",
        state: "mitigated"
      }
    ],
    state: "proposed",
    targets: [
      {
        basis: [index, providerInterface, receipt, relation, result, session],
        bindings: [
          {
            name: "relation-consumer-provider",
            receipts: [
              {
                name: "session-result-receipt",
                reference: receipt,
                required: true,
                state: "received",
                summary: "Relation receipt is visible before proposing provider coordination."
              }
            ],
            required: true,
            results: [
              {
                name: "session-result",
                reference: result,
                required: true,
                state: "observed",
                summary: "Relation result is visible before proposing provider coordination."
              }
            ],
            session,
            source: relation,
            state: "accepted",
            summary: "Provider target is derived from the bound relation source."
          }
        ],
        candidate: "projection://provider",
        effects: ["filesystem.read"],
        index,
        interface: providerInterface,
        name: "provider-target",
        participant: "projection://provider",
        required: true,
        roles: ["provider"],
        state: "selected",
        summary: "Provider participant is selected from the bound index candidate view."
      },
      {
        basis: [evidence, index, requesterInterface, receipt, result, session],
        bindings: [
          {
            name: "evidence-session-result",
            receipts: [
              {
                name: "session-result-receipt",
                reference: receipt,
                required: true,
                state: "received",
                summary: "Evidence receipt is visible before proposing requester coordination."
              }
            ],
            required: true,
            results: [
              {
                name: "session-result",
                reference: result,
                required: true,
                state: "observed",
                summary: "Evidence result is visible before proposing requester coordination."
              }
            ],
            session,
            source: evidence,
            state: "accepted",
            summary: "Requester target is derived from the bound evidence source."
          }
        ],
        candidate: "projection://requester",
        effects: ["filesystem.read"],
        index,
        interface: requesterInterface,
        name: "requester-target",
        participant: "projection://requester",
        required: true,
        roles: ["requester"],
        state: "selected",
        summary: "Requester participant is selected from the bound index candidate view."
      }
    ],
    terms: [
      {
        kind: "authorization",
        name: "runtime-authorization-required",
        required: true,
        state: "accepted",
        summary: "Runtime authorization remains body-owned before execution."
      }
    ],
    version: INTEROP_PROPOSAL_VERSION
  };
}

async function writeProposal(tempRoot, name, proposal) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(proposal)}\n`, "utf8");
  return filePath;
}

async function writePrettyProposal(tempRoot, name, proposal) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
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
    console.log("projection interop proposal verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/proposal/verify.mjs <proposal.json> [--json] | --self-test");
  }

  const proposal = await verifyProposalRecordFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(proposal));
    return;
  }

  console.log("projection interop proposal record ok");
  console.log(`proposal: ${proposal.name}`);
  console.log(`type: ${proposal.proposalType}`);
  console.log(`state: ${proposal.state}`);
  console.log(`participants: ${proposal.participants.length}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop proposal: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
