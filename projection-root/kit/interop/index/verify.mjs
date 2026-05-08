#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_INDEX_KIND = "projection-interop/index";
export const INTEROP_INDEX_VERSION = 1;

const CANDIDATE_STATES = new Set(["candidate", "excluded", "selected", "stale", "unknown"]);
const BINDING_SOURCE_KINDS = new Set(["evidence", "relation"]);
const BINDING_STATES = new Set(["accepted", "current", "missing", "rejected", "stale", "unknown"]);
const BINDING_READY_STATES = new Set(["accepted", "current"]);
const MATERIAL_STATES = new Set(["accepted", "missing", "observed", "received", "rejected", "stale", "unknown"]);
const MATERIAL_READY_STATES = new Set(["accepted", "observed", "received"]);
const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FRESHNESS_STATES = new Set(["current", "stale", "unknown"]);
const INDEX_STATES = new Set(["derived", "draft", "failed", "retired", "stale"]);
const LINK_STATES = new Set(["blocked", "candidate", "selected", "stale", "unknown"]);
const RISK_SEVERITIES = new Set(["critical", "high", "info", "low", "medium"]);
const RISK_STATES = new Set(["accepted", "mitigated", "open"]);
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

export async function verifyIndexRecordFile(filePath) {
  const label = "interop index record";
  const text = await readFile(filePath, "utf8");
  const index = parseJson(text, label);

  verifyIndexRecord(index, label);
  if (text !== `${stableStringify(index)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return index;
}

export function verifyIndexRecord(index, label = "interop index record") {
  assertRecord(index, label);
  assertKeys(
    index,
    [
      "bindings",
      "candidates",
      "derivation",
      "filters",
      "freshness",
      "indexType",
      "kind",
      "links",
      "name",
      "proof",
      "risks",
      "scope",
      "sources",
      "state",
      "version"
    ],
    [],
    label
  );

  if (index.kind !== INTEROP_INDEX_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_INDEX_KIND}`);
  }
  if (index.version !== INTEROP_INDEX_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_INDEX_VERSION}`);
  }

  assertToken(index.name, `${label}.name`);
  assertToken(index.indexType, `${label}.indexType`);
  if (!INDEX_STATES.has(index.state)) {
    throw new Error(`${label}.state must be derived, draft, failed, retired, or stale`);
  }

  validateScope(index.scope, `${label}.scope`);
  const sourceRefs = validateSources(index.sources, `${label}.sources`);
  const sourceBindings = validateSourceBindings(index.bindings, sourceRefs, `${label}.bindings`);
  const candidateRefs = validateCandidates(index.candidates, index.scope, sourceRefs, sourceBindings, `${label}.candidates`);
  validateScopeLimit(index.scope, index.candidates, `${label}.scope`);
  validateLinks(index.links, sourceRefs, sourceBindings, candidateRefs, `${label}.links`);
  validateDerivation(index.derivation, index.sources, index.bindings, index.candidates, index.links, `${label}.derivation`);
  validateFilters(index.filters, `${label}.filters`);
  const freshnessRefs = validateFreshness(index.freshness, sourceRefs, `${label}.freshness`);
  validateFreshnessCoverage(sourceRefs, freshnessRefs, `${label}.freshness`);
  validateRisks(index.risks, `${label}.risks`);
  validateProof(index.proof, `${label}.proof`);
  validateDerivedState(index, label);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-index-"));

  try {
    const valid = minimalIndex();
    await verifyIndexRecordFile(await writeIndex(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifyIndexRecordFile(await writePrettyIndex(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const missingCandidateBasisSource = clone(valid);
    missingCandidateBasisSource.candidates[0].basis = missingCandidateBasisSource.candidates[0].basis.filter((entry) => entry.kind !== "interface");
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "missing-candidate-basis-source", missingCandidateBasisSource)),
      "candidates[0].basis must include the candidate interface reference"
    );

    const missingCandidateBindingMaterial = clone(valid);
    missingCandidateBindingMaterial.candidates[0].basis = missingCandidateBindingMaterial.candidates[0].basis.filter((entry) => entry.kind !== "receipt");
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "missing-candidate-binding-material", missingCandidateBindingMaterial)),
      "candidates[0].basis must include each bound receipt reference"
    );

    const candidateWithoutBindingSource = clone(valid);
    candidateWithoutBindingSource.candidates[0].basis = candidateWithoutBindingSource.candidates[0].basis.filter((entry) => entry.kind !== "evidence");
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "candidate-without-binding-source", candidateWithoutBindingSource)),
      "candidates[0].basis must include at least one ready evidence or relation source binding"
    );

    const missingLinkBindingSession = clone(valid);
    missingLinkBindingSession.links[0].basis = missingLinkBindingSession.links[0].basis.filter((entry) => entry.kind !== "session");
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "missing-link-binding-session", missingLinkBindingSession)),
      "links[0].basis must include each bound session reference"
    );

    const linkWithoutBindingSource = clone(valid);
    linkWithoutBindingSource.links[0].basis = linkWithoutBindingSource.links[0].basis.filter((entry) => entry.kind !== "relation");
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "link-without-binding-source", linkWithoutBindingSource)),
      "links[0].basis must include at least one ready evidence or relation source binding"
    );

    const missingSourceBinding = clone(valid);
    missingSourceBinding.bindings = missingSourceBinding.bindings.filter((entry) => entry.source.kind !== "evidence");
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "missing-source-binding", missingSourceBinding)),
      "candidates[0].basis must declare a binding for evidence or relation source"
    );

    const badBindingSourceKind = clone(valid);
    badBindingSourceKind.bindings[0].source.kind = "interface";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "bad-binding-source-kind", badBindingSourceKind)),
      "bindings[0].source.kind must be evidence or relation"
    );

    const missingSourceFreshness = clone(valid);
    missingSourceFreshness.freshness = missingSourceFreshness.freshness.filter((entry) => entry.reference.kind !== "result");
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "missing-source-freshness", missingSourceFreshness)),
      "freshness must include each source reference"
    );

    const linkToUnknownCandidate = clone(valid);
    linkToUnknownCandidate.links[0].to = "projection://missing";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "link-to-unknown-candidate", linkToUnknownCandidate)),
      "links[0].to must name a declared candidate ref"
    );

    const wrongCandidateCount = clone(valid);
    wrongCandidateCount.derivation.candidateCount = 9;
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "wrong-candidate-count", wrongCandidateCount)),
      "derivation.candidateCount must equal candidates.length"
    );

    const wrongBindingCount = clone(valid);
    wrongBindingCount.derivation.bindingCount = 9;
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "wrong-binding-count", wrongBindingCount)),
      "derivation.bindingCount must equal bindings.length"
    );

    const tooManyCandidates = clone(valid);
    tooManyCandidates.scope.maximumCandidates = 1;
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "too-many-candidates", tooManyCandidates)),
      "scope.maximumCandidates must be greater than or equal to candidates.length"
    );

    const candidateRoleOutsideScope = clone(valid);
    candidateRoleOutsideScope.candidates[0].roles = ["admin"];
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "candidate-role-outside-scope", candidateRoleOutsideScope)),
      "candidates[0].roles must be covered by scope.roles"
    );

    const candidateEffectOutsideScope = clone(valid);
    candidateEffectOutsideScope.candidates[0].effects = ["network.read"];
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "candidate-effect-outside-scope", candidateEffectOutsideScope)),
      "candidates[0].effects must be covered by scope.effects"
    );

    const selfLink = clone(valid);
    selfLink.links[0].to = "projection://consumer";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "self-link", selfLink)),
      "links[0] must connect distinct candidates"
    );

    const derivedWithStaleFreshness = clone(valid);
    derivedWithStaleFreshness.freshness[0].state = "stale";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "derived-with-stale-freshness", derivedWithStaleFreshness)),
      "derived indexes must not have stale or unknown source freshness"
    );

    const derivedWithStaleBinding = clone(valid);
    derivedWithStaleBinding.bindings[0].state = "stale";
    derivedWithStaleBinding.candidates[0].state = "stale";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "derived-with-stale-binding", derivedWithStaleBinding)),
      "derived indexes must not have required missing, stale, rejected, or unknown source bindings"
    );

    const derivedWithUnknownCandidate = clone(valid);
    derivedWithUnknownCandidate.candidates[0].state = "unknown";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "derived-with-unknown-candidate", derivedWithUnknownCandidate)),
      "derived indexes must not have stale or unknown candidates"
    );

    const derivedWithStaleLink = clone(valid);
    derivedWithStaleLink.links[0].state = "stale";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "derived-with-stale-link", derivedWithStaleLink)),
      "derived indexes must not have blocked, stale, or unknown links"
    );

    const derivedWithOpenRisk = clone(valid);
    derivedWithOpenRisk.risks[0].state = "open";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "derived-with-open-risk", derivedWithOpenRisk)),
      "derived indexes must not have open risks"
    );

    const candidateWithStaleOptionalBinding = clone(valid);
    candidateWithStaleOptionalBinding.bindings[0].required = false;
    candidateWithStaleOptionalBinding.bindings[0].state = "stale";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "candidate-with-stale-optional-binding", candidateWithStaleOptionalBinding)),
      "candidates[0].basis must use only ready evidence or relation source bindings"
    );

    const linkWithStaleOptionalBinding = clone(valid);
    linkWithStaleOptionalBinding.bindings[1].required = false;
    linkWithStaleOptionalBinding.bindings[1].state = "stale";
    linkWithStaleOptionalBinding.candidates[1].state = "stale";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "link-with-stale-optional-binding", linkWithStaleOptionalBinding)),
      "links[0].basis must use only ready evidence or relation source bindings"
    );

    const readyBindingWithMissingResult = clone(valid);
    readyBindingWithMissingResult.bindings[0].results[0].state = "unknown";
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "ready-binding-with-missing-result", readyBindingWithMissingResult)),
      "ready source bindings must not have required missing, stale, rejected, or unknown results"
    );

    const badScore = clone(valid);
    badScore.candidates[0].score = 1.2;
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "bad-score", badScore)),
      "candidates[0].score must be a number from 0 to 1"
    );

    const unsortedSources = clone(valid);
    unsortedSources.sources = [...unsortedSources.sources].reverse();
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "unsorted-sources", unsortedSources)),
      "sources must be sorted"
    );

    const emptyProof = clone(valid);
    emptyProof.proof.commands = [];
    await assertRejects(
      async () => verifyIndexRecordFile(await writeIndex(tempRoot, "empty-proof", emptyProof)),
      "proof.commands must be a non-empty array"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateScope(scope, label) {
  assertRecord(scope, label);
  assertKeys(scope, ["contexts", "effects", "maximumCandidates", "roles"], [], label);
  assertTokenArray(scope.contexts, `${label}.contexts`);
  assertTokenArray(scope.effects, `${label}.effects`);
  assertNonNegativeInteger(scope.maximumCandidates, `${label}.maximumCandidates`);
  assertTokenArray(scope.roles, `${label}.roles`);
}

function validateSources(sources, label) {
  assertArray(sources, label);
  const refs = [];
  const sourceRefs = new Set();
  for (const [index, source] of sources.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(source, itemLabel);
    const key = referenceKey(source);
    refs.push(key);
    sourceRefs.add(key);
  }
  assertSortedUnique(refs, label);
  return sourceRefs;
}

function validateScopeLimit(scope, candidates, label) {
  if (scope.maximumCandidates < candidates.length) {
    throw new Error(`${label}.maximumCandidates must be greater than or equal to candidates.length`);
  }
}

function validateSourceBindings(bindings, sourceRefs, label) {
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
    if (!sourceRefs.has(sourceKey)) {
      throw new Error(`${itemLabel}.source must name a declared source reference`);
    }
    validateReference(binding.session, `${itemLabel}.session`);
    if (binding.session.kind !== "session") {
      throw new Error(`${itemLabel}.session.kind must be session`);
    }
    const sessionKey = referenceKey(binding.session);
    if (!sourceRefs.has(sessionKey)) {
      throw new Error(`${itemLabel}.session must name a declared source reference`);
    }
    const receiptRefs = validateMaterialBindings(binding.receipts, "receipt", sourceRefs, `${itemLabel}.receipts`);
    const resultRefs = validateMaterialBindings(binding.results, "result", sourceRefs, `${itemLabel}.results`);
    if (typeof binding.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if (!BINDING_STATES.has(binding.state)) {
      throw new Error(`${itemLabel}.state must be accepted, current, missing, rejected, stale, or unknown`);
    }
    assertTrimmedString(binding.summary, `${itemLabel}.summary`);
    validateReadySourceBinding(binding, itemLabel);
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

function validateMaterialBindings(bindings, expectedKind, sourceRefs, label) {
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
    if (!sourceRefs.has(key)) {
      throw new Error(`${itemLabel}.reference must name a declared source reference`);
    }
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

function validateReadySourceBinding(binding, label) {
  if (!BINDING_READY_STATES.has(binding.state)) {
    return;
  }

  const missingReceipts = binding.receipts
    .filter((receipt) => receipt.required && !MATERIAL_READY_STATES.has(receipt.state))
    .map((receipt) => receipt.name);
  if (missingReceipts.length > 0) {
    throw new Error(`${label} ready source bindings must not have required missing, stale, rejected, or unknown receipts: ${missingReceipts.join(", ")}`);
  }

  const missingResults = binding.results
    .filter((result) => result.required && !MATERIAL_READY_STATES.has(result.state))
    .map((result) => result.name);
  if (missingResults.length > 0) {
    throw new Error(`${label} ready source bindings must not have required missing, stale, rejected, or unknown results: ${missingResults.join(", ")}`);
  }
}

function validateCandidates(candidates, scope, sourceRefs, sourceBindings, label) {
  assertAnyArray(candidates, label);
  const refs = [];
  const candidateRefs = new Set();
  const scopeRoles = new Set(scope.roles);
  const scopeEffects = new Set(scope.effects);
  for (const [index, candidate] of candidates.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(candidate, itemLabel);
    assertKeys(candidate, ["anchor", "basis", "effects", "interface", "name", "ref", "roles", "score", "state", "summary"], [], itemLabel);
    validateOriginAnchor(candidate.anchor, `${itemLabel}.anchor`);
    validateReference(candidate.interface, `${itemLabel}.interface`);
    if (candidate.interface.kind !== "interface") {
      throw new Error(`${itemLabel}.interface.kind must be interface`);
    }
    assertToken(candidate.name, `${itemLabel}.name`);
    assertTrimmedString(candidate.ref, `${itemLabel}.ref`);
    assertTokenArray(candidate.roles, `${itemLabel}.roles`);
    assertTokenArray(candidate.effects, `${itemLabel}.effects`);
    const outOfScopeRoles = candidate.roles.filter((role) => !scopeRoles.has(role));
    if (outOfScopeRoles.length > 0) {
      throw new Error(`${itemLabel}.roles must be covered by scope.roles: ${outOfScopeRoles.join(", ")}`);
    }
    const outOfScopeEffects = candidate.effects.filter((effect) => !scopeEffects.has(effect));
    if (outOfScopeEffects.length > 0) {
      throw new Error(`${itemLabel}.effects must be covered by scope.effects: ${outOfScopeEffects.join(", ")}`);
    }
    assertScore(candidate.score, `${itemLabel}.score`);
    if (!CANDIDATE_STATES.has(candidate.state)) {
      throw new Error(`${itemLabel}.state must be candidate, excluded, selected, stale, or unknown`);
    }
    assertTrimmedString(candidate.summary, `${itemLabel}.summary`);
    validateBasisInSources(candidate.basis, sourceRefs, sourceBindings, `${itemLabel}.basis`, ["candidate", "selected"].includes(candidate.state));
    const basisRefs = new Set(candidate.basis.map((entry) => referenceKey(entry)));
    if (!basisRefs.has(referenceKey(candidate.interface))) {
      throw new Error(`${itemLabel}.basis must include the candidate interface reference`);
    }
    refs.push(candidate.ref);
    candidateRefs.add(candidate.ref);
  }
  assertSortedUnique(refs, `${label}.ref`);
  return candidateRefs;
}

function validateLinks(links, sourceRefs, sourceBindings, candidateRefs, label) {
  assertAnyArray(links, label);
  const names = [];
  for (const [index, link] of links.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(link, itemLabel);
    assertKeys(link, ["basis", "from", "kind", "name", "score", "state", "summary", "to"], [], itemLabel);
    assertTrimmedString(link.from, `${itemLabel}.from`);
    if (!candidateRefs.has(link.from)) {
      throw new Error(`${itemLabel}.from must name a declared candidate ref`);
    }
    assertToken(link.kind, `${itemLabel}.kind`);
    assertToken(link.name, `${itemLabel}.name`);
    assertScore(link.score, `${itemLabel}.score`);
    if (!LINK_STATES.has(link.state)) {
      throw new Error(`${itemLabel}.state must be blocked, candidate, selected, stale, or unknown`);
    }
    assertTrimmedString(link.summary, `${itemLabel}.summary`);
    assertTrimmedString(link.to, `${itemLabel}.to`);
    if (!candidateRefs.has(link.to)) {
      throw new Error(`${itemLabel}.to must name a declared candidate ref`);
    }
    if (link.from === link.to) {
      throw new Error(`${itemLabel} must connect distinct candidates`);
    }
    validateBasisInSources(link.basis, sourceRefs, sourceBindings, `${itemLabel}.basis`, ["candidate", "selected"].includes(link.state));
    names.push(link.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateDerivation(derivation, sources, bindings, candidates, links, label) {
  assertRecord(derivation, label);
  assertKeys(derivation, ["algorithm", "bindingCount", "candidateCount", "generatedAt", "inputCount", "linkCount"], [], label);
  assertToken(derivation.algorithm, `${label}.algorithm`);
  assertNonNegativeInteger(derivation.bindingCount, `${label}.bindingCount`);
  if (derivation.bindingCount !== bindings.length) {
    throw new Error(`${label}.bindingCount must equal bindings.length`);
  }
  assertNonNegativeInteger(derivation.candidateCount, `${label}.candidateCount`);
  if (derivation.candidateCount !== candidates.length) {
    throw new Error(`${label}.candidateCount must equal candidates.length`);
  }
  assertTrimmedString(derivation.generatedAt, `${label}.generatedAt`);
  assertNonNegativeInteger(derivation.inputCount, `${label}.inputCount`);
  if (derivation.inputCount !== sources.length) {
    throw new Error(`${label}.inputCount must equal sources.length`);
  }
  assertNonNegativeInteger(derivation.linkCount, `${label}.linkCount`);
  if (derivation.linkCount !== links.length) {
    throw new Error(`${label}.linkCount must equal links.length`);
  }
}

function validateFilters(filters, label) {
  assertAnyArray(filters, label);
  const names = [];
  for (const [index, filter] of filters.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(filter, itemLabel);
    assertKeys(filter, ["kind", "name", "required", "value"], [], itemLabel);
    assertToken(filter.kind, `${itemLabel}.kind`);
    assertToken(filter.name, `${itemLabel}.name`);
    if (typeof filter.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    assertTrimmedString(filter.value, `${itemLabel}.value`);
    names.push(filter.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateFreshness(freshness, sourceRefs, label) {
  assertAnyArray(freshness, label);
  const names = [];
  const refs = [];
  const freshnessRefs = new Set();
  for (const [index, entry] of freshness.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(entry, itemLabel);
    assertKeys(entry, ["name", "reason", "reference", "state"], [], itemLabel);
    assertToken(entry.name, `${itemLabel}.name`);
    assertTrimmedString(entry.reason, `${itemLabel}.reason`);
    validateReference(entry.reference, `${itemLabel}.reference`);
    const key = referenceKey(entry.reference);
    if (!sourceRefs.has(key)) {
      throw new Error(`${itemLabel}.reference must name a declared source reference`);
    }
    if (!FRESHNESS_STATES.has(entry.state)) {
      throw new Error(`${itemLabel}.state must be current, stale, or unknown`);
    }
    names.push(entry.name);
    refs.push(key);
    freshnessRefs.add(key);
  }
  assertSortedUnique(names, `${label}.name`);
  assertSortedUnique(refs, `${label}.reference`);
  return freshnessRefs;
}

function validateFreshnessCoverage(sourceRefs, freshnessRefs, label) {
  const missingSources = [...sourceRefs].filter((ref) => !freshnessRefs.has(ref));
  if (missingSources.length > 0) {
    throw new Error(`${label} must include each source reference: ${missingSources.join(", ")}`);
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

function validateProof(proof, label) {
  assertRecord(proof, label);
  assertKeys(proof, ["commands"], [], label);
  assertStringArray(proof.commands, `${label}.commands`);
  if (proof.commands.length === 0) {
    throw new Error(`${label}.commands must be a non-empty array`);
  }
}

function validateDerivedState(index, label) {
  if (index.state === "derived") {
    const staleSources = index.freshness
      .filter((entry) => entry.state !== "current")
      .map((entry) => entry.name);
    if (staleSources.length > 0) {
      throw new Error(`${label} derived indexes must not have stale or unknown source freshness: ${staleSources.join(", ")}`);
    }

    const staleBindings = index.bindings
      .filter((binding) => binding.required && !BINDING_READY_STATES.has(binding.state))
      .map((binding) => binding.name);
    if (staleBindings.length > 0) {
      throw new Error(`${label} derived indexes must not have required missing, stale, rejected, or unknown source bindings: ${staleBindings.join(", ")}`);
    }

    const staleCandidates = index.candidates
      .filter((candidate) => ["stale", "unknown"].includes(candidate.state))
      .map((candidate) => candidate.name);
    if (staleCandidates.length > 0) {
      throw new Error(`${label} derived indexes must not have stale or unknown candidates: ${staleCandidates.join(", ")}`);
    }

    const staleLinks = index.links
      .filter((link) => ["blocked", "stale", "unknown"].includes(link.state))
      .map((link) => link.name);
    if (staleLinks.length > 0) {
      throw new Error(`${label} derived indexes must not have blocked, stale, or unknown links: ${staleLinks.join(", ")}`);
    }

    const openRisks = index.risks
      .filter((risk) => risk.state === "open")
      .map((risk) => risk.name);
    if (openRisks.length > 0) {
      throw new Error(`${label} derived indexes must not have open risks: ${openRisks.join(", ")}`);
    }
  }
}

function validateBasisInSources(basis, sourceRefs, sourceBindings, label, requireReadyBindings = false) {
  assertArray(basis, label);
  const refs = [];
  for (const [index, entry] of basis.entries()) {
    const itemLabel = `${label}[${index}]`;
    validateReference(entry, itemLabel);
    const key = referenceKey(entry);
    if (!sourceRefs.has(key)) {
      throw new Error(`${itemLabel} must name a declared source reference`);
    }
    refs.push(key);
  }
  assertSortedUnique(refs, label);
  const basisRefs = new Set(refs);
  let readyBindingCount = 0;
  for (const ref of refs) {
    const kind = ref.slice(0, ref.indexOf(":"));
    if (!BINDING_SOURCE_KINDS.has(kind)) {
      continue;
    }
    const binding = sourceBindings.get(ref);
    if (!binding) {
      throw new Error(`${label} must declare a binding for evidence or relation source: ${ref}`);
    }
    if (requireReadyBindings && !BINDING_READY_STATES.has(binding.state)) {
      throw new Error(`${label} must use only ready evidence or relation source bindings: ${ref}`);
    }
    if (BINDING_READY_STATES.has(binding.state)) {
      readyBindingCount += 1;
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
  if (requireReadyBindings && readyBindingCount === 0) {
    throw new Error(`${label} must include at least one ready evidence or relation source binding`);
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

function minimalIndex() {
  const consumerInterface = {
    commitment: `sha256:${"a".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/consumer.json"
  };
  const providerInterface = {
    commitment: `sha256:${"b".repeat(64)}`,
    kind: "interface",
    ref: "interop/interfaces/provider.json"
  };
  const sessionEvidence = {
    commitment: `sha256:${"c".repeat(64)}`,
    kind: "evidence",
    ref: "interop/evidence/session-result.json"
  };
  const receipt = {
    commitment: `sha256:${"d".repeat(64)}`,
    kind: "receipt",
    ref: "interop/receipts/session-result.json"
  };
  const relation = {
    commitment: `sha256:${"e".repeat(64)}`,
    kind: "relation",
    ref: "interop/relations/consumer-provider.json"
  };
  const result = {
    commitment: `sha256:${"f".repeat(64)}`,
    kind: "result",
    ref: "interop/results/session-result.json"
  };
  const session = {
    commitment: `sha256:${"0".repeat(64)}`,
    kind: "session",
    ref: "interop/sessions/current.json"
  };

  return {
    bindings: [
      {
        name: "evidence-session-result",
        receipts: [
          {
            name: "session-result-receipt",
            reference: receipt,
            required: true,
            state: "received",
            summary: "Session evidence receipt is visible before deriving candidates."
          }
        ],
        required: true,
        results: [
          {
            name: "session-result",
            reference: result,
            required: true,
            state: "observed",
            summary: "Session evidence result is visible before deriving candidates."
          }
        ],
        session,
        source: sessionEvidence,
        state: "accepted",
        summary: "Candidate derivation can read the evidence with its session, receipt, and result material."
      },
      {
        name: "relation-consumer-provider",
        receipts: [
          {
            name: "session-result-receipt",
            reference: receipt,
            required: true,
            state: "received",
            summary: "Relation evidence receipt is visible before deriving links."
          }
        ],
        required: true,
        results: [
          {
            name: "session-result",
            reference: result,
            required: true,
            state: "observed",
            summary: "Relation evidence result is visible before deriving links."
          }
        ],
        session,
        source: relation,
        state: "accepted",
        summary: "Link derivation can read the relation with its supporting evidence material."
      }
    ],
    candidates: [
      {
        anchor: {
          commitment: `sha256:${"1".repeat(64)}`,
          kind: "origin"
        },
        basis: [sessionEvidence, consumerInterface, receipt, result, session],
        effects: ["filesystem.read"],
        interface: consumerInterface,
        name: "consumer",
        ref: "projection://consumer",
        roles: ["consumer"],
        score: 0.81,
        state: "candidate",
        summary: "Consumer candidate derived from interface and evidence sources."
      },
      {
        anchor: {
          commitment: `sha256:${"2".repeat(64)}`,
          kind: "origin"
        },
        basis: [providerInterface, receipt, relation, result, session],
        effects: ["filesystem.read"],
        interface: providerInterface,
        name: "provider",
        ref: "projection://provider",
        roles: ["provider"],
        score: 0.93,
        state: "candidate",
        summary: "Provider candidate derived from interface and relation sources."
      }
    ],
    derivation: {
      algorithm: "bounded-candidate-view",
      bindingCount: 2,
      candidateCount: 2,
      generatedAt: "declared-by-record",
      inputCount: 7,
      linkCount: 1
    },
    filters: [
      {
        kind: "effect",
        name: "filesystem-read",
        required: true,
        value: "filesystem.read"
      }
    ],
    freshness: [
      {
        name: "evidence-current",
        reason: "source commitment matched the candidate basis",
        reference: sessionEvidence,
        state: "current"
      },
      {
        name: "interface-consumer-current",
        reason: "source commitment matched the candidate basis",
        reference: consumerInterface,
        state: "current"
      },
      {
        name: "interface-provider-current",
        reason: "source commitment matched the candidate basis",
        reference: providerInterface,
        state: "current"
      },
      {
        name: "receipt-current",
        reason: "source commitment matched the binding material",
        reference: receipt,
        state: "current"
      },
      {
        name: "relation-current",
        reason: "source commitment matched the link basis",
        reference: relation,
        state: "current"
      },
      {
        name: "result-current",
        reason: "source commitment matched the binding material",
        reference: result,
        state: "current"
      },
      {
        name: "session-current",
        reason: "source commitment matched the source bindings",
        reference: session,
        state: "current"
      }
    ],
    indexType: "discovery",
    kind: INTEROP_INDEX_KIND,
    links: [
      {
        basis: [receipt, relation, result, session],
        from: "projection://consumer",
        kind: "relation",
        name: "consumer-provider",
        score: 0.89,
        state: "candidate",
        summary: "Existing relation source suggests a candidate link.",
        to: "projection://provider"
      }
    ],
    name: "filesystem-read-candidate-index",
    proof: {
      commands: ["node projection-root/kit/interop/index/verify.mjs interop/indexes/current.json"]
    },
    risks: [
      {
        kind: "staleness",
        mitigation: "rebuild the index when source commitments change",
        name: "stale-source-view",
        severity: "medium",
        state: "mitigated"
      }
    ],
    scope: {
      contexts: ["default"],
      effects: ["filesystem.read"],
      maximumCandidates: 100,
      roles: ["consumer", "provider"]
    },
    sources: [sessionEvidence, consumerInterface, providerInterface, receipt, relation, result, session],
    state: "derived",
    version: INTEROP_INDEX_VERSION
  };
}

async function writeIndex(tempRoot, name, index) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(index)}\n`, "utf8");
  return filePath;
}

async function writePrettyIndex(tempRoot, name, index) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
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
    console.log("projection interop index verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/index/verify.mjs <index.json> [--json] | --self-test");
  }

  const index = await verifyIndexRecordFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(index));
    return;
  }

  console.log("projection interop index record ok");
  console.log(`index: ${index.name}`);
  console.log(`type: ${index.indexType}`);
  console.log(`state: ${index.state}`);
  console.log(`candidates: ${index.candidates.length}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop index: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
