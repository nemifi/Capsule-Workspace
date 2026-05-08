import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  sealCapsuleValues,
  verifyProjectionCore
} from "../../framework/verify/core-capsules.mjs";

const POLICY_ORIGIN_WITNESS_PATH = "projection-root/policy/origin-witness";
const POLICY_ORIGIN_WITNESS_FILES = ["commitment", "ref", "seal"];
const POLICY_ORIGIN_WITNESS_SEAL_FIELDS = ["commitment", "ref"];
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export async function verifyPolicyOrigin(root) {
  const core = await verifyProjectionCore(root);
  const witness = await readPolicyOriginWitness(root);

  assertPolicyOrigin(core.origin, witness);
  return core;
}

async function readPolicyOriginWitness(root) {
  const witnessRoot = path.join(root, POLICY_ORIGIN_WITNESS_PATH);

  await assertOnlyFiles(witnessRoot, POLICY_ORIGIN_WITNESS_FILES, "policy origin witness");

  const values = {};
  for (const file of POLICY_ORIGIN_WITNESS_FILES) {
    values[file] = await readValue(witnessRoot, file, "policy origin witness");
  }

  if (!SHA256_PATTERN.test(values.commitment)) {
    throw new Error("policy origin witness commitment must be a sha256 commitment");
  }

  if (!SHA256_PATTERN.test(values.seal)) {
    throw new Error("policy origin witness seal must be a sha256 commitment");
  }

  assertBoundedReferencePath(values.ref, "policy origin witness ref");

  const expectedSeal = sealCapsuleValues(values, POLICY_ORIGIN_WITNESS_SEAL_FIELDS);
  if (values.seal !== expectedSeal) {
    throw new Error("policy origin witness seal does not match its declared values");
  }

  return values;
}

function assertPolicyOrigin(origin, witness) {
  if (
    origin.ref !== witness.ref ||
    origin.originCommitment !== witness.commitment
  ) {
    throw new Error(
      "active origin does not match this projection's origin witness; this is a different projection claim"
    );
  }
}

async function assertOnlyFiles(root, allowed, label) {
  const entries = await readdir(root, { withFileTypes: true });
  const actual = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error(`${label} must contain only fixed files`);
    }

    actual.push(entry.name);
  }

  assertJsonList(actual.sort(), [...allowed].sort(), `${label} files`);
}

async function readValue(root, name, label) {
  const text = await readFile(path.join(root, name), "utf8");

  if (!text.endsWith("\n")) {
    throw new Error(`${label} ${name} must end with one LF`);
  }

  if (text.includes("\r")) {
    throw new Error(`${label} ${name} must use LF line endings`);
  }

  const value = text.slice(0, -1);
  assertOneLine(value, `${label} ${name}`);
  return value;
}

function assertBoundedReferencePath(value, label) {
  if (typeof value !== "string" || path.isAbsolute(value) || value.includes("\\") || value.includes("//")) {
    throw new Error(`${label} must be a bounded relative path`);
  }

  const segments = value.split("/");

  for (const segment of segments) {
    if (
      segment === "." ||
      segment === ".." ||
      segment.startsWith(".") ||
      !/^[A-Za-z0-9._-]+$/.test(segment)
    ) {
      throw new Error(`${label} must be a bounded relative path`);
    }
  }
}

function assertOneLine(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  if (value.includes("\n") || value.includes("\t") || value.trim() !== value) {
    throw new Error(`${label} must contain exactly one trimmed line`);
  }
}

function assertJsonList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
