#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const FORBIDDEN_KIT_ARTIFACTS = [
  "projection-root/kit/toolchain/typescript/reference",
  "projection-root/kit/toolchain/typescript/package.json",
  "projection-root/kit/toolchain/typescript/package-lock.json",
  "projection-root/kit/toolchain/typescript/src",
  "projection-root/kit/toolchain/typescript/templates",
  "projection-root/kit/toolchain/typescript/tsconfig.json"
];

export async function checkTypeScriptToolchain(capsuleRoot = root) {
  const manifest = await readCanonicalJson(capsuleRoot, "projection-root/kit/toolchain/typescript/manifest.json");
  checkManifest(manifest);
  await checkNoKitImplementationWeight(capsuleRoot);
}

export async function runSelfTest(capsuleRoot = root) {
  await checkTypeScriptToolchain(capsuleRoot);
}

function checkManifest(manifest) {
  assertObject(manifest, "typescript toolchain manifest");
  assertKeys(manifest, [
    "bodyImplementationIsReplaceable",
    "consumerSupportRequired",
    "contract",
    "kind",
    "language",
    "materializationCatalog",
    "materializationOwner",
    "packageArtifactsInKit",
    "rootTruth",
    "sourceArtifactsInKit",
    "status",
    "templateArtifactsInKit",
    "toolchainMayMutateRoot",
    "toolchainOwnsRootTruth",
    "typescriptChannel",
    "version"
  ], "typescript toolchain manifest");
  assertEqual(manifest.kind, "projection-kit/toolchain/typescript", "typescript toolchain manifest.kind");
  assertEqual(manifest.contract, "projection-kit:toolchain-typescript-v1", "typescript toolchain manifest.contract");
  assertEqual(manifest.version, 1, "typescript toolchain manifest.version");
  assertEqual(manifest.status, "default-toolchain-declaration", "typescript toolchain manifest.status");
  assertEqual(manifest.language, "TypeScript", "typescript toolchain manifest.language");
  assertEqual(manifest.typescriptChannel, "7-native-preview-beta", "typescript toolchain manifest.typescriptChannel");
  assertEqual(manifest.materializationCatalog, "projection-root/kit/materialization/catalog.json", "typescript toolchain manifest.materializationCatalog");
  assertEqual(manifest.materializationOwner, "capsule-generator", "typescript toolchain manifest.materializationOwner");
  assertEqual(manifest.rootTruth, "plain-declarations", "typescript toolchain manifest.rootTruth");
  assertEqual(manifest.toolchainOwnsRootTruth, false, "typescript toolchain manifest.toolchainOwnsRootTruth");
  assertEqual(manifest.toolchainMayMutateRoot, false, "typescript toolchain manifest.toolchainMayMutateRoot");
  assertEqual(manifest.consumerSupportRequired, false, "typescript toolchain manifest.consumerSupportRequired");
  assertEqual(manifest.bodyImplementationIsReplaceable, true, "typescript toolchain manifest.bodyImplementationIsReplaceable");
  assertEqual(manifest.packageArtifactsInKit, false, "typescript toolchain manifest.packageArtifactsInKit");
  assertEqual(manifest.sourceArtifactsInKit, false, "typescript toolchain manifest.sourceArtifactsInKit");
  assertEqual(manifest.templateArtifactsInKit, false, "typescript toolchain manifest.templateArtifactsInKit");
}

async function checkNoKitImplementationWeight(capsuleRoot) {
  for (const relativePath of FORBIDDEN_KIT_ARTIFACTS) {
    await assertMissing(capsuleRoot, relativePath);
  }
}

async function readCanonicalJson(capsuleRoot, relativePath) {
  const text = await readFile(path.join(capsuleRoot, relativePath), "utf8");
  const value = parseJson(text, relativePath);
  if (text !== `${stableStringify(value)}\n`) {
    throw new Error(`${relativePath} must be canonical JSON`);
  }
  return value;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

async function assertMissing(capsuleRoot, relativePath) {
  try {
    await stat(path.join(capsuleRoot, relativePath));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(`${relativePath} must not be materialized into root kit`);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
}

function assertKeys(value, expected, label) {
  assertJsonEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  checkTypeScriptToolchain(root).then(
    () => console.log("projection kit toolchain typescript ok"),
    (error) => {
      console.error(`[toolchain:typescript] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  );
}
