import { verifyProjectionCore } from "../../framework/verify/core-capsules.mjs";
import {
  assertNoCurrentBodyPath,
  assertRequiredSections,
  assertTitle,
  assertVerificationContract,
  readRootDocument,
} from "./root-doc.mjs";

const REQUIRED_PROJECTION_SECTIONS = [
  "Premise",
  "Agent Orientation",
  "Nucleus",
  "Capsule Boundary",
  "Layers",
  "Concept Placement",
  "Kit",
  "Multiplicity",
  "Exposure And Lineage",
  "Verification",
  "Placement Test",
  "Verification Contract"
];

const REQUIRED_PROJECTION_CONTRACTS = [
  "projection:body-ref-declares-current-body",
  "projection:concept-placement-by-obligation",
  "projection:core-body-independent",
  "projection:finite-participation",
  "projection:kit-optional",
  "projection:layer-separation",
  "projection:lineage-outside-core-history",
  "projection:multiplicity-nonregistry",
  "projection:nucleus-length-nonshrinking",
  "projection:nucleus-opaque",
  "projection:origin-change-different-claim",
  "projection:placement-keeps-core-small",
  "projection:verification-witness"
];
const REQUIRED_PROJECTION_OBLIGATION_TERMS = {
  "projection:body-ref-declares-current-body": ["current body", "body-ref"],
  "projection:kit-optional": ["Kit records", "optional grammar", "projection validity"],
  "projection:nucleus-length-nonshrinking": ["48", "must not reduce"],
  "projection:nucleus-opaque": ["nucleus", "opaque token", "does not carry identity"],
  "projection:origin-change-different-claim": [
    "Changing the active origin",
    "different projection claim"
  ]
};

export async function checkRootProjection(root) {
  const core = await verifyProjectionCore(root);
  const text = await readRootDocument(root, "PROJECTION.md");

  assertTitle(text, "# Projection", "PROJECTION.md");
  assertRequiredSections(text, REQUIRED_PROJECTION_SECTIONS, "PROJECTION.md");
  assertNoCurrentBodyPath(text, core.bodyRef, "PROJECTION.md");
  assertVerificationContract(text, {
    expectedIdPrefix: "projection:",
    label: "PROJECTION.md",
    requiredIds: REQUIRED_PROJECTION_CONTRACTS,
    requiredObligationTermsById: REQUIRED_PROJECTION_OBLIGATION_TERMS
  });
}
