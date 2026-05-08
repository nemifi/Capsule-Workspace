import { verifyProjectionCore } from "../../framework/verify/core-capsules.mjs";
import {
  assertNoCurrentBodyPath,
  assertRequiredSections,
  assertVerificationContract,
  readRootDocument,
} from "./root-doc.mjs";

const REQUIRED_README_SECTIONS = [
  "Shape",
  "Boundaries",
  "Root Docs",
  "Reading Order",
  "Verification",
  "Verification Contract"
];

const REQUIRED_README_CONTRACTS = [
  "readme:body-absent-valid-core",
  "readme:body-local-docs-in-body",
  "readme:body-ref-current-body",
  "readme:layer-boundaries",
  "readme:no-root-app-config",
  "readme:orientation-not-center",
  "readme:projection-support-boundary",
  "readme:reading-order-adoption-meaning",
  "readme:replacement-nonregistry-proof",
  "readme:shape-layers-listed",
  "readme:verification-entrypoints"
];
const REQUIRED_README_OBLIGATION_TERMS = {
  "readme:body-ref-current-body": ["current body path", "body-ref"],
  "readme:no-root-app-config": [
    "root avoids conventional app configuration",
    "body-owned"
  ],
  "readme:projection-support-boundary": [
    "projection-support",
    "operational",
    "ad hoc root files"
  ]
};

export async function checkRootReadme(root) {
  const core = await verifyProjectionCore(root);
  const text = await readRootDocument(root, "README.md");

  assertNoCurrentBodyPath(text, core.bodyRef, "README.md");
  assertReadmeTitle(text);
  assertRequiredSections(text, REQUIRED_README_SECTIONS, "README.md");
  assertVerificationContract(text, {
    expectedIdPrefix: "readme:",
    label: "README.md",
    requiredIds: REQUIRED_README_CONTRACTS,
    requiredObligationTermsById: REQUIRED_README_OBLIGATION_TERMS
  });
}

function assertReadmeTitle(text) {
  const first = text.split("\n")[0] ?? "";

  if (!/^# [A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(first)) {
    throw new Error(`README.md title must be a single project H1, got ${JSON.stringify(first)}`);
  }
}
