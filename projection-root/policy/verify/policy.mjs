import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  readConceptRecords,
  verifyConceptRecords
} from "../../framework/verify/concepts.mjs";
import {
  ATOM_SEAL_FIELDS,
  BODY_REF_SEAL_FIELDS,
  sealCapsuleValues,
  verifyProjectionCore
} from "../../framework/verify/core-capsules.mjs";
import { checkProjectionFramework } from "../../framework/verify/framework.mjs";
import {
  assertRejects,
  replaceText,
  withProofCopy
} from "../../framework/verify/proof-utils.mjs";
import { checkRootAgentRules } from "./root-agents.mjs";
import { checkRootKit } from "./root-kit.mjs";
import { checkRootPolicy } from "./root-policy.mjs";
import { checkRootProjection } from "./root-projection.mjs";
import { checkRootReadme } from "./root-readme.mjs";
import { verifyPolicyOrigin } from "./origin.mjs";

const POLICY_RESERVED_ROOT_ENTRIES = new Set([
  ".gitignore",
  "AGENTS.md",
  "PROJECTION.md",
  "README.md",
  "apps",
  "body",
  "docs",
  "node_modules",
  "package-lock.json",
  "package.json",
  "packages",
  "projection-support",
  "projection-root",
  "projection-root/core",
  "projection-root/framework",
  "projection-root/kit",
  "projection-root/policy",
  "projection-system",
  "projection-tools",
  "tools",
  "tsconfig.base.json",
  "tsconfig.json",
  "verify"
]);
const PROJECTION_SUPPORT_ROOT = "projection-support";
const POLICY_ORIGIN_PROOF_NUCLEUS = "policyOriginProofNucleus000000000000000000000000";
const TAMPERED_POLICY_ORIGIN_COMMITMENT =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000";
const ROOT_SURGERY_ENV = "PROJECTION_ROOT_SURGERY";
const ROOT_OPERATION_ENV = "PROJECTION_ROOT_OPERATION";
const ROOT_OPERATION_KIND = "projection-root/operation";
const ROOT_OPERATION_VERSION = 1;
const ROOT_OPERATION_KINDS = new Set([
  "base-adoption-apply",
  "base-seed-authoring",
  "base-seed-proposal",
  "consumer-root-surgery"
]);
const ORIGIN_MATERIAL_PATHS = [
  "projection-root/core/atom",
  "projection-root/core/molecule",
  "projection-root/policy/origin-witness"
];
const PROJECTION_OWNED_ROOTS = [
  "README.md",
  "projection-root/core",
  "projection-root/policy/origin-witness",
  PROJECTION_SUPPORT_ROOT
];
const REQUIRED_PROTECTED_KIT_PATHS = [
  "projection-root/kit",
  "projection-root/kit/ARCHITECTURE.md",
  "projection-root/kit/CONCEPTS.md",
  "projection-root/kit/interop",
  "projection-root/kit/interop/ADOPTION.md",
  "projection-root/kit/interop/ARCHITECTURE.md",
  "projection-root/kit/interop/manifest.json",
  "projection-root/kit/interop/adapter",
  "projection-root/kit/interop/adapter/verify.mjs",
  "projection-root/kit/interop/compatibility",
  "projection-root/kit/interop/compatibility/verify.mjs",
  "projection-root/kit/interop/evidence",
  "projection-root/kit/interop/evidence/verify.mjs",
  "projection-root/kit/interop/guard",
  "projection-root/kit/interop/guard/verify.mjs",
  "projection-root/kit/interop/index",
  "projection-root/kit/interop/index/verify.mjs",
  "projection-root/kit/interop/interface",
  "projection-root/kit/interop/interface/verify.mjs",
  "projection-root/kit/interop/intent",
  "projection-root/kit/interop/intent/verify.mjs",
  "projection-root/kit/interop/proposal",
  "projection-root/kit/interop/proposal/verify.mjs",
  "projection-root/kit/interop/relation",
  "projection-root/kit/interop/relation/verify.mjs",
  "projection-root/kit/interop/session",
  "projection-root/kit/interop/session/verify.mjs"
];
const REQUIRED_POLICY_PATHS = [
  "projection-root/policy",
  "projection-root/policy/ARCHITECTURE.md",
  "projection-root/policy/seed-manifest.json",
  "projection-root/policy/origin-witness",
  "projection-root/policy/origin-witness/commitment",
  "projection-root/policy/origin-witness/ref",
  "projection-root/policy/origin-witness/seal",
  "projection-root/policy/verify/run.mjs",
  "projection-root/policy/verify/policy.mjs",
  "projection-root/policy/verify/origin.mjs",
  "projection-root/policy/verify/root-doc.mjs",
  "projection-root/policy/verify/root-agents.mjs",
  "projection-root/policy/verify/root-kit.mjs",
  "projection-root/policy/verify/root-policy.mjs",
  "projection-root/policy/verify/root-projection.mjs",
  "projection-root/policy/verify/root-readme.mjs",
  ...REQUIRED_PROTECTED_KIT_PATHS,
  "AGENTS.md",
  "PROJECTION.md",
  "README.md",
  ".gitignore",
  "projection-support",
  "projection-support/README.md"
];
const FORBIDDEN_POLICY_PATHS = [
  "ARCHITECTURE.md",
  "docs",
  "tools",
  "projection-tools",
  "projection-system",
  "body",
  "packages",
  "apps",
  "verify",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "node_modules"
];
const ALLOWED_POLICY_ROOT_ENTRIES = [
  ".gitignore",
  "AGENTS.md",
  "PROJECTION.md",
  "README.md",
  "projection-support",
  "projection-root"
];
const ALLOWED_POLICY_DIRECTORY_ENTRIES = [
  ["projection-root", ["core", "framework", "kit", "policy"]],
  ["projection-root/policy", ["ARCHITECTURE.md", "origin-witness", "seed-manifest.json", "verify"]],
  ["projection-root/policy/origin-witness", ["commitment", "ref", "seal"]],
  ["projection-root/kit", ["ARCHITECTURE.md", "CONCEPTS.md", "interop"]],
  ["projection-root/kit/interop", ["ADOPTION.md", "ARCHITECTURE.md", "manifest.json", "adapter", "compatibility", "evidence", "guard", "index", "interface", "intent", "proposal", "relation", "session"]],
  ["projection-root/kit/interop/adapter", ["verify.mjs"]],
  ["projection-root/kit/interop/compatibility", ["verify.mjs"]],
  ["projection-root/kit/interop/evidence", ["verify.mjs"]],
  ["projection-root/kit/interop/guard", ["verify.mjs"]],
  ["projection-root/kit/interop/index", ["verify.mjs"]],
  ["projection-root/kit/interop/interface", ["verify.mjs"]],
  ["projection-root/kit/interop/intent", ["verify.mjs"]],
  ["projection-root/kit/interop/proposal", ["verify.mjs"]],
  ["projection-root/kit/interop/relation", ["verify.mjs"]],
  ["projection-root/kit/interop/session", ["verify.mjs"]]
];
const REQUIRED_KIT_CONCEPTS = [
  "projection-kit:capability",
  "projection-kit:context",
  "projection-kit:event",
  "projection-kit:interpretation",
  "projection-kit:interop-adapter",
  "projection-kit:interop-compatibility",
  "projection-kit:interop-evidence",
  "projection-kit:interop-fabric",
  "projection-kit:interop-guard",
  "projection-kit:interop-index",
  "projection-kit:interop-interface",
  "projection-kit:interop-intent",
  "projection-kit:interop-proposal",
  "projection-kit:interop-relation",
  "projection-kit:interop-session",
  "projection-kit:lineage",
  "projection-kit:migration",
  "projection-kit:namespace",
  "projection-kit:payload",
  "projection-kit:schema",
  "projection-kit:surface",
  "projection-kit:surface-manifest"
];
export async function checkProjectionPolicy(root) {
  const core = await verifyProjectionCore(root);

  await assertPolicyBodyRef(root, core.bodyRef);
  const ignoredRootEntries = await bodyRefIgnoredRootEntries(root, core.bodyRef);
  const rootOperation = await readRootOperation(root);
  await checkPolicyBodyRefRejectsNestedPath(root, core);
  await checkPolicyBodyRefRejectsRootFleetManifest(root, core);
  await checkPolicyBodyRefRejectsFleetOwnedRootSupport(root, core);
  await checkProjectionFramework(root);
  await verifyPolicyOrigin(root);
  checkOriginMaterialDiffGuard(root);
  await checkDefaultMutableAreaDiffGuard(root, core, ignoredRootEntries, rootOperation);
  await checkOriginWitnessRejectsTamperedData(root, core);
  await checkOriginWitnessRejectsChangedOrigin(root, core);

  await requirePaths(root, REQUIRED_POLICY_PATHS);
  await checkSeedBoundaryManifest(root, core);
  await forbidPaths(root, FORBIDDEN_POLICY_PATHS);

  await assertOnlyRootEntries(
    root,
    ALLOWED_POLICY_ROOT_ENTRIES,
    ignoredRootEntries
  );
  for (const [directory, allowed] of ALLOWED_POLICY_DIRECTORY_ENTRIES) {
    await assertOnlyEntries(root, directory, allowed);
  }
  await assertOnlyMjsFiles(root, "projection-root/policy/verify");

  await checkRootProjection(root);
  await checkRootPolicy(root);
  await checkRootKit(root);
  const frameworkConceptIds = (await readConceptRecords(root, "projection-root/framework/CONCEPTS.md"))
    .map((record) => record.id);
  await verifyKitConceptRecords(root, frameworkConceptIds);

  await checkPolicyRecordReferenceProofs(root, {
    frameworkConceptIds
  });
  checkDefaultMutableAreaGuardProofs();
  await checkRootAgentRules(root);
  await checkRootReadme(root);
  await checkRootDocumentContractProofs(root);

  return core;
}

