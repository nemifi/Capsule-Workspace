#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalogPath = "projection-root/kit/materialization/catalog.json";
const MATERIALIZATION_OWNER = "capsule-generator";
const PROFILE_NAMES = ["agent", "app", "capsule-default", "library", "proof-only"];
const FEATURE_NAMES = ["agent-runtime", "browser-ui", "cli", "typescript", "verifier"];
const TOOLCHAIN_NAMES = ["typescript"];

export async function checkMaterializationKit(capsuleRoot = root) {
  await assertOnlyEntries(capsuleRoot, "projection-root/kit/materialization", ["catalog.json", "verify.mjs"]);
  const catalog = await readCanonicalJson(capsuleRoot, catalogPath);
  checkCatalog(catalog);
}

export async function runSelfTest(capsuleRoot = root) {
  await checkMaterializationKit(capsuleRoot);
}

function checkCatalog(catalog) {
  assertObject(catalog, catalogPath);
  assertKeys(catalog, [
    "contract",
    "defaultProfile",
    "featureContracts",
    "generator",
    "kind",
    "profiles",
    "toolchainDeclarations",
    "version"
  ], catalogPath);
  assertEqual(catalog.kind, "projection-kit/materialization-catalog", "materialization catalog.kind");
  assertEqual(catalog.contract, "projection-kit:materialization-catalog-v1", "materialization catalog.contract");
  assertEqual(catalog.version, 1, "materialization catalog.version");
  assertEqual(catalog.defaultProfile, "capsule-default", "materialization catalog.defaultProfile");

  assertObject(catalog.generator, "materialization catalog.generator");
  assertKeys(catalog.generator, ["materializationOwner", "mustNotLiveInRoot", "receiptRequired"], "materialization catalog.generator");
  assertEqual(catalog.generator.materializationOwner, MATERIALIZATION_OWNER, "materialization catalog.generator.materializationOwner");
  assertEqual(catalog.generator.receiptRequired, true, "materialization catalog.generator.receiptRequired");
  assertJsonEqual(catalog.generator.mustNotLiveInRoot, ["framework-packages", "runtime-dependencies", "source-trees", "template-trees"], "materialization catalog.generator.mustNotLiveInRoot");

  assertArray(catalog.profiles, "materialization catalog.profiles");
  assertJsonEqual(catalog.profiles.map((profile) => profile.name).sort(), PROFILE_NAMES, "materialization catalog profile names");
  for (const profile of catalog.profiles) {
    checkProfile(profile);
  }

  assertArray(catalog.featureContracts, "materialization catalog.featureContracts");
  assertJsonEqual(catalog.featureContracts.map((feature) => feature.name).sort(), FEATURE_NAMES, "materialization catalog feature names");
  for (const feature of catalog.featureContracts) {
    checkFeature(feature);
  }

  assertArray(catalog.toolchainDeclarations, "materialization catalog.toolchainDeclarations");
  assertJsonEqual(catalog.toolchainDeclarations.map((toolchain) => toolchain.name).sort(), TOOLCHAIN_NAMES, "materialization catalog toolchain names");
  for (const toolchain of catalog.toolchainDeclarations) {
    checkToolchainDeclaration(toolchain);
  }
}

function checkProfile(profile) {
  assertObject(profile, `materialization profile ${profile?.name ?? "<unknown>"}`);
  assertKeys(profile, ["description", "features", "name", "toolchain"], `materialization profile ${profile.name}`);
  assertTrimmedString(profile.description, `materialization profile ${profile.name}.description`);
  if (!PROFILE_NAMES.includes(profile.name)) {
    throw new Error(`materialization profile ${profile.name} is not a known profile`);
  }
  assertArray(profile.features, `materialization profile ${profile.name}.features`);
  if (profile.features.length === 0) {
    throw new Error(`materialization profile ${profile.name}.features must not be empty`);
  }
  assertSortedUnique(profile.features, `materialization profile ${profile.name}.features`);
  for (const feature of profile.features) {
    if (!FEATURE_NAMES.includes(feature)) {
      throw new Error(`materialization profile ${profile.name}.features includes unknown feature ${JSON.stringify(feature)}`);
    }
  }
  assertEqual(profile.toolchain, "typescript", `materialization profile ${profile.name}.toolchain`);
}

function checkFeature(feature) {
  assertObject(feature, `materialization feature ${feature?.name ?? "<unknown>"}`);
  assertKeys(feature, [
    "materializesInto",
    "name",
    "packageArtifactsInKit",
    "rootMutationAllowed",
    "sourceArtifactsInKit",
    "templateArtifactsInKit"
  ], `materialization feature ${feature.name}`);
  if (!FEATURE_NAMES.includes(feature.name)) {
    throw new Error(`materialization feature ${feature.name} is not known`);
  }
  assertJsonEqual(feature.materializesInto, ["body", "projection-support"], `materialization feature ${feature.name}.materializesInto`);
  assertEqual(feature.packageArtifactsInKit, false, `materialization feature ${feature.name}.packageArtifactsInKit`);
  assertEqual(feature.sourceArtifactsInKit, false, `materialization feature ${feature.name}.sourceArtifactsInKit`);
  assertEqual(feature.templateArtifactsInKit, false, `materialization feature ${feature.name}.templateArtifactsInKit`);
  assertEqual(feature.rootMutationAllowed, false, `materialization feature ${feature.name}.rootMutationAllowed`);
}

function checkToolchainDeclaration(toolchain) {
  assertObject(toolchain, `materialization toolchain ${toolchain?.name ?? "<unknown>"}`);
  assertKeys(toolchain, ["channel", "default", "feature", "language", "name"], `materialization toolchain ${toolchain.name}`);
  assertEqual(toolchain.name, "typescript", "materialization toolchain.name");
  assertEqual(toolchain.feature, "typescript", "materialization toolchain.feature");
  assertEqual(toolchain.language, "TypeScript", "materialization toolchain.language");
  assertEqual(toolchain.channel, "7-native-preview-beta", "materialization toolchain.channel");
  assertEqual(toolchain.default, true, "materialization toolchain.default");
}

async function readCanonicalJson(capsuleRoot, relativePath) {
  const text = await readFile(path.join(capsuleRoot, relativePath), "utf8");
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${relativePath} must be valid JSON: ${error.message}`);
  }
  if (text !== `${stableStringify(value)}\n`) {
    throw new Error(`${relativePath} must be canonical JSON`);
  }
  return value;
}

async function assertOnlyEntries(capsuleRoot, relativePath, expected) {
  const entries = await readdir(path.join(capsuleRoot, relativePath), { withFileTypes: true });
  const actual = entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  assertJsonEqual(actual, [...expected].sort(), `${relativePath} entries`);
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    await stat(path.join(capsuleRoot, relativePath, entry.name));
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
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

function assertSortedUnique(values, label) {
  assertJsonEqual(values, [...new Set(values)].sort(), label);
}

function assertTrimmedString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  checkMaterializationKit(root).then(
    () => console.log("projection kit materialization ok"),
    (error) => {
      console.error(`[materialization] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  );
}
