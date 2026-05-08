import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ATOM_NUCLEUS_LENGTH = 48;
const ATOM_NUCLEUS_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${ATOM_NUCLEUS_LENGTH}}$`);
const ORIGIN_DIRECTORIES = ["atom", "molecule"];
const FRAMEWORK_RESERVED_BODY_REF_ROOTS = new Set([
  "projection-root",
  "projection-root/core",
  "projection-root/framework"
]);

export const ATOM_SEAL_FIELDS = ["nucleus"];
export const MOLECULE_SEAL_FIELDS = ["atoms", "constitution"];
export const BODY_REF_KINDS = ["single", "fleet"];
export const BODY_REF_SEAL_FIELDS = ["basis", "kind", "ref"];
export const BOUNDARY_SEAL_FIELDS = ["basis", "context", "projection", "rules"];
export const CLAIMS_SEAL_FIELDS = ["basis", "body-ref", "boundary"];

export async function verifyProjectionCore(root) {
  const origin = await verifyCoreOrigin(root);
  const bodyRef = await verifyBodyRef(path.join(root, "projection-root/core/body-ref"));
  const boundary = await verifyBoundary(path.join(root, "projection-root/core/boundary/current"));
  const claims = await verifyCurrentClaims(path.join(root, "projection-root/core/claims/current"));

  assertEqual(bodyRef.basis, origin.ref, "body ref basis");
  assertEqual(boundary.projection, origin.ref, "boundary projection");
  assertEqual(boundary.basis, origin.ref, "boundary basis");
  assertEqual(claims.basis, origin.ref, "current claims basis");
  assertEqual(claims.boundary, "projection-root/core/boundary/current", "current claims boundary");
  assertEqual(claims["body-ref"], "projection-root/core/body-ref", "current claims body ref");
  validateCurrentBoundaryPublicRefs(boundary.rulesValue, origin.ref);

  await assertOnlyDirectories(root, "projection-root/core", [
    path.basename(origin.ref),
    "body-ref",
    "boundary",
    "claims"
  ]);
  await assertOnlyDirectories(root, "projection-root/core/boundary", ["current"]);
  await assertOnlyDirectories(root, "projection-root/core/claims", ["current"]);

  return {
    origin,
    atom: origin.kind === "atom" ? origin : null,
    molecule: origin.kind === "molecule" ? origin : null,
    bodyRef,
    boundary,
    claims
  };
}

export async function verifyCoreOrigin(root) {
  const originDirectory = await readActiveOriginDirectory(root);

  if (originDirectory === "atom") {
    const atom = await verifyAtom(path.join(root, "projection-root/core/atom"));

    return {
      ...atom,
      kind: "atom",
      ref: "projection-root/core/atom",
      originCommitment: atom.seal,
      atomCommitments: [atom.seal]
    };
  }

  const molecule = await verifyMolecule(path.join(root, "projection-root/core/molecule"));

  return {
    ...molecule,
    kind: "molecule",
    ref: "projection-root/core/molecule",
    originCommitment: molecule.seal,
    atomCommitments: molecule.atomsList
  };
}

export async function verifyAtom(root) {
  const atom = await readCapsule(root, {
    label: "atom",
    files: ["nucleus", "seal"],
    sealFields: ATOM_SEAL_FIELDS
  });

  assertAtomNucleus(atom.nucleus, "atom nucleus");
  return atom;
}

export async function verifyMolecule(root) {
  const molecule = await readCapsule(root, {
    label: "molecule",
    files: ["atoms", "constitution", "seal"],
    sealFields: MOLECULE_SEAL_FIELDS
  });

  const atomsList = validateMoleculeAtoms(molecule.atoms);
  const constitution = validateMoleculeConstitution(molecule.constitution);

  return {
    ...molecule,
    atomsList,
    constitutionValue: constitution
  };
}

export async function verifyBodyRef(root) {
  const bodyRef = await readCapsule(root, {
    label: "body ref",
    files: ["basis", "kind", "ref", "seal"],
    sealFields: BODY_REF_SEAL_FIELDS
  });

  if (!BODY_REF_KINDS.includes(bodyRef.kind)) {
    throw new Error(`body ref kind must be one of: ${BODY_REF_KINDS.join(", ")}`);
  }

  assertBoundedRelativePath(bodyRef.ref, "body ref ref");
  return bodyRef;
}

export async function verifyBoundary(root) {
  const boundary = await readCapsule(root, {
    label: "boundary",
    files: ["basis", "context", "projection", "rules", "seal"],
    sealFields: BOUNDARY_SEAL_FIELDS
  });

  const rules = parseJson(boundary.rules, "boundary rules");

  if (!isPlainObject(rules)) {
    throw new Error("boundary rules must be a JSON object");
  }

  if (typeof rules.default !== "string" || !/^[a-z][a-z0-9.-]*$/.test(rules.default)) {
    throw new Error("boundary rules.default must be a lowercase token");
  }

  validateBoundaryPublicRules(rules);
  validateJsonValue(rules, "boundary rules");

  if (boundary.rules !== stableStringify(rules)) {
    throw new Error("boundary rules must be canonical JSON");
  }

  return {
    ...boundary,
    rulesValue: rules
  };
}

export async function verifyCurrentClaims(root) {
  return readCapsule(root, {
    label: "current claims",
    files: [
      "basis",
      "body-ref",
      "boundary",
      "seal"
    ],
    sealFields: CLAIMS_SEAL_FIELDS
  });
}

async function readActiveOriginDirectory(root) {
  const entries = await readdir(path.join(root, "projection-root/core"), { withFileTypes: true });
  const originDirectories = entries
    .filter((entry) => entry.isDirectory() && ORIGIN_DIRECTORIES.includes(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (originDirectories.length !== 1) {
    throw new Error(
      `projection core must contain exactly one origin capsule: ${ORIGIN_DIRECTORIES.join(" or ")}`
    );
  }

  return originDirectories[0];
}

async function readCapsule(root, schema) {
  await assertOnlyFiles(root, schema.files, schema.label);

  const values = {};

  for (const file of schema.files) {
    values[file] = await readValue(root, file, schema.label);
  }

  if (!SHA256_PATTERN.test(values.seal)) {
    throw new Error(`${schema.label} seal must be a sha256 commitment`);
  }

  assertEqual(values.seal, sealCapsuleValues(values, schema.sealFields), `${schema.label} seal`);
  return values;
}

export function sealCapsuleValues(values, fields) {
  const canonical = fields.map((field) => `${field}\n${values[field]}\n`).join("");
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

async function readValue(root, name, label) {
  const filePath = path.join(root, name);
  const text = await readFile(filePath, "utf8");

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

function assertOneLine(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  if (value.includes("\n") || value.includes("\t") || value.trim() !== value) {
    throw new Error(`${label} must contain exactly one trimmed line`);
  }
}

async function assertOnlyFiles(root, allowed, label) {
  const entries = await readdir(root, { withFileTypes: true });
  const actual = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error(`${label} capsule must contain only fixed files`);
    }

    actual.push(entry.name);
  }

  assertJsonList(actual.sort(), [...allowed].sort(), `${label} files`);
}

async function assertOnlyDirectories(root, directory, allowed) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const actual = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      throw new Error(`${directory} must contain only capsule directories`);
    }

    actual.push(entry.name);
  }

  assertJsonList(actual.sort(), [...allowed].sort(), `${directory} directories`);
}

function validateMoleculeAtoms(text) {
  const atoms = parseJson(text, "molecule atoms");

  if (!Array.isArray(atoms)) {
    throw new Error("molecule atoms must be a JSON array");
  }

  if (atoms.length < 2) {
    throw new Error("molecule must contain at least two atom commitments");
  }

  const seen = new Set();

  for (const [index, atom] of atoms.entries()) {
    if (typeof atom !== "string" || !SHA256_PATTERN.test(atom)) {
      throw new Error(`molecule atoms[${index}] must be a sha256 commitment`);
    }

    if (seen.has(atom)) {
      throw new Error("molecule atoms must not contain duplicates");
    }

    seen.add(atom);
  }

  if (JSON.stringify(atoms) !== JSON.stringify([...atoms].sort())) {
    throw new Error("molecule atoms must be sorted");
  }

  if (text !== stableStringify(atoms)) {
    throw new Error("molecule atoms must be canonical JSON");
  }

  return atoms;
}

function validateMoleculeConstitution(text) {
  const constitution = parseJson(text, "molecule constitution");

  if (!isPlainObject(constitution)) {
    throw new Error("molecule constitution must be a JSON object");
  }

  if (typeof constitution.rule !== "string" || !/^[a-z][a-z0-9.-]*$/.test(constitution.rule)) {
    throw new Error("molecule constitution rule must be a lowercase token");
  }

  if (!isPlainObject(constitution.parameters)) {
    throw new Error("molecule constitution parameters must be a JSON object");
  }

  if (Object.prototype.hasOwnProperty.call(constitution, "abi")) {
    throw new Error("molecule constitution must not contain an abi marker");
  }

  validateJsonValue(constitution, "molecule constitution");

  if (text !== stableStringify(constitution)) {
    throw new Error("molecule constitution must be canonical JSON");
  }

  return constitution;
}

function validateBoundaryPublicRules(rules) {
  if (!Object.prototype.hasOwnProperty.call(rules, "public")) {
    return;
  }

  if (!Array.isArray(rules.public)) {
    throw new Error("boundary rules.public must be a JSON array");
  }

  const seen = new Set();

  for (const [index, ref] of rules.public.entries()) {
    assertBoundedReferencePath(ref, `boundary rules.public[${index}]`);

    if (seen.has(ref)) {
      throw new Error("boundary rules.public must not contain duplicates");
    }

    seen.add(ref);
  }
}

function validateCurrentBoundaryPublicRefs(rules, originRef) {
  if (!Object.prototype.hasOwnProperty.call(rules, "public")) {
    return;
  }

  const currentCoreRefs = new Set([
    originRef,
    "projection-root/core/claims/current",
    "projection-root/core/boundary/current",
    "projection-root/core/body-ref"
  ]);

  for (const [index, ref] of rules.public.entries()) {
    if (!currentCoreRefs.has(ref)) {
      throw new Error(
        `boundary rules.public[${index}] must expose only current projection-core declarations`
      );
    }
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function validateJsonValue(value, label) {
  if (value === null || typeof value === "boolean") {
    return;
  }

  if (typeof value === "string") {
    assertOneLine(value, label);
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} numbers must be finite`);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateJsonValue(item, `${label}[${index}]`);
    }

    return;
  }

  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertOneLine(key, `${label} object key`);
      validateJsonValue(item, `${label}.${key}`);
    }

    return;
  }

  throw new Error(`${label} must be JSON-compatible`);
}

function assertAtomNucleus(value, label) {
  if (typeof value !== "string" || !ATOM_NUCLEUS_PATTERN.test(value)) {
    throw new Error(`${label} must be an opaque ${ATOM_NUCLEUS_LENGTH}-character token`);
  }
}

function assertBoundedRelativePath(value, label) {
  const segments = assertBoundedReferencePath(value, label);

  if (FRAMEWORK_RESERVED_BODY_REF_ROOTS.has(segments[0])) {
    throw new Error(`${label} must not point inside a framework-reserved root`);
  }
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

  return segments;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertJsonList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
