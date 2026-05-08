import { verifyProjectionCore } from "../../framework/verify/core-capsules.mjs";
import {
  assertNoCurrentBodyPath,
  assertRequiredSections,
  assertTitle,
  assertVerificationContract,
  readRootDocument,
} from "./root-doc.mjs";

const REQUIRED_POLICY_SECTIONS = [
  "Current Layout",
  "Policy Role",
  "Seed Boundary",
  "Origin Witness",
  "Verification",
  "Verification Contract"
];

const REQUIRED_POLICY_CONTRACTS = [
  "policy:body-ref-root-placement",
  "policy:data-witness",
  "policy:kit-protected-root-layer",
  "policy:origin-change-different-claim",
  "policy:projection-local",
  "policy:projection-support-boundary",
  "policy:seed-boundary-manifest",
  "policy:verification-covers-witness-records",
  "policy:witness-not-hardcoded"
];
const REQUIRED_POLICY_OBLIGATION_TERMS = {
  "policy:body-ref-root-placement": [
    "Policy rejects",
    "nested single body refs",
    "fleet body manifests"
  ],
  "policy:kit-protected-root-layer": [
    "projection-root/kit",
    "protected root layer",
    "optional"
  ],
  "policy:origin-change-different-claim": [
    "Active origin changes",
    "different projection claims",
    "root surgery"
  ],
  "policy:projection-support-boundary": [
    "projection-support",
    "ad hoc root support files",
    "root-level fleet manifests"
  ],
  "policy:seed-boundary-manifest": [
    "canonical seed boundary manifest",
    "seed-owned paths",
    "forbidden interop family docs",
    "runtime dependency"
  ]
};

export async function checkRootPolicy(root) {
  const core = await verifyProjectionCore(root);
  const text = await readRootDocument(root, "projection-root/policy/ARCHITECTURE.md");

  assertNoCurrentBodyPath(text, core.bodyRef, "projection-root/policy/ARCHITECTURE.md");
  assertTitle(text, "# Projection Policy Architecture", "projection-root/policy/ARCHITECTURE.md");
  assertRequiredSections(text, REQUIRED_POLICY_SECTIONS, "projection-root/policy/ARCHITECTURE.md");
  assertVerificationContract(text, {
    expectedIdPrefix: "policy:",
    label: "projection-root/policy/ARCHITECTURE.md",
    requiredIds: REQUIRED_POLICY_CONTRACTS,
    requiredObligationTermsById: REQUIRED_POLICY_OBLIGATION_TERMS
  });
}
