#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEROP_INTERFACE_KIND = "projection-interop/interface";
export const INTEROP_INTERFACE_VERSION = 1;

const COMMITMENT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;
const CONTEXT_SCOPES = new Set(["local", "portable", "published"]);
const CAPABILITY_MODES = new Set(["invoke", "observe", "read", "stream", "write"]);
const STREAM_DIRECTIONS = new Set(["bidirectional", "input", "output"]);
const RESERVED_PAYLOADS = new Set(["opaque"]);

export async function verifyInterfaceManifestFile(filePath) {
  const label = "interop interface manifest";
  const text = await readFile(filePath, "utf8");
  const manifest = parseJson(text, label);

  verifyInterfaceManifest(manifest, label);
  if (text !== `${stableStringify(manifest)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }

  return manifest;
}

export function verifyInterfaceManifest(manifest, label = "interop interface manifest") {
  assertRecord(manifest, label);
  assertKeys(
    manifest,
    [
      "accepts",
      "capabilities",
      "context",
      "effects",
      "emits",
      "kind",
      "projection",
      "proof",
      "queries",
      "resources",
      "streams",
      "surfaces",
      "version",
      "vocabularies"
    ],
    [],
    label
  );

  if (manifest.kind !== INTEROP_INTERFACE_KIND) {
    throw new Error(`${label}.kind must be ${INTEROP_INTERFACE_KIND}`);
  }
  if (manifest.version !== INTEROP_INTERFACE_VERSION) {
    throw new Error(`${label}.version must be ${INTEROP_INTERFACE_VERSION}`);
  }

  validateProjection(manifest.projection, `${label}.projection`);
  validateContext(manifest.context, `${label}.context`);
  validateEffectList(manifest.effects, `${label}.effects`);
  const surfaces = validateSurfaces(manifest.surfaces, `${label}.surfaces`);
  const vocabularies = validateVocabularies(manifest.vocabularies, `${label}.vocabularies`);
  validateCapabilities(manifest.capabilities, surfaces, manifest.effects, vocabularies, `${label}.capabilities`);
  validateMessageDescriptors(manifest.emits, surfaces, vocabularies, `${label}.emits`);
  validateMessageDescriptors(manifest.accepts, surfaces, vocabularies, `${label}.accepts`);
  validateResources(manifest.resources, surfaces, `${label}.resources`);
  validateStreams(manifest.streams, surfaces, vocabularies, `${label}.streams`);
  validateQueries(manifest.queries, surfaces, vocabularies, `${label}.queries`);
  validateProof(manifest.proof, `${label}.proof`);
}

export async function runSelfTest() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "projection-interop-interface-"));

  try {
    const valid = minimalManifest();
    await verifyInterfaceManifestFile(await writeManifest(tempRoot, "valid", valid));

    await assertRejects(
      async () => verifyInterfaceManifestFile(await writePrettyManifest(tempRoot, "noncanonical", valid)),
      "canonical JSON"
    );

    const unknownSurface = clone(valid);
    unknownSurface.capabilities[0].surface = "missing";
    await assertRejects(
      async () => verifyInterfaceManifestFile(await writeManifest(tempRoot, "unknown-surface", unknownSurface)),
      "must name a declared surface"
    );

    const badCommitment = clone(valid);
    badCommitment.projection.anchor.commitment = "sha256:not-a-commitment";
    await assertRejects(
      async () => verifyInterfaceManifestFile(await writeManifest(tempRoot, "bad-commitment", badCommitment)),
      "must be a sha256 commitment"
    );

    const undeclaredEffect = clone(valid);
    undeclaredEffect.capabilities[0].effects = ["filesystem.read", "network.write"];
    await assertRejects(
      async () => verifyInterfaceManifestFile(await writeManifest(tempRoot, "undeclared-effect", undeclaredEffect)),
      "must be declared in effects"
    );

    const undeclaredPayload = clone(valid);
    undeclaredPayload.emits = [
      {
        kind: "event",
        name: "projection.changed",
        payload: "projection.change.v1",
        surface: "verify"
      }
    ];
    await assertRejects(
      async () => verifyInterfaceManifestFile(await writeManifest(tempRoot, "undeclared-payload", undeclaredPayload)),
      "must be opaque or named in vocabularies"
    );

    const unsortedSurfaces = clone(valid);
    unsortedSurfaces.surfaces = [...unsortedSurfaces.surfaces].reverse();
    await assertRejects(
      async () => verifyInterfaceManifestFile(await writeManifest(tempRoot, "unsorted-surfaces", unsortedSurfaces)),
      "surfaces.name must be sorted"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function validateProjection(projection, label) {
  assertRecord(projection, label);
  assertKeys(projection, ["anchor", "ref"], [], label);
  assertTrimmedString(projection.ref, `${label}.ref`);

  assertRecord(projection.anchor, `${label}.anchor`);
  assertKeys(projection.anchor, ["commitment", "kind"], [], `${label}.anchor`);
  if (projection.anchor.kind !== "origin") {
    throw new Error(`${label}.anchor.kind must be origin`);
  }
  assertCommitment(projection.anchor.commitment, `${label}.anchor.commitment`);
}

function validateContext(context, label) {
  assertRecord(context, label);
  assertKeys(context, ["scope", "tags"], [], label);
  if (!CONTEXT_SCOPES.has(context.scope)) {
    throw new Error(`${label}.scope must be local, portable, or published`);
  }
  assertTokenArray(context.tags, `${label}.tags`);
}

function validateSurfaces(surfaces, label) {
  assertArray(surfaces, label);
  const names = [];
  for (const [index, surface] of surfaces.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(surface, itemLabel);
    assertKeys(surface, ["kind", "name", "ref"], [], itemLabel);
    assertToken(surface.kind, `${itemLabel}.kind`);
    assertToken(surface.name, `${itemLabel}.name`);
    assertTrimmedString(surface.ref, `${itemLabel}.ref`);
    names.push(surface.name);
  }
  assertSortedUnique(names, `${label}.name`);
  return new Set(names);
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

function validateCapabilities(capabilities, surfaces, declaredEffects, vocabularies, label) {
  assertAnyArray(capabilities, label);
  const names = [];
  for (const [index, capability] of capabilities.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(capability, itemLabel);
    assertKeys(capability, ["effects", "inputs", "mode", "name", "outputs", "surface"], [], itemLabel);
    assertToken(capability.name, `${itemLabel}.name`);
    assertSurfaceRef(capability.surface, surfaces, `${itemLabel}.surface`);
    if (!CAPABILITY_MODES.has(capability.mode)) {
      throw new Error(`${itemLabel}.mode must be invoke, observe, read, stream, or write`);
    }
    validateEffectList(capability.effects, `${itemLabel}.effects`);
    for (const effect of capability.effects) {
      if (!declaredEffects.includes(effect)) {
        throw new Error(`${itemLabel}.effects ${effect} must be declared in effects`);
      }
    }
    validatePorts(capability.inputs, vocabularies, `${itemLabel}.inputs`, { input: true });
    validatePorts(capability.outputs, vocabularies, `${itemLabel}.outputs`, { input: false });
    names.push(capability.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateMessageDescriptors(records, surfaces, vocabularies, label) {
  assertAnyArray(records, label);
  const names = [];
  for (const [index, record] of records.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(record, itemLabel);
    assertKeys(record, ["kind", "name", "payload", "surface"], [], itemLabel);
    assertToken(record.kind, `${itemLabel}.kind`);
    assertToken(record.name, `${itemLabel}.name`);
    assertSurfaceRef(record.surface, surfaces, `${itemLabel}.surface`);
    assertPayloadRef(record.payload, vocabularies, `${itemLabel}.payload`);
    names.push(record.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateResources(resources, surfaces, label) {
  assertAnyArray(resources, label);
  const names = [];
  for (const [index, resource] of resources.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(resource, itemLabel);
    assertKeys(resource, ["kind", "name", "ref", "surface"], [], itemLabel);
    assertToken(resource.kind, `${itemLabel}.kind`);
    assertToken(resource.name, `${itemLabel}.name`);
    assertTrimmedString(resource.ref, `${itemLabel}.ref`);
    assertSurfaceRef(resource.surface, surfaces, `${itemLabel}.surface`);
    names.push(resource.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateStreams(streams, surfaces, vocabularies, label) {
  assertAnyArray(streams, label);
  const names = [];
  for (const [index, stream] of streams.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(stream, itemLabel);
    assertKeys(stream, ["direction", "name", "payload", "surface"], [], itemLabel);
    if (!STREAM_DIRECTIONS.has(stream.direction)) {
      throw new Error(`${itemLabel}.direction must be bidirectional, input, or output`);
    }
    assertToken(stream.name, `${itemLabel}.name`);
    assertPayloadRef(stream.payload, vocabularies, `${itemLabel}.payload`);
    assertSurfaceRef(stream.surface, surfaces, `${itemLabel}.surface`);
    names.push(stream.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateQueries(queries, surfaces, vocabularies, label) {
  assertAnyArray(queries, label);
  const names = [];
  for (const [index, query] of queries.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(query, itemLabel);
    assertKeys(query, ["inputs", "name", "outputs", "surface"], [], itemLabel);
    assertToken(query.name, `${itemLabel}.name`);
    assertSurfaceRef(query.surface, surfaces, `${itemLabel}.surface`);
    validatePorts(query.inputs, vocabularies, `${itemLabel}.inputs`, { input: true });
    validatePorts(query.outputs, vocabularies, `${itemLabel}.outputs`, { input: false });
    names.push(query.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validatePorts(ports, vocabularies, label, options) {
  assertAnyArray(ports, label);
  const names = [];
  for (const [index, port] of ports.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertRecord(port, itemLabel);
    assertKeys(port, ["kind", "name"], options.input ? ["payload", "required"] : ["payload"], itemLabel);
    assertToken(port.kind, `${itemLabel}.kind`);
    assertToken(port.name, `${itemLabel}.name`);
    if (options.input && "required" in port && typeof port.required !== "boolean") {
      throw new Error(`${itemLabel}.required must be a boolean`);
    }
    if ("payload" in port) {
      assertPayloadRef(port.payload, vocabularies, `${itemLabel}.payload`);
    }
    names.push(port.name);
  }
  assertSortedUnique(names, `${label}.name`);
}

function validateProof(proof, label) {
  assertRecord(proof, label);
  assertKeys(proof, ["commands"], [], label);
  assertStringArray(proof.commands, `${label}.commands`);
  assertSortedUnique(proof.commands, `${label}.commands`);
}

function validateEffectList(effects, label) {
  assertTokenArray(effects, label);
}

function assertPayloadRef(value, vocabularies, label) {
  assertToken(value, label);
  if (!RESERVED_PAYLOADS.has(value) && !vocabularies.has(value)) {
    throw new Error(`${label} must be opaque or named in vocabularies`);
  }
}

function assertSurfaceRef(value, surfaces, label) {
  assertToken(value, label);
  if (!surfaces.has(value)) {
    throw new Error(`${label} must name a declared surface`);
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
    accepts: [
      {
        kind: "intent",
        name: "projection.intent",
        payload: "projection.intent.v1",
        surface: "ingest"
      }
    ],
    capabilities: [
      {
        effects: ["filesystem.read"],
        inputs: [],
        mode: "read",
        name: "projection.inspect",
        outputs: [
          {
            kind: "projection-interface",
            name: "manifest",
            payload: "projection.interface.v1"
          }
        ],
        surface: "verify"
      }
    ],
    context: {
      scope: "portable",
      tags: ["verification"]
    },
    effects: ["filesystem.read"],
    emits: [],
    kind: INTEROP_INTERFACE_KIND,
    projection: {
      anchor: {
        commitment: `sha256:${"a".repeat(64)}`,
        kind: "origin"
      },
      ref: "sample-projection"
    },
    proof: {
      commands: ["node projection-root/kit/interop/interface/verify.mjs interop/interfaces/current.json"]
    },
    queries: [],
    resources: [],
    streams: [],
    surfaces: [
      {
        kind: "command",
        name: "ingest",
        ref: "interop/intents"
      },
      {
        kind: "command",
        name: "verify",
        ref: "verify/run.mjs"
      }
    ],
    version: INTEROP_INTERFACE_VERSION,
    vocabularies: [
      {
        kind: "record",
        name: "projection.intent.v1",
        ref: "projection-root/kit/interop/ARCHITECTURE.md#intent"
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
    console.log("projection interop interface verifier self-test ok");
    return;
  }

  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    throw new Error("usage: node projection-root/kit/interop/interface/verify.mjs <manifest.json> [--json] | --self-test");
  }

  const manifest = await verifyInterfaceManifestFile(path.resolve(target));
  if (flags.has("--json")) {
    console.log(stableStringify(manifest));
    return;
  }

  console.log("projection interop interface manifest ok");
  console.log(`projection: ${manifest.projection.ref}`);
  console.log(`surfaces: ${manifest.surfaces.length}`);
  console.log(`capabilities: ${manifest.capabilities.length}`);
}

const mainPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (mainPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`projection interop interface: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