async function checkPolicyBodyRefRejectsNestedPath(root, core) {
  await withProofCopy(root, "projection-policy-body-ref-proof", ["projection-root/core"], async (candidateRoot) => {
    await writeBodyRef(candidateRoot, core.bodyRef, `${core.bodyRef.ref}/nested`);

    await assertRejects(
      () => verifyPolicyBodyRef(candidateRoot),
      "nested body-ref policy proof",
      "body-ref"
    );
  });
}

async function checkPolicyBodyRefRejectsRootFleetManifest(root, core) {
  await withProofCopy(root, "projection-policy-body-ref-proof", ["projection-root/core"], async (candidateRoot) => {
    await writeBodyRef(candidateRoot, core.bodyRef, "fleet.json", "fleet");
    await writeFleetManifest(candidateRoot, "fleet.json", {
      body: {
        kind: "fleet"
      },
      kind: "projection-policy/fleet-proof",
      projections: [
        {
          path: "member",
          role: "member",
          verify: "body"
        }
      ],
      version: 1
    });

    await assertRejects(
      () => verifyPolicyBodyRef(candidateRoot),
      "root fleet manifest policy proof",
      "projection-support"
    );
  });
}

async function checkPolicyBodyRefRejectsFleetOwnedRootSupport(root, core) {
  await withProofCopy(root, "projection-policy-body-ref-proof", ["projection-root/core"], async (candidateRoot) => {
    const ref = `${PROJECTION_SUPPORT_ROOT}/fleet.json`;
    await writeBodyRef(candidateRoot, core.bodyRef, ref, "fleet");
    await writeFleetManifest(candidateRoot, ref, {
      body: {
        kind: "fleet",
        ownedPaths: ["doctor.mjs"]
      },
      kind: "projection-policy/fleet-proof",
      projections: [
        {
          path: "member",
          role: "member",
          verify: "body"
        }
      ],
      version: 1
    });

    await assertRejects(
      () => verifyPolicyBodyRef(candidateRoot),
      "fleet owned root support policy proof",
      "body.ownedPaths must be empty"
    );
  });
}

