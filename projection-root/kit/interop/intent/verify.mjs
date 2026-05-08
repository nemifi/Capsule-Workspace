#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_INTENT_KIND = "projection-interop/intent";
export const INTEROP_INTENT_VERSION = 1;

const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;
const CONTEXT_SCOPES = new Set(["local", "portable", "published"]);
const OUTCOME_PRIORITIES = new Set(["critical", "high", "low", "normal"]);
const SCALE_MODES = new Set(["fanout", "group", "index", "pair", "single"]);
const RESERVED_PAYLOADS = new Set(["opaque"]);

export async function verifyIntentManifestFile(filePath) {
  const label = "interop intent manifest";
  const text = await readFile(filePath, "utf8");
  const manifest = parseJson(text, label);

  verifyIntentManifest(manifest, label);
  if (text !== `${stableStringify(manifest)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return manifest;
}

export function verifyIntentManifest(manifest, label = "interop intent manifest") {
  assertRecord(manifest, label);
  assertKeys(
    manifest,
    [
      "constraints",
      "context",
      "expects",
      "inputs",
      "kind",
      "outcome",
      "participants",
      "proof",
      "requester",
      "scale",
      "version",
      "vocabularies"
    ],
    [],
    label
  );

  if (manifest.kind !== INTEROP_INTENT_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_INTENT_KIND}`);
  }
  if (manifest.version !== INTEROP_INTENT_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_INTENT_VERSION}`);
  }

  validateRequester(manifest.requester, `${label}.requester`);
  validateOutcome(manifest.outcome, `${label}.outcome`);
  validateContext(manifest.context, `${label}.context`);
  validateScale(manifest.scale, `${label}.scale`);
  const vocabularies = validateVocabularies(manifest.vocabularies, `${label}.vocabularies`);
  validateConstraints(manifest.constraints, `${label}.constraints`);
  validatePayloadDescriptors(manifest.inputs, vocabularies, `${label}.inputs`);
  validatePayloadDescriptors(manifest.expects, vocabularies, `${label}.expects`);
  validateParticipants(manifest.participants, `${label}.participants`);
  validateProof(manifest.proof, `${label}.proof`);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-intent-"));

  try {
    const valid = minimalManifest();
    await verifyIntentManifestFile(await writeManifest(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifyIntentManifestFile(await writePrettyManifest(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const badCommitment = clone(valid);
    badCommitment.requester.anchor.commitment = "sha256:not-a-commitment";
    await assertRejects(
      async () => verifyIntentManifestFile(await writeManifest(tempRoot, "bad-commitment", badCommitment)),
      "must be a sha256 commitment"
    );

    const unsortedConstraints = clone(valid);
    unsortedConstraints.constraints = [...unsortedConstraints.constraints].reverse();
    await assertRejects(
      async () => verifyIntentManifestFile(await writeManifest(tempRoot, "unsorted-constraints", unsortedConstraints)),
      "constraints.name must be sorted"
    );

    const undeclaredPayload = clone(valid);
    undeclaredPayload.inputs[0].payload = "projection.unknown.v1";
    await assertRejects(
      async () => verifyIntentManifestFile(await writeManifest(tempRoot, "undeclared-payload", undeclaredPayload)),
      "must be opaque or named in vocabularies"
    );

    const unknownRole = clone(valid);
    unknownRole.participants.preferred = [
      {
        ref: "projection://alpha",
        role: "unknown"
      }
    ];
    await assertRejects(
      async () => verifyIntentManifestFile(await writeManifest(tempRoot, "unknown-role", unknownRole)),
      "must name a declared participant role"
    );

    const invalidCount = clone(valid);
    invalidCount.participants.roles[0].count.maximum = 0;
    await assertRejects(
      async () => verifyIntentManifestFile(await writeManifest(tempRoot, "invalid-count", invalidCount)),
      "maximum must be null or greater than or equal to minimum"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateRequester(requester, label) {
  assertRecord(requester, label);
  assertKeys(requester, ["anchor", "ref"], [], label);
  assertTrimmedString(requester.ref, `${label}.ref`);

  assertRecord(requester.anchor, `${label}.anchor`);
  assertKeys(requester.anchor, ["commitment", "kind"], [], `${label}.anchor`);
  if (requester.anchor.kind !== "origin") {
    throw new Error(`${label}.anchor.kind must be origin`);
  }
  assertCommitment(requester.anchor.commitment, `${label}.anchor.commitment`);
}

function validateOutcome(outcome, label) {
  assertRecord(outcome, label);
  assertKeys(outcome, ["name", "priority", "summary"], [], label);
  assertToken(outcome.name, `${label}.name`);
  if (!OUTCOME_PRIORITIES.has(outcome.priority)) {
    throw new Error(`${label}.priority must be critical, high, low, or normal`);
  }
  assertTrimmedString(outcome.summary, `${label}.summary`);
}

function validateContext(context, label) {
  assertRecord(context, label);
  assertKeys(context, ["scope", "tags"], [], label);
  if (!CONTEXT_SCOPES.has(context.scope)) {
    throw new Error(`${label}.scope must be local, portable, or published`);
  }
  assertTokenArray(context.tags, `${label}.tags`);
}

function validateScale(scale, label) {
  assertRecord(scale, label);
  assertKeys(scale, ["maximum", "minimum", "mode"], [], label);
  if (!SCALE_MODES.has(scale.mode)) {
    throw new Error(`${label}.mode must be fanout, group, index, pair, or single`);
  }
  assertNonNegativeInteger(scale.minimum, `${label}.minimum`);
  if (scale.minimum < 1) {
    throw new Error(`${label}.minimum must be at least 1`);
  }
  if (scale.maximum !== null) {
    assertNonNegativeInteger(scale.maximum, `${label}.maximum`);
    if (scale.maximum < scale.minimum) {
      throw new Error(`${label}.maximum must be null or greater than or equal to minimum`);
    }
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

function validateConstraints(constraints, label) {
  assertAnyArray(constraints, label);
  const names = [];
  for (const [index, constraint] of constraints.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(constraint, itemLabel);
    assertKeys(constraint, ["kind", "name", "required", "value"], [], itemLabel);
    assertToken(constraint.kind, `${itemLabel}.kind`);
    assertToken(constraint.name, `${itemLabel}.name`);
    if (typeof constraint.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    assertJsonValue(constraint.value, `${itemLabel}.value`);
    names.push(constraint.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validatePayloadDescriptors(records, vocabularies, label) {
  assertAnyArray(records, label);
  const names = [];
  for (const [index, record] of records.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(record, itemLabel);
    assertKeys(record, ["kind", "name", "payload", "required"], [], itemLabel);
    assertToken(record.kind, `${itemLabel}.kind`);
    assertToken(record.name, `${itemLabel}.name`);
    assertPayloadRef(record.payload, vocabularies, `${itemLabel}.payload`);
    if (typeof record.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    names.push(record.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateParticipants(participants, label) {
  assertRecord(participants, label);
  assertKeys(participants, ["excluded", "preferred", "roles"], [], label);
  const roles = validateRoles(participants.roles, `${label}.roles`);
  validateParticipantSelectors(participants.preferred, roles, `${label}.preferred`, { excluded: false });
  validateParticipantSelectors(participants.excluded, roles, `${label}.excluded`, { excluded: true });
}

function validateRoles(roles, label) {
  assertArray(roles, label);
  const names = [];
  for (const [index, role] of roles.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(role, itemLabel);
    assertKeys(
      role,
      [
        "accepts",
        "capabilities",
        "count",
        "effects",
        "emits",
        "name",
        "queries",
        "required",
        "resources",
        "streams",
        "surfaces",
        "tags"
      ],
      [],
      itemLabel
    );
    assertToken(role.name, `${itemLabel}.name`);
    if (typeof role.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    validateCount(role.count, `${itemLabel}.count`);
    if (role.required && role.count.minimum < 1) {
      throw new Error(`${itemLabel}.count.minimum must be at least 1 for required roles`);
    }
    for (const key of [
      "accepts",
      "capabilities",
      "effects",
      "emits",
      "queries",
      "resources",
      "streams",
      "surfaces",
      "tags"
    ]) {
      assertTokenArray(role[key], `${itemLabel}.${key}`);
    }
    names.push(role.name);
  }
  assertSortedUnique(names, `${label}.name`);
  return new Set(names);
}

function validateCount(count, label) {
  assertRecord(count, label);
  assertKeys(count, ["maximum", "minimum"], [], label);
  assertNonNegativeInteger(count.minimum, `${label}.minimum`);
  if (count.maximum !== null) {
    assertNonNegativeInteger(count.maximum, `${label}.maximum`);
    if (count.maximum < count.minimum) {
      throw new Error(`${label}.maximum must be null or greater than or equal to minimum`);
    }
  }
}

function validateParticipantSelectors(selectors, roles, label, options) {
  assertAnyArray(selectors, label);
  const refs = [];
  for (const [index, selector] of selectors.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(selector, itemLabel);
    assertKeys(selector, ["ref"], options.excluded ? ["anchor", "reason", "role"] : ["anchor", "role"], itemLabel);
    assertTrimmedString(selector.ref, `${itemLabel}.ref`);
    if ("anchor" in selector) {
      validateOptionalAnchor(selector.anchor, `${itemLabel}.anchor`);
    }
    if ("role" in selector) {
      assertToken(selector.role, `${itemLabel}.role`);
      if (!roles.has(selector.role)) {
        throw new Error(`${itemLabel}.role must name a declared participant role`);
      }
    }
    if ("reason" in selector) {
      assertTrimmedString(selector.reason, `${itemLabel}.reason`);
    }
    refs.push(selector.ref);
  }
  assertSortedUnique(refs, `${label}.ref`);
}

function validateOptionalAnchor(anchor, label) {
  assertRecord(anchor, label);
  assertKeys(anchor, ["commitment", "kind"], [], label);
  if (anchor.kind !== "origin") {
    throw new Error(`${label}.kind must be origin`);
  }
  assertCommitment(anchor.commitment, `${label}.commitment`);
}

function validateProof(proof, label) {
  assertRecord(proof, label);
  assertKeys(proof, ["commands"], [], label);
  assertStringArray(proof.commands, `${label}.commands`);
  assertSortedUnique(proof.commands, `${label}.commands`);
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
  assertArray(value, label);
  for (const [index, item] of value.entries()) {
    assertTrimmedString(item, `${label}[${index}]`);
  }
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

function assertJsonValue(value, label) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    throw new Error(`${label} must be a JSON value`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite JSON number`);
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertJsonValue(item, `${label}[${index}]`);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${label}.${key}`);
    }
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

function minimalManifest() {
  return {
    constraints: [
      {
        kind: "safety",
        name: "adapter-required",
        required: true,
        value: "all non-opaque payload translation must name an adapter plan"
      },
      {
        kind: "scale",
        name: "planning-window",
        required: false,
        value: "PT10M"
      }
    ],
    context: {
      scope: "portable",
      tags: ["coordination", "planning"]
    },
    expects: [
      {
        kind: "record",
        name: "candidate-plan",
        payload: "projection.compatibility.v1",
        required: true
      }
    ],
    inputs: [
      {
        kind: "record",
        name: "source-interface",
        payload: "projection.interface.v1",
        required: true
      }
    ],
    kind: INTEROP_INTENT_KIND,
    outcome: {
      name: "projection.coordinate",
      priority: "normal",
      summary: "Find compatible projections and produce a bounded compatibility plan."
    },
    participants: {
      excluded: [],
      preferred: [],
      roles: [
        {
          accepts: ["projection.intent"],
          capabilities: ["projection.inspect"],
          count: {
            maximum: 10000,
            minimum: 1
          },
          effects: [],
          emits: [],
          name: "candidate",
          queries: [],
          required: true,
          resources: [],
          streams: [],
          surfaces: [],
          tags: []
        }
      ]
    },
    proof: {
      commands: ["node projection-root/kit/interop/intent/verify.mjs interop/intents/current.json"]
    },
    requester: {
      anchor: {
        commitment: `sha256:${"b".repeat(64)}`,
        kind: "origin"
      },
      ref: "sample-requester"
    },
    scale: {
      maximum: 10000,
      minimum: 2,
      mode: "fanout"
    },
    version: INTEROP_INTENT_VERSION,
    vocabularies: [
      {
        kind: "record",
        name: "projection.compatibility.v1",
        ref: "projection-root/kit/interop/ARCHITECTURE.md#compatibility"
      },
      {
        kind: "record",
        name: "projection.interface.v1",
        ref: "projection-root/kit/interop/manifest.json"
      }
    ]
  };
}

async function writeManifest(tempRoot, name, manifest) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${stableStringify(manifest)}\n`, "utf8");
  return filePath;
}

async function writePrettyManifest(tempRoot, name, manifest) {
  const filePath = path.join(tempRoot, `${name}.json`);
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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
    console.log("projection interop intent verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/intent/verify.mjs <manifest.json> [--json] | --self-test");
  }

  const manifest = await verifyIntentManifestFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(manifest));
    return;
  }

  console.log("projection interop intent manifest ok");
  console.log(`requester: ${manifest.requester.ref}`);
  console.log(`outcome: ${manifest.outcome.name}`);
  console.log(`scale: ${manifest.scale.mode}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop intent: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
