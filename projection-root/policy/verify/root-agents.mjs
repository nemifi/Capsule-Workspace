import { verifyProjectionCore } from "../../framework/verify/core-capsules.mjs";
import {
  assertNoCurrentBodyPath,
  assertRequiredSections,
  assertTitle,
  assertVerificationContract,
  readRootDocument,
} from "./root-doc.mjs";

const REQUIRED_ROOT_AGENT_SECTIONS = [
  "Authority",
  "Projection Boundary",
  "Default Mutable Area",
  "Workflow",
  "Verification",
  "Commit Policy",
  "Verification Contract"
];

const REQUIRED_ROOT_AGENT_CONTRACTS = [
  "agents:body-archive-background",
  "agents:body-rules-delegated",
  "agents:branch-explicit",
  "agents:commit-scoped-current-branch",
  "agents:default-mutable-area",
  "agents:origin-protected",
  "agents:projection-support-boundary",
  "agents:root-body-boundary",
  "agents:verification-routes",
  "agents:workflow-tools"
];
const REQUIRED_ROOT_AGENT_OBLIGATION_TERMS = {
  "agents:default-mutable-area": [
    "Ordinary implementation",
    "current body",
    "projection-support",
    "explicit root surgery"
  ],
  "agents:origin-protected": ["Active origin", "nucleus", "protected"],
  "agents:projection-support-boundary": [
    "Projection-specific operational support",
    "projection-support",
    "ad hoc root files"
  ]
};

export async function checkRootAgentRules(root) {
  const core = await verifyProjectionCore(root);
  const text = await readRootDocument(root, "AGENTS.md");

  assertNoCurrentBodyPath(text, core.bodyRef, "root AGENTS.md");
  assertTitle(text, "# AGENTS.md", "root AGENTS.md");
  assertRequiredSections(text, REQUIRED_ROOT_AGENT_SECTIONS, "root AGENTS.md");
  assertVerificationContract(text, {
    expectedIdPrefix: "agents:",
    label: "root AGENTS.md",
    requiredIds: REQUIRED_ROOT_AGENT_CONTRACTS,
    requiredObligationTermsById: REQUIRED_ROOT_AGENT_OBLIGATION_TERMS
  });
}