async function verifyPolicyBodyRef(root) {
  const core = await verifyProjectionCore(root);

  await assertPolicyBodyRef(root, core.bodyRef);
}

function checkOriginMaterialDiffGuard(root) {
  if (process.env[ROOT_SURGERY_ENV] === "1") {
    return;
  }

  if (!isGitWorktree(root)) {
    return;
  }

  const changed = gitChangedPaths(root, ORIGIN_MATERIAL_PATHS);
  if (changed.length > 0) {
    throw new Error(
      `origin material changed; this is root surgery or a different projection claim: ${changed.join(", ")}. Set ${ROOT_SURGERY_ENV}=1 only for explicit root surgery.`
    );
  }
}

async function checkDefaultMutableAreaDiffGuard(root, core, bodyRootEntries, rootOperation) {
  if (process.env[ROOT_SURGERY_ENV] === "1") {
    return;
  }

  if (!isGitWorktree(root)) {
    return;
  }

  const allowedRoots = defaultMutableRoots(bodyRootEntries);
  const changed = gitChangedPaths(root);
  const protectedChanges = changed.filter((changedPath) => !isInsideAnyRoot(changedPath, allowedRoots));

  if (rootOperation) {
    await verifyRootOperationAllowsChanges(root, core, bodyRootEntries, rootOperation, changed, protectedChanges);
    return;
  }

  if (protectedChanges.length > 0) {
    throw new Error(
      `protected root material changed during ordinary verification: ${protectedChanges.join(", ")}. Ordinary work must stay in the current body or projection-support, or be covered by a ${ROOT_OPERATION_ENV} artifact. Set ${ROOT_SURGERY_ENV}=1 only for explicit root surgery or body replacement.`
    );
  }
}

function checkDefaultMutableAreaGuardProofs() {
  const allowed = defaultMutableRoots(["body"]);
  const baseOperationAllowed = defaultMutableRoots(["capsule-base-body"], [
    "AGENTS.md",
    "PROJECTION.md",
    "projection-root/framework",
    "projection-root/kit",
    "projection-root/policy/ARCHITECTURE.md",
    "projection-root/policy/verify"
  ]);

  assertJsonList(
    pathsOutsideDefaultMutableArea(["body/src/app.js", "projection-support/doctor.mjs"], allowed),
    [],
    "default mutable area proof allows body and support"
  );
  assertJsonList(
    pathsOutsideDefaultMutableArea(["AGENTS.md", "projection-root/policy/verify/policy.mjs"], allowed),
    ["AGENTS.md", "projection-root/policy/verify/policy.mjs"],
    "default mutable area proof rejects root material"
  );
  assertJsonList(
    pathsOutsideDefaultMutableArea([
      "AGENTS.md",
      "projection-root/framework/ARCHITECTURE.md",
      "projection-root/policy/verify/policy.mjs"
    ], allowed),
    [
      "AGENTS.md",
      "projection-root/framework/ARCHITECTURE.md",
      "projection-root/policy/verify/policy.mjs"
    ],
    "default mutable area proof requires an operation for Capsule Base seed authoring"
  );
  assertJsonList(
    pathsOutsideDefaultMutableArea([
      "AGENTS.md",
      "projection-root/framework/ARCHITECTURE.md",
      "projection-root/policy/verify/policy.mjs"
    ], baseOperationAllowed),
    [],
    "default mutable area proof allows operation-covered Capsule Base seed authoring"
  );
  assertJsonList(
    pathsOutsideDefaultMutableArea([
      "README.md",
      "projection-root/core/body-ref/ref",
      "projection-root/policy/origin-witness/ref",
      "projection-support/doctor.mjs"
    ], baseOperationAllowed),
    [
      "README.md",
      "projection-root/core/body-ref/ref",
      "projection-root/policy/origin-witness/ref"
    ],
    "default mutable area proof keeps Capsule Base projection-owned paths closed"
  );
}

function isGitWorktree(root) {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    encoding: "utf8"
  });

  return result.status === 0 && result.stdout.trim() === "true";
}

function gitChangedPaths(root, paths = null) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git status failed for policy diff guard");
  }

  const changed = parseGitStatusPaths(result.stdout);
  return changed
    .filter((changedPath) => paths === null || isInsideAnyRoot(changedPath, paths))
    .sort();
}

function parseGitStatusPaths(output) {
  const fields = output.split("\0").filter(Boolean);
  const paths = [];

  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry.length < 4) {
      continue;
    }

    const status = entry.slice(0, 2);
    paths.push(entry.slice(3));
    if (status.includes("R") || status.includes("C")) {
      index += 1;
      if (fields[index]) {
        paths.push(fields[index]);
      }
    }
  }

  return [...new Set(paths)].sort();
}

