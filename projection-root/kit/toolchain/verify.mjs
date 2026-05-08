#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkTypeScriptToolchain } from "./typescript/verify.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TOOLCHAIN_FAMILIES = ["typescript"];

export async function checkToolchainKit(capsuleRoot = root) {
  const manifest = await readCanonicalJson(capsuleRoot, "projection-root/kit/toolchain/manifest.json");
  assertObject(manifest, "projection-root/kit/toolchain/manifest.json");
  assertKeys(manifest, ["contract", "families", "kind", "version"], "projection-root/kit/toolchain/manifest.json");
  assertEqual(manifest.kind, "projection-kit/toolchain-manifest", "toolchain manifest.kind");
  assertEqual(manifest.contract, "projection-kit:toolchain-manifest-v1", "toolchain manifest.contract");
  assertEqual(manifest.version, 1, "toolchain manifest.version");
  assertArray(manifest.families, "toolchain manifest.families");
  assertJsonEqual(manifest.families.map((family) => family.name), TOOLCHAIN_FAMILIES, "toolchain manifest family names");
  for (const family of manifest.families) {
    assertObject(family, `toolchain manifest family ${family.name}`);
    assertKeys(family, ["manifest", "name", "verifier"], `toolchain manifest family ${family.name}`);
    assertEqual(family.manifest, `projection-root/kit/toolchain/${family.name}/manifest.json`, `toolchain manifest ${family.name}.manifest`);
    assertEqual(family.verifier, `projection-root/kit/toolchain/${family.name}/verify.mjs`, `toolchain manifest ${family.name}.verifier`);
  }
  await checkTypeScriptToolchain(capsuleRoot);
}

export async function runSelfTest(capsuleRoot = root) {
  await checkToolchainKit(capsuleRoot);
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

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  checkToolchainKit(root).then(
    () => console.log("projection kit toolchain ok"),
    (error) => {
      console.error(`[toolchain] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  );
}
