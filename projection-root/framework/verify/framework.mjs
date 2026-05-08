import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { verifyConceptRecords } from "./concepts.mjs";
import { verifyProjectionCore } from "./core-capsules.mjs";
import { verifyDocumentContract } from "./doc-contracts.mjs";
import { withProofCopy } from "./proof-utils.mjs";
import { checkProjectionReplacement } from "./replacement.mjs";

const REQUIRED_FRAMEWORK_ARCHITECTURE_SECTIONS = [
  "Current Layout",
  "Framework Role",
  "Concept Records",
  "Core Grammar Verification",
  "Framework Verification",
  "Replacement Verification",
  "Replacement Rule",
  "Verification Contract"
];

const REQUIRED_FRAMEWORK_ARCHITECTURE_CONTRACTS = [
  "framework:concepts-not-core-validity",
  "framework:core-body-independent",
  "framework:markerless-bounded-core",
  "framework:outside-policy-body",
  "framework:projection-generic",
  "framework:replacement-finite-proof",
  "framework:replacement-preserves-origin",
  "framework:verification-excludes-policy-body"
];

export async function checkProjectionFramework(root, options = {}) {
  const core = await verifyProjectionCore(root);

  await requirePath(root, "projection-root/core");
  await requirePath(root, core.origin.ref);
  await requirePath(root, "projection-root/core/claims/current");
  await requirePath(root, "projection-root/core/boundary/current");
  await requirePath(root, "projection-root/core/body-ref");
  await requirePath(root, "projection-root/framework");
  await requirePath(root, "projection-root/framework/ARCHITECTURE.md");
  await requirePath(root, "projection-root/framework/CONCEPTS.md");
  await requirePath(root, "projection-root/framework/verify/run.mjs");
  await requirePath(root, "projection-root/framework/verify/concepts.mjs");
  await requirePath(root, "projection-root/framework/verify/core-capsules.mjs");
  await requirePath(root, "projection-root/framework/verify/doc-contracts.mjs");
  await requirePath(root, "projection-root/framework/verify/framework.mjs");
  await requirePath(root, "projection-root/framework/verify/proof-utils.mjs");
  await requirePath(root, "projection-root/framework/verify/relation.mjs");
  await requirePath(root, "projection-root/framework/verify/replacement.mjs");
  await assertOnlyEntries(root, "projection-root/framework", ["ARCHITECTURE.md", "CONCEPTS.md", "verify"]);
  await assertOnlyEntries(root, "projection-root/framework/verify", [
    "concepts.mjs",
    "core-capsules.mjs",
    "doc-contracts.mjs",
    "framework.mjs",
    "proof-utils.mjs",
    "relation.mjs",
    "replacement.mjs",
    "run.mjs"
  ]);
  await checkFrameworkArchitecture(root);
  await verifyConceptRecords(root, "projection-root/framework/CONCEPTS.md", {
    allowedDependencyPrefixes: ["projection-core:", "projection-framework:"],
    allowedStrengths: ["universal-framework"],
    expectedIdPrefix: "projection-framework:",
    expectedLayer: "projection-framework",
    knownDependencyIds: [
      "projection-core:body-ref",
      "projection-core:boundary",
      "projection-core:claims",
      "projection-core:origin"
    ],
    requiredIds: [
      "projection-framework:capsule",
      "projection-framework:integrity",
      "projection-framework:ref",
      "projection-framework:relation",
      "projection-framework:replacement",
      "projection-framework:seal",
      "projection-framework:verification"
    ]
  });

  await checkProjectionReplacement(root);

  if (options.detachedBodyProof !== false) {
    await checkFrameworkWithoutBody(root);
  }
}

async function checkFrameworkWithoutBody(root) {
  await withProofCopy(root, "projection-framework-bodyless", [
    "projection-root/core",
    "projection-root/framework"
  ], async (candidateRoot) => {
    await checkProjectionFramework(candidateRoot, { detachedBodyProof: false });
  });
}

async function checkFrameworkArchitecture(root) {
  const text = await readFile(path.join(root, "projection-root/framework/ARCHITECTURE.md"), "utf8");

  assertEqual(
    firstLine(text),
    "# Projection Framework Architecture",
    "projection-root/framework/ARCHITECTURE.md title"
  );
  assertOrderedIncludes(
    readSections(text),
    REQUIRED_FRAMEWORK_ARCHITECTURE_SECTIONS,
    "projection-root/framework/ARCHITECTURE.md sections"
  );
  verifyDocumentContract(text, {
    expectedIdPrefix: "framework:",
    label: "projection-root/framework/ARCHITECTURE.md",
    requiredIds: REQUIRED_FRAMEWORK_ARCHITECTURE_CONTRACTS
  });
}

async function assertOnlyEntries(root, directory, allowed) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const actual = entries.map((entry) => entry.name).sort();
  assertJsonList(actual, [...allowed].sort(), `${directory} entries`);
}

async function requirePath(root, relativePath) {
  await stat(path.join(root, relativePath)).catch(() => {
    throw new Error(`Required path is missing: ${relativePath}`);
  });
}

function firstLine(text) {
  return text.split("\n")[0] ?? "";
}

function readSections(text) {
  return [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
}

function assertOrderedIncludes(actual, required, label) {
  let start = 0;

  for (const section of required) {
    const index = actual.indexOf(section, start);
    if (index === -1) {
      throw new Error(
        `${label}: missing required section ${JSON.stringify(section)} in ${JSON.stringify(actual)}`
      );
    }

    start = index + 1;
  }
}

function assertJsonList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