function defaultMutableRoots(bodyRootEntries, extraRoots = []) {
  return uniqueRootEntries([...bodyRootEntries, PROJECTION_SUPPORT_ROOT, ...extraRoots]).sort();
}

function pathsOutsideDefaultMutableArea(paths, allowedRoots) {
  return paths.filter((changedPath) => !isInsideAnyRoot(changedPath, allowedRoots)).sort();
}

function isInsideAnyRoot(relativePath, roots) {
  return roots.some((rootEntry) => relativePath === rootEntry || relativePath.startsWith(`${rootEntry}/`));
}

async function readSeedBoundaryManifestValue(root) {
  const label = "projection-root/policy/seed-manifest.json";
  const text = await readFile(path.join(root, label), "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(label + " must be valid JSON: " + error.message);
  }
}

async function readRootOperation(root) {
  const operationPath = process.env[ROOT_OPERATION_ENV];
  if (!operationPath) {
    return null;
  }

  const absolutePath = path.isAbsolute(operationPath)
    ? operationPath
    : path.join(root, operationPath);
  const label = ROOT_OPERATION_ENV;
  const text = await readFile(absolutePath, "utf8");
  let operation;
  try {
    operation = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} artifact must be valid JSON: ${error.message}`);
  }
  if (text !== `${stableStringify(operation)}\n`) {
    throw new Error(`${label} artifact must be canonical JSON`);
  }
  verifyRootOperationShape(operation, label);
  if ((await canonicalRootPath(operation.targetRoot)) !== (await canonicalRootPath(root))) {
    throw new Error(`${label} targetRoot must match the verified projection root`);
  }
  return operation;
}

async function canonicalRootPath(value) {
  const absolute = path.resolve(value);
  try {
    return await realpath(absolute);
  } catch {
    return absolute;
  }
}

function verifyRootOperationShape(operation, label) {
  assertObject(operation, label);
  assertJsonList(
    Object.keys(operation).sort(),
    [
      "actorRoot",
      "forbiddenSet",
      "kind",
      "operation",
      "preconditions",
      "targetRole",
      "targetRoot",
      "version",
      "writeSet"
    ],
    `${label} keys`
  );
  assertEqual(operation.kind, ROOT_OPERATION_KIND, `${label}.kind`);
  assertEqual(operation.version, ROOT_OPERATION_VERSION, `${label}.version`);
  assertTrimmedString(operation.operation, `${label}.operation`);
  if (!ROOT_OPERATION_KINDS.has(operation.operation)) {
    throw new Error(`${label}.operation must be a known root operation`);
  }
  assertTrimmedString(operation.actorRoot, `${label}.actorRoot`);
  assertTrimmedString(operation.targetRoot, `${label}.targetRoot`);
  assertTrimmedString(operation.targetRole, `${label}.targetRole`);
  assertObject(operation.preconditions, `${label}.preconditions`);
  assertPortablePathList(operation.writeSet, `${label}.writeSet`);
  assertPortablePathList(operation.forbiddenSet, `${label}.forbiddenSet`);
}

async function verifyRootOperationAllowsChanges(root, core, bodyRootEntries, operation, changed, protectedChanges) {
  const forbiddenChanges = changed.filter((changedPath) => isInsideAnyRoot(changedPath, operation.forbiddenSet));
  if (forbiddenChanges.length > 0) {
    throw new Error(`root operation ${operation.operation} touches forbidden paths: ${forbiddenChanges.join(", ")}`);
  }

  const uncoveredChanges = protectedChanges.filter((changedPath) => !isInsideAnyRoot(changedPath, operation.writeSet));
  if (uncoveredChanges.length > 0) {
    throw new Error(`root operation ${operation.operation} does not cover protected changes: ${uncoveredChanges.join(", ")}`);
  }

  if (operation.operation === "base-adoption-apply") {
    await verifyBaseAdoptionApplyOperation(root, core, operation);
    return;
  }
  if (operation.operation === "base-seed-authoring") {
    await verifyBaseSeedAuthoringOperation(root, bodyRootEntries, operation);
    return;
  }
  if (operation.operation === "base-seed-proposal") {
    verifyBaseSeedProposalOperation(operation);
    return;
  }
  if (operation.operation === "consumer-root-surgery") {
    await verifyConsumerRootSurgeryOperation(root, core, operation);
    return;
  }
  throw new Error(`unsupported root operation: ${operation.operation}`);
}

async function verifyBaseAdoptionApplyOperation(root, core, operation) {
  if (core.bodyRef.kind === "fleet") {
    await verifyFleetBaseAdoptionApplyOperation(root, core, operation);
    return;
  }
  if (core.bodyRef.kind !== "single") {
    throw new Error("base-adoption-apply requires a single or fleet target body");
  }
  await verifySingleBaseAdoptionApplyOperation(root, core, operation);
}

async function verifySingleBaseAdoptionApplyOperation(root, core, operation) {
  const bodyPath = core.bodyRef.ref;
  const witnessPath = `${bodyPath}/adoptions/capsule-base/current.json`;
  const witness = await readOptionalJson(root, witnessPath);
  assertObject(witness, "capsule base adoption witness");
  assertEqual(witness.kind, "capsule-base/adoption", "capsule base adoption witness.kind");
  const role = await readOptionalSingleBodyRole(root, bodyPath) ?? witness.consumer?.kind;
  assertTrimmedString(role, "base-adoption-apply target role");
  if (role === "capsule-base") {
    throw new Error("base-adoption-apply must not target Capsule Base");
  }
  assertEqual(operation.targetRole, role, `${ROOT_OPERATION_ENV}.targetRole`);
  assertEqual(operation.preconditions.bodyPath, bodyPath, `${ROOT_OPERATION_ENV}.preconditions.bodyPath`);
  assertEqual(operation.preconditions.witnessPath, witnessPath, `${ROOT_OPERATION_ENV}.preconditions.witnessPath`);
  assertEqual(operation.preconditions.baseManifestCommitment, witness.base?.manifestCommitment, `${ROOT_OPERATION_ENV}.preconditions.baseManifestCommitment`);
  const allowedWriteSet = [...witness.scope.adoptedSystemPaths, witnessPath].sort();
  const outsideAdoption = operation.writeSet.filter((changedPath) => !isInsideAnyRoot(changedPath, allowedWriteSet));
  if (outsideAdoption.length > 0) {
    throw new Error(`base-adoption-apply writeSet must stay inside adopted system paths and witness: ${outsideAdoption.join(", ")}`);
  }
  assertNoProjectionOwnedWrites(operation.writeSet, "base-adoption-apply");
}

async function verifyFleetBaseAdoptionApplyOperation(root, core, operation) {
  const fleetManifest = await readOptionalJson(root, core.bodyRef.ref);
  assertObject(fleetManifest, "fleet body manifest");
  assertEqual(fleetManifest.body?.kind, "fleet", "fleet body manifest body.kind");
  assertTrimmedString(fleetManifest.kind, "fleet body manifest.kind");
  const witnessPath = `${PROJECTION_SUPPORT_ROOT}/adoptions/capsule-base/workspace.json`;
  const witness = await readOptionalJson(root, witnessPath);
  assertObject(witness, "capsule base fleet adoption witness");
  assertEqual(witness.kind, "capsule-base/adoption", "capsule base fleet adoption witness.kind");
  assertEqual(operation.targetRole, fleetManifest.kind, `${ROOT_OPERATION_ENV}.targetRole`);
  assertEqual(operation.preconditions.fleetManifestPath, core.bodyRef.ref, `${ROOT_OPERATION_ENV}.preconditions.fleetManifestPath`);
  assertEqual(operation.preconditions.witnessPath, witnessPath, `${ROOT_OPERATION_ENV}.preconditions.witnessPath`);
  assertEqual(operation.preconditions.baseManifestCommitment, witness.base?.manifestCommitment, `${ROOT_OPERATION_ENV}.preconditions.baseManifestCommitment`);
  const allowedWriteSet = [...witness.scope.adoptedSystemPaths, witnessPath].sort();
  const outsideAdoption = operation.writeSet.filter((changedPath) => !isInsideAnyRoot(changedPath, allowedWriteSet));
  if (outsideAdoption.length > 0) {
    throw new Error(`fleet base-adoption-apply writeSet must stay inside adopted system paths and workspace witness: ${outsideAdoption.join(", ")}`);
  }
  assertNoProjectionOwnedWrites(operation.writeSet, "fleet base-adoption-apply", [witnessPath]);
}

async function verifyBaseSeedAuthoringOperation(root, bodyRootEntries, operation) {
  if ((await canonicalRootPath(operation.actorRoot)) !== (await canonicalRootPath(operation.targetRoot))) {
    throw new Error("base-seed-authoring requires actorRoot to equal targetRoot");
  }
  const baseBodyEntry = await findCapsuleBaseBodyEntry(root, bodyRootEntries);
  if (!baseBodyEntry) {
    throw new Error("base-seed-authoring requires the current body role to be capsule-base");
  }
  assertEqual(operation.targetRole, "capsule-base", `${ROOT_OPERATION_ENV}.targetRole`);
  const seedManifest = await readSeedBoundaryManifestValue(root);
  assertJsonList(operation.writeSet, uniqueRootEntries(operation.writeSet).sort(), `${ROOT_OPERATION_ENV}.writeSet`);
  const outsideSeed = operation.writeSet.filter((changedPath) => !isInsideAnyRoot(changedPath, seedManifest.seedOwnedPaths));
  if (outsideSeed.length > 0) {
    throw new Error(`base-seed-authoring writeSet must stay inside seed-owned paths: ${outsideSeed.join(", ")}`);
  }
  assertNoProjectionOwnedWrites(operation.writeSet, "base-seed-authoring");
}

function verifyBaseSeedProposalOperation(operation) {
  if (operation.writeSet.length === 0) {
    throw new Error("base-seed-proposal writeSet must not be empty");
  }
  const outsideProposal = operation.writeSet.filter((changedPath) => !isInsideAnyRoot(changedPath, [`${PROJECTION_SUPPORT_ROOT}/proposals/base-seed`]));
  if (outsideProposal.length > 0) {
    throw new Error(`base-seed-proposal writeSet must stay under projection-support/proposals/base-seed: ${outsideProposal.join(", ")}`);
  }
}

async function verifyConsumerRootSurgeryOperation(root, core, operation) {
  if (core.bodyRef.kind === "single") {
    const role = await readSingleBodyRole(root, core.bodyRef.ref);
    if (role === "capsule-base") {
      throw new Error("consumer-root-surgery must not target Capsule Base");
    }
    assertEqual(operation.targetRole, role, `${ROOT_OPERATION_ENV}.targetRole`);
  } else {
    const bodyRef = await readOptionalJson(root, core.bodyRef.ref);
    assertEqual(operation.targetRole, bodyRef?.kind, `${ROOT_OPERATION_ENV}.targetRole`);
  }
  const originWrites = operation.writeSet.filter((changedPath) => isInsideAnyRoot(changedPath, ORIGIN_MATERIAL_PATHS));
  if (originWrites.length > 0) {
    throw new Error(`consumer-root-surgery writeSet must not include active origin material: ${originWrites.join(", ")}`);
  }
}

async function findCapsuleBaseBodyEntry(root, bodyRootEntries) {
  for (const bodyRootEntry of bodyRootEntries) {
    const capability = await readOptionalJson(root, `${bodyRootEntry}/capabilities/current.json`);
    if (
      capability?.kind === "capsule/capability-manifest" &&
      capability?.body?.path === bodyRootEntry &&
      capability?.body?.role === "capsule-base"
    ) {
      const release = await readOptionalJson(root, `${bodyRootEntry}/releases/current.json`);
      if (
        release?.kind === "capsule-base/release" &&
        release?.bundleContract === "capsule-base:projection-system-bundle-v1"
      ) {
        return bodyRootEntry;
      }
    }
  }
  return null;
}

async function readSingleBodyRole(root, bodyPath) {
  const capability = await readOptionalJson(root, `${bodyPath}/capabilities/current.json`);
  assertObject(capability, "capability manifest");
  assertEqual(capability.kind, "capsule/capability-manifest", "capability manifest.kind");
  assertEqual(capability.body?.path, bodyPath, "capability manifest body.path");
  assertTrimmedString(capability.body?.role, "capability manifest body.role");
  return capability.body.role;
}

async function readOptionalSingleBodyRole(root, bodyPath) {
  const capability = await readOptionalJson(root, `${bodyPath}/capabilities/current.json`);
  if (capability === null) {
    return null;
  }
  assertObject(capability, "capability manifest");
  assertEqual(capability.kind, "capsule/capability-manifest", "capability manifest.kind");
  assertEqual(capability.body?.path, bodyPath, "capability manifest body.path");
  assertTrimmedString(capability.body?.role, "capability manifest body.role");
  return capability.body.role;
}

function assertNoProjectionOwnedWrites(writeSet, label, allowedProjectionOwned = []) {
  const projectionOwned = writeSet.filter((changedPath) =>
    isInsideAnyRoot(changedPath, PROJECTION_OWNED_ROOTS) &&
    !isInsideAnyRoot(changedPath, allowedProjectionOwned)
  );
  if (projectionOwned.length > 0) {
    throw new Error(`${label} writeSet must not include projection-owned paths: ${projectionOwned.join(", ")}`);
  }
}

async function readOptionalJson(root, relativePath) {
  let text;
  try {
    text = await readFile(path.join(root, relativePath), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function checkOriginWitnessRejectsChangedOrigin(root, core) {
  if (core.origin.kind !== "atom") {
    return;
  }

  const changedAtom = {
    nucleus: POLICY_ORIGIN_PROOF_NUCLEUS
  };

  await withProofCopy(
    root,
    "projection-policy-origin-proof",
    ["projection-root/core", "projection-root/policy/origin-witness"],
    async (candidateRoot) => {
      await replaceText(
        candidateRoot,
        "projection-root/core/atom/nucleus",
        core.origin.nucleus,
        changedAtom.nucleus
      );
      await replaceText(
        candidateRoot,
        "projection-root/core/atom/seal",
        core.origin.seal,
        sealCapsuleValues(changedAtom, ATOM_SEAL_FIELDS)
      );

      await assertRejects(
        () => verifyPolicyOrigin(candidateRoot),
        "changed origin policy proof",
        "different projection claim"
      );
    }
  );
}

async function checkOriginWitnessRejectsTamperedData(root, core) {
  await withProofCopy(
    root,
    "projection-policy-origin-witness-proof",
    ["projection-root/core", "projection-root/policy/origin-witness"],
    async (candidateRoot) => {
      await replaceText(
        candidateRoot,
        "projection-root/policy/origin-witness/commitment",
        core.origin.originCommitment,
        TAMPERED_POLICY_ORIGIN_COMMITMENT
      );

      await assertRejects(
        () => verifyPolicyOrigin(candidateRoot),
        "tampered origin witness proof",
        "seal does not match"
      );
    }
  );
}

async function verifyKitConceptRecords(root, frameworkConceptIds) {
  return verifyConceptRecords(root, "projection-root/kit/CONCEPTS.md", {
    allowedDependencyPrefixes: ["projection-framework:", "projection-kit:"],
    knownDependencyIds: frameworkConceptIds,
    allowedStrengths: ["common-optional"],
    expectedIdPrefix: "projection-kit:",
    expectedLayer: "projection-kit",
    requiredIds: REQUIRED_KIT_CONCEPTS
  });
}

async function checkPolicyRecordReferenceProofs(root, ids) {
  const proofPaths = [
    "projection-root/framework/CONCEPTS.md",
    "projection-root/kit/CONCEPTS.md"
  ];

  await withProofCopy(root, "projection-policy-record-proof", proofPaths, async (candidateRoot) => {
    await replaceText(
      candidateRoot,
      "projection-root/kit/CONCEPTS.md",
      "projection-framework:relation,projection-kit:lineage",
      "projection-framework:relation,projection-kit:linage"
    );

    await assertRejects(
      () => verifyKitConceptRecords(candidateRoot, ids.frameworkConceptIds),
      "unknown kit concept dependency proof",
      "unknown reference"
    );
  });

  await withProofCopy(root, "projection-policy-record-proof", proofPaths, async (candidateRoot) => {
    await replaceText(
      candidateRoot,
      "projection-root/kit/CONCEPTS.md",
      "projection-kit:context | projection-kit | common-optional | projection-framework:relation",
      "projection-kit:context | projection-kit | common-optional | projection-kit:capability"
    );

    await assertRejects(
      () => verifyKitConceptRecords(candidateRoot, ids.frameworkConceptIds),
      "kit concept dependency cycle proof",
      "dependency cycle"
    );
  });

  await withProofCopy(root, "projection-policy-record-proof", proofPaths, async (candidateRoot) => {
    await replaceText(
      candidateRoot,
      "projection-root/kit/CONCEPTS.md",
      "projection-kit:capability | projection-kit | common-optional | projection-kit:context,projection-kit:surface",
      "projection-kit:capability | projection-kit | common-optional | projection-kit:context,projection-kit:context"
    );

    await assertRejects(
      () => verifyKitConceptRecords(candidateRoot, ids.frameworkConceptIds),
      "duplicate kit concept dependency proof",
      "must not contain duplicates"
    );
  });
}

async function checkRootDocumentContractProofs(root) {
  const proofPaths = ["projection-root/core", "PROJECTION.md"];

  await withProofCopy(root, "projection-policy-doc-contract-proof", proofPaths, async (candidateRoot) => {
    await replaceText(
      candidateRoot,
      "PROJECTION.md",
      "A projection capsule is one appearance among unbounded possible projections.",
      "A projection capsule is a bounded appearance among unbounded possible projections."
    );

    await checkRootProjection(candidateRoot);
  });

  await withProofCopy(root, "projection-policy-doc-contract-proof", proofPaths, async (candidateRoot) => {
    await replaceText(
      candidateRoot,
      "PROJECTION.md",
      "projection:nucleus-opaque",
      "projection:nucleus-opacity"
    );

    await assertRejects(
      () => checkRootProjection(candidateRoot),
      "missing root document contract proof",
      "missing required records"
    );
  });

  await withProofCopy(root, "projection-policy-doc-contract-proof", proofPaths, async (candidateRoot) => {
    await replaceText(
      candidateRoot,
      "PROJECTION.md",
      "The nucleus remains an irreducible opaque token and does not carry identity, meaning, state, history, or ownership.",
      "The nucleus remains a mutable token with optional identity, meaning, state, history, or ownership."
    );

    await assertRejects(
      () => checkRootProjection(candidateRoot),
      "weakened root document obligation proof",
      "expected obligation to include"
    );
  });
}

async function checkSeedBoundaryManifest(root, core) {
  const label = "projection-root/policy/seed-manifest.json";
  const text = await readFile(path.join(root, label), "utf8");
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error(label + " must be valid JSON: " + error.message);
  }
  if (text !== stableStringify(manifest) + "\n") {
    throw new Error(label + " must be canonical JSON");
  }
  assertObject(manifest, label);
  assertJsonList(Object.keys(manifest).sort(), ["capsuleOwnedPathSource", "contract", "forbiddenSeedFamilyDocs", "kind", "projectionOwnedPaths", "seedOwnedPaths", "version"], label + " keys");
  assertEqual(manifest.kind, "projection-policy/seed-boundary", label + ".kind");
  assertEqual(manifest.contract, "projection-policy:seed-boundary-v1", label + ".contract");
  assertEqual(manifest.version, 1, label + ".version");
  assertEqual(manifest.capsuleOwnedPathSource, "projection-root/core/body-ref", label + ".capsuleOwnedPathSource");
  assertJsonList(manifest.seedOwnedPaths, [".gitignore", "AGENTS.md", "PROJECTION.md", "projection-root/framework", "projection-root/kit", "projection-root/policy/ARCHITECTURE.md", "projection-root/policy/verify"], label + ".seedOwnedPaths");
  assertJsonList(manifest.projectionOwnedPaths, ["README.md", "projection-root/core", "projection-root/policy/origin-witness", "projection-support"], label + ".projectionOwnedPaths");
  assertJsonList(manifest.forbiddenSeedFamilyDocs, ["projection-root/kit/interop/*/ADOPTION.md", "projection-root/kit/interop/*/ARCHITECTURE.md"], label + ".forbiddenSeedFamilyDocs");
  await assertPolicyBodyRef(root, core.bodyRef);
}

async function assertPolicyBodyRef(root, bodyRef) {
  if (bodyRef.kind === "single") {
    assertSingleBodyRef(bodyRef.ref);
    return;
  }

  if (bodyRef.kind === "fleet") {
    await readFleetBodyManifest(root, bodyRef.ref);
    return;
  }

  throw new Error("body-ref kind must be single or fleet");
}

function assertSingleBodyRef(ref) {
  const segments = ref.split("/");

  if (segments.length !== 1) {
    throw new Error("single body-ref must be a single root entry");
  }

  const rootEntry = segments[0];

  if (POLICY_RESERVED_ROOT_ENTRIES.has(rootEntry)) {
    throw new Error("body-ref must not point at a reserved root entry");
  }
}

async function bodyRefIgnoredRootEntries(root, bodyRef) {
  if (bodyRef.kind === "single") {
    return [bodyRef.ref];
  }

  const manifest = await readFleetBodyManifest(root, bodyRef.ref);
  return uniqueRootEntries([
    ...manifest.memberRootEntries
  ]);
}

async function readFleetBodyManifest(root, ref) {
  assertFleetManifestRef(ref);

  const text = await readFile(path.join(root, ref), "utf8");
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error(`fleet body manifest must be valid JSON: ${error.message}`);
  }
  if (text !== stableStringify(manifest) + "\n") {
    throw new Error("fleet body manifest must be canonical JSON");
  }
  assertObject(manifest, "fleet body manifest");
  if (manifest.body?.kind !== "fleet") {
    throw new Error("fleet body manifest body.kind must be fleet");
  }
  if (!Array.isArray(manifest.projections) || manifest.projections.length === 0) {
    throw new Error("fleet body manifest projections must be a non-empty array");
  }

  const memberRootEntries = [];
  for (const [index, projection] of manifest.projections.entries()) {
    assertObject(projection, `fleet body manifest projections[${index}]`);
    assertFleetRootEntry(projection.path, `fleet body manifest projections[${index}].path`);
    memberRootEntries.push(projection.path);
  }
  assertUniqueRootEntries(memberRootEntries, "fleet body manifest projections.path");

  const bodyOwnedPaths = manifest.body.ownedPaths ?? [];
  if (!Array.isArray(bodyOwnedPaths)) {
    throw new Error("fleet body manifest body.ownedPaths must be an array");
  }
  if (bodyOwnedPaths.length > 0) {
    throw new Error(
      "fleet body manifest body.ownedPaths must be empty; projection-specific operational support belongs under projection-support"
    );
  }

  return {
    memberRootEntries
  };
}

function assertFleetManifestRef(ref) {
  const segments = ref.split("/");
  if (
    segments.length !== 2 ||
    segments[0] !== PROJECTION_SUPPORT_ROOT ||
    !segments[1].endsWith(".json")
  ) {
    throw new Error("fleet body-ref must point at one manifest file under projection-support");
  }
  assertFleetManifestFileName(segments[1], "fleet body-ref manifest file");
}

function assertFleetManifestFileName(value, label) {
  if (
    typeof value !== "string" ||
    value.length <= ".json".length ||
    value.trim() !== value ||
    value.includes("/") ||
    value.includes("\\") ||
    value === "." ||
    value === ".." ||
    value.startsWith(".")
  ) {
    throw new Error(`${label} must be one visible JSON file`);
  }
}

function assertFleetRootEntry(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    path.isAbsolute(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    value === "." ||
    value === ".."
  ) {
    throw new Error(`${label} must be one root entry`);
  }
  if (POLICY_RESERVED_ROOT_ENTRIES.has(value)) {
    throw new Error(`${label} must not point at a reserved root entry`);
  }
}

function assertUniqueRootEntries(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function uniqueRootEntries(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

async function writeBodyRef(root, currentBodyRef, ref, kind = currentBodyRef.kind) {
  const values = {
    basis: currentBodyRef.basis,
    kind,
    ref
  };

  await writeValue(root, "projection-root/core/body-ref/basis", values.basis);
  await writeValue(root, "projection-root/core/body-ref/kind", values.kind);
  await writeValue(root, "projection-root/core/body-ref/ref", values.ref);
  await writeValue(
    root,
    "projection-root/core/body-ref/seal",
    sealCapsuleValues(values, BODY_REF_SEAL_FIELDS)
  );
}

async function writeFleetManifest(root, relativePath, manifest) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stableStringify(manifest)}\n`, "utf8");
}

async function writeValue(root, relativePath, value) {
  await writeFile(path.join(root, relativePath), `${value}\n`, "utf8");
}

async function assertOnlyRootEntries(root, allowed, ignored = []) {
  const allowedEntries = new Set([...allowed, ".git"]);
  const ignoredEntries = new Set(ignored);
  const entries = await readdir(root, { withFileTypes: true });
  const unexpected = entries
    .map((entry) => entry.name)
    .filter((name) => !allowedEntries.has(name) && !ignoredEntries.has(name))
    .sort();

  if (unexpected.length > 0) {
    throw new Error(`Unexpected root path in projection policy: ${unexpected.join(", ")}`);
  }
}

async function assertOnlyEntries(root, directory, allowed) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const actual = entries.map((entry) => entry.name).sort();
  assertJsonList(actual, [...allowed].sort(), `${directory} entries`);
}

async function assertOnlyMjsFiles(root, directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const unexpected = entries
    .filter((entry) => !entry.isFile() || !entry.name.endsWith(".mjs"))
    .map((entry) => entry.name)
    .sort();

  if (unexpected.length > 0) {
    throw new Error(`Unexpected non-module path in ${directory}: ${unexpected.join(", ")}`);
  }
}

async function requirePaths(root, relativePaths) {
  for (const relativePath of relativePaths) {
    await requirePath(root, relativePath);
  }
}

async function requirePath(root, relativePath) {
  await stat(path.join(root, relativePath)).catch(() => {
    throw new Error(`Required path is missing: ${relativePath}`);
  });
}

async function forbidPaths(root, relativePaths) {
  for (const relativePath of relativePaths) {
    await forbidPath(root, relativePath);
  }
}

async function forbidPath(root, relativePath) {
  const exists = await stat(path.join(root, relativePath))
    .then(() => true)
    .catch(() => false);

  if (exists) {
    throw new Error(`Forbidden path exists in current projection: ${relativePath}`);
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((item) => stableStringify(item)).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be a JSON object");
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }
}

function assertJsonList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(values, expected, label) {
  if (!values.includes(expected)) {
    throw new Error(`${label}: expected to include ${JSON.stringify(expected)}`);
  }
}

function assertTrimmedString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be one trimmed string`);
  }
}

function assertPortablePathList(values, label) {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array`);
  }
  for (const [index, value] of values.entries()) {
    assertPortablePath(value, `${label}[${index}]`);
  }
  assertJsonList(values, uniqueRootEntries(values).sort(), label);
}

function assertPortablePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    path.isAbsolute(value) ||
    value.includes("\\") ||
    /\s/.test(value) ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a portable relative path`);
  }
}
