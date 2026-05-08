import { verifyProjectionCore } from "../../framework/verify/core-capsules.mjs";
import {
  assertNoCurrentBodyPath,
  assertRequiredSections,
  assertTitle,
  assertVerificationContract,
  readRootDocument,
} from "./root-doc.mjs";
import { runSelfTest as runInteropAdapterSelfTest } from "../../kit/interop/adapter/verify.mjs";
import { runSelfTest as runInteropCompatibilitySelfTest } from "../../kit/interop/compatibility/verify.mjs";
import { runSelfTest as runInteropEvidenceSelfTest } from "../../kit/interop/evidence/verify.mjs";
import { runSelfTest as runInteropGuardSelfTest } from "../../kit/interop/guard/verify.mjs";
import { runSelfTest as runInteropIndexSelfTest } from "../../kit/interop/index/verify.mjs";
import { runSelfTest as runInteropInterfaceSelfTest } from "../../kit/interop/interface/verify.mjs";
import { runSelfTest as runInteropIntentSelfTest } from "../../kit/interop/intent/verify.mjs";
import { runSelfTest as runInteropProposalSelfTest } from "../../kit/interop/proposal/verify.mjs";
import { runSelfTest as runInteropRelationSelfTest } from "../../kit/interop/relation/verify.mjs";
import { runSelfTest as runInteropSessionSelfTest } from "../../kit/interop/session/verify.mjs";
import { runSelfTest as runMaterializationSelfTest } from "../../kit/materialization/verify.mjs";
import { runSelfTest as runToolchainSelfTest } from "../../kit/toolchain/verify.mjs";

const REQUIRED_KIT_SECTIONS = [
  "Current Layout",
  "Kit Role",
  "Materialization",
  "Concept Records",
  "Boundary",
  "Placement Rule",
  "Verification Contract"
];

const REQUIRED_KIT_CONTRACTS = [
  "kit:adoption-not-required",
  "kit:body-independent",
  "kit:concept-records",
  "kit:concepts-not-registry",
  "kit:interop-fabric-optional",
  "kit:leaf-docs-forbidden",
  "kit:materialization-declarative",
  "kit:optional-reusable",
  "kit:participation-forms-common",
  "kit:placement-reusable-not-required",
  "kit:toolchain-lightweight"
];
const REQUIRED_KIT_OBLIGATION_TERMS = {
  "kit:adoption-not-required": [
    "adopt no kit records",
    "valid when its core is valid"
  ],
  "kit:optional-reusable": [
    "optional reusable participation grammar",
    "not projection validity"
  ],
  "kit:interop-fabric-optional": [
    "Interop fabric grammar",
    "outside origin material",
    "not identity"
  ],
  "kit:leaf-docs-forbidden": [
    "Kit leaf families",
    "manifests, records, and verifiers first",
    "per-leaf ADOPTION.md and ARCHITECTURE.md"
  ],
  "kit:materialization-declarative": [
    "materialization catalog",
    "Capsule Generator",
    "without becoming"
  ],
  "kit:toolchain-lightweight": [
    "Toolchain declarations",
    "package artifacts",
    "source trees"
  ]
};

const REQUIRED_INTEROP_SECTIONS = [
  "Purpose",
  "Layering",
  "Fabric Model",
  "Record Families",
  "Coordination Flow",
  "Adoption",
  "Scale Model",
  "Operations",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_CONTRACTS = [
  "interop:adapter-mediated",
  "interop:adoption-incremental",
  "interop:derived-index",
  "interop:evidence-bounded",
  "interop:guard-visible",
  "interop:intent-routed",
  "interop:kernel-small",
  "interop:proposal-bounded",
  "interop:relation-last",
  "interop:session-first"
];

const REQUIRED_INTEROP_ADAPTER_SECTIONS = [
  "Purpose",
  "Contract Shape",
  "Field Semantics",
  "Compatibility Binding",
  "Execution Boundary",
  "Verified State",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_ADAPTER_CONTRACTS = [
  "interop-adapter:basis-compatibility",
  "interop-adapter:canonical-record",
  "interop-adapter:compatibility-readiness",
  "interop-adapter:declarative-contract",
  "interop-adapter:endpoint-bounded",
  "interop-adapter:guard-bound",
  "interop-adapter:loss-visible",
  "interop-adapter:runtime-body-owned",
  "interop-adapter:verified-guarded"
];

const REQUIRED_INTEROP_ADAPTER_ADOPTION_SECTIONS = [
  "Minimal Contract",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_ADAPTER_ADOPTION_CONTRACTS = [
  "interop-adapter-adoption:body-owned-execution",
  "interop-adapter-adoption:canonical-json",
  "interop-adapter-adoption:compatibility-first",
  "interop-adapter-adoption:contract-only",
  "interop-adapter-adoption:guard-aware",
  "interop-adapter-adoption:origin-untouched"
];

const REQUIRED_INTEROP_COMPATIBILITY_SECTIONS = [
  "Purpose",
  "Plan Shape",
  "Field Semantics",
  "Planning Flow",
  "Guarded Readiness",
  "Adapter Boundaries",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_COMPATIBILITY_CONTRACTS = [
  "interop-compatibility:adapter-explicit",
  "interop-compatibility:basis-readable",
  "interop-compatibility:canonical-record",
  "interop-compatibility:declarative-plan",
  "interop-compatibility:evidence-visible",
  "interop-compatibility:guard-visible",
  "interop-compatibility:role-bounded",
  "interop-compatibility:runtime-body-owned"
];

const REQUIRED_INTEROP_COMPATIBILITY_ADOPTION_SECTIONS = [
  "Minimal Plan",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_COMPATIBILITY_ADOPTION_CONTRACTS = [
  "interop-compatibility-adoption:body-owned-policy",
  "interop-compatibility-adoption:canonical-json",
  "interop-compatibility-adoption:finite-next-step",
  "interop-compatibility-adoption:guard-aware",
  "interop-compatibility-adoption:origin-untouched",
  "interop-compatibility-adoption:plan-only"
];

const REQUIRED_INTEROP_INTERFACE_SECTIONS = [
  "Purpose",
  "Manifest Shape",
  "Field Semantics",
  "Compatibility Boundaries",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_INTERFACE_CONTRACTS = [
  "interop-interface:canonical-record",
  "interop-interface:declarative-only",
  "interop-interface:effect-visible",
  "interop-interface:projection-anchor-readable",
  "interop-interface:runtime-body-owned",
  "interop-interface:surface-capability-linked",
  "interop-interface:translation-ready"
];

const REQUIRED_INTEROP_INTERFACE_ADOPTION_SECTIONS = [
  "Minimal Manifest",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_INTERFACE_ADOPTION_CONTRACTS = [
  "interop-interface-adoption:body-owned-meaning",
  "interop-interface-adoption:canonical-json",
  "interop-interface-adoption:incremental",
  "interop-interface-adoption:manifest-only",
  "interop-interface-adoption:origin-untouched"
];

const REQUIRED_INTEROP_INTENT_SECTIONS = [
  "Purpose",
  "Manifest Shape",
  "Field Semantics",
  "Planning Boundaries",
  "Scale Model",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_INTENT_CONTRACTS = [
  "interop-intent:canonical-record",
  "interop-intent:declarative-outcome",
  "interop-intent:participant-roles",
  "interop-intent:payload-vocabulary",
  "interop-intent:requester-anchor-readable",
  "interop-intent:runtime-body-owned",
  "interop-intent:scale-bounded"
];

const REQUIRED_INTEROP_INTENT_ADOPTION_SECTIONS = [
  "Minimal Intent",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_INTENT_ADOPTION_CONTRACTS = [
  "interop-intent-adoption:body-owned-policy",
  "interop-intent-adoption:canonical-json",
  "interop-intent-adoption:incremental",
  "interop-intent-adoption:intent-only",
  "interop-intent-adoption:origin-untouched"
];

const REQUIRED_INTEROP_SESSION_SECTIONS = [
  "Purpose",
  "Record Shape",
  "Field Semantics",
  "Admission Boundaries",
  "Lifecycle Boundaries",
  "Failure Policy",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_SESSION_CONTRACTS = [
  "interop-session:admission-guarded",
  "interop-session:basis-compatibility",
  "interop-session:canonical-record",
  "interop-session:declarative-instance",
  "interop-session:finite-participants",
  "interop-session:guarded-lifecycle",
  "interop-session:runtime-body-owned",
  "interop-session:session-bounded"
];

const REQUIRED_INTEROP_SESSION_ADOPTION_SECTIONS = [
  "Minimal Session",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_SESSION_ADOPTION_CONTRACTS = [
  "interop-session-adoption:body-owned-runtime",
  "interop-session-adoption:canonical-json",
  "interop-session-adoption:compatibility-first",
  "interop-session-adoption:finite-instance",
  "interop-session-adoption:guarded-admission",
  "interop-session-adoption:origin-untouched",
  "interop-session-adoption:record-only"
];

const REQUIRED_INTEROP_EVIDENCE_SECTIONS = [
  "Purpose",
  "Record Shape",
  "Field Semantics",
  "Observation Boundaries",
  "Receipt Binding",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_EVIDENCE_CONTRACTS = [
  "interop-evidence:basis-subject",
  "interop-evidence:canonical-record",
  "interop-evidence:finite-observation",
  "interop-evidence:interpretation-bounded",
  "interop-evidence:receipt-result-bound",
  "interop-evidence:runtime-body-owned",
  "interop-evidence:truth-separated"
];

const REQUIRED_INTEROP_EVIDENCE_ADOPTION_SECTIONS = [
  "Minimal Evidence",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_EVIDENCE_ADOPTION_CONTRACTS = [
  "interop-evidence-adoption:body-owned-meaning",
  "interop-evidence-adoption:canonical-json",
  "interop-evidence-adoption:observation-only",
  "interop-evidence-adoption:origin-untouched",
  "interop-evidence-adoption:receipt-result-visible",
  "interop-evidence-adoption:subject-basis-visible"
];

const REQUIRED_INTEROP_RELATION_SECTIONS = [
  "Purpose",
  "Record Shape",
  "Field Semantics",
  "Evidence Binding",
  "Continuity Boundaries",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_RELATION_CONTRACTS = [
  "interop-relation:basis-evidence",
  "interop-relation:canonical-record",
  "interop-relation:evidence-bindings-visible",
  "interop-relation:finite-continuity",
  "interop-relation:guarded-active-state",
  "interop-relation:runtime-body-owned",
  "interop-relation:supersession-not-mutation",
  "interop-relation:truth-separated"
];

const REQUIRED_INTEROP_RELATION_ADOPTION_SECTIONS = [
  "Minimal Relation",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_RELATION_ADOPTION_CONTRACTS = [
  "interop-relation-adoption:body-owned-runtime",
  "interop-relation-adoption:canonical-json",
  "interop-relation-adoption:evidence-binding-visible",
  "interop-relation-adoption:evidence-first",
  "interop-relation-adoption:finite-claim",
  "interop-relation-adoption:origin-untouched",
  "interop-relation-adoption:record-only"
];

const REQUIRED_INTEROP_INDEX_SECTIONS = [
  "Purpose",
  "Record Shape",
  "Field Semantics",
  "Source Binding",
  "Derivation Boundaries",
  "Scale Model",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_INDEX_CONTRACTS = [
  "interop-index:bounded-derived-view",
  "interop-index:candidate-basis-source",
  "interop-index:canonical-record",
  "interop-index:count-consistency",
  "interop-index:derived-freshness",
  "interop-index:runtime-body-owned",
  "interop-index:source-bindings-visible",
  "interop-index:truth-separated"
];

const REQUIRED_INTEROP_INDEX_ADOPTION_SECTIONS = [
  "Minimal Index",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_INDEX_ADOPTION_CONTRACTS = [
  "interop-index-adoption:body-owned-discovery",
  "interop-index-adoption:canonical-json",
  "interop-index-adoption:derived-not-source",
  "interop-index-adoption:finite-view",
  "interop-index-adoption:origin-untouched",
  "interop-index-adoption:source-bindings-visible",
  "interop-index-adoption:sources-visible"
];

const REQUIRED_INTEROP_PROPOSAL_SECTIONS = [
  "Purpose",
  "Record Shape",
  "Field Semantics",
  "Target Binding",
  "Negotiation Boundaries",
  "Lifecycle Boundaries",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_PROPOSAL_CONTRACTS = [
  "interop-proposal:accepted-guarded",
  "interop-proposal:basis-intent-index",
  "interop-proposal:canonical-record",
  "interop-proposal:finite-negotiation",
  "interop-proposal:requester-declared",
  "interop-proposal:runtime-body-owned",
  "interop-proposal:target-bindings-visible",
  "interop-proposal:truth-separated"
];

const REQUIRED_INTEROP_PROPOSAL_ADOPTION_SECTIONS = [
  "Minimal Proposal",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_PROPOSAL_ADOPTION_CONTRACTS = [
  "interop-proposal-adoption:body-owned-negotiation",
  "interop-proposal-adoption:canonical-json",
  "interop-proposal-adoption:finite-request",
  "interop-proposal-adoption:index-targets-visible",
  "interop-proposal-adoption:intent-index-visible",
  "interop-proposal-adoption:origin-untouched",
  "interop-proposal-adoption:record-only"
];

const REQUIRED_INTEROP_GUARD_SECTIONS = [
  "Purpose",
  "Record Shape",
  "Field Semantics",
  "Guard Boundaries",
  "Satisfied State",
  "Canonical Records",
  "Verification",
  "Boundary",
  "Verification Contract"
];

const REQUIRED_INTEROP_GUARD_CONTRACTS = [
  "interop-guard:basis-proposal",
  "interop-guard:canonical-record",
  "interop-guard:finite-guard",
  "interop-guard:limits-visible",
  "interop-guard:runtime-body-owned",
  "interop-guard:satisfied-guarded",
  "interop-guard:truth-separated"
];

const REQUIRED_INTEROP_GUARD_ADOPTION_SECTIONS = [
  "Minimal Guard",
  "File Placement",
  "Field Choices",
  "Verification",
  "Boundaries",
  "Verification Contract"
];

const REQUIRED_INTEROP_GUARD_ADOPTION_CONTRACTS = [
  "interop-guard-adoption:body-owned-policy",
  "interop-guard-adoption:canonical-json",
  "interop-guard-adoption:guard-only",
  "interop-guard-adoption:origin-untouched",
  "interop-guard-adoption:proposal-visible"
];

export async function checkRootKit(root) {
  const core = await verifyProjectionCore(root);
  const text = await readRootDocument(root, "projection-root/kit/ARCHITECTURE.md");

  assertTitle(text, "# Projection Kit Architecture", "projection-root/kit/ARCHITECTURE.md");
  assertRequiredSections(text, REQUIRED_KIT_SECTIONS, "projection-root/kit/ARCHITECTURE.md");
  assertNoCurrentBodyPath(text, core.bodyRef, "projection-root/kit/ARCHITECTURE.md");
  assertVerificationContract(text, {
    expectedIdPrefix: "kit:",
    label: "projection-root/kit/ARCHITECTURE.md",
    requiredIds: REQUIRED_KIT_CONTRACTS,
    requiredObligationTermsById: REQUIRED_KIT_OBLIGATION_TERMS
  });

  await checkInteropKit(root, core.bodyRef);
  await runMaterializationSelfTest(root);
  await runToolchainSelfTest(root);
}

async function checkInteropKit(root, bodyRef) {
  const text = await readRootDocument(root, "projection-root/kit/interop/ARCHITECTURE.md");

  assertTitle(text, "# Projection Interop Architecture", "projection-root/kit/interop/ARCHITECTURE.md");
  assertRequiredSections(text, REQUIRED_INTEROP_SECTIONS, "projection-root/kit/interop/ARCHITECTURE.md");
  assertNoCurrentBodyPath(text, bodyRef, "projection-root/kit/interop/ARCHITECTURE.md");
  assertVerificationContract(text, {
    expectedIdPrefix: "interop:",
    label: "projection-root/kit/interop/ARCHITECTURE.md",
    requiredIds: REQUIRED_INTEROP_CONTRACTS
  });

  await checkInteropManifest(root, bodyRef);
  await runInteropInterfaceSelfTest();
  await runInteropIntentSelfTest();
  await runInteropCompatibilitySelfTest();
  await runInteropAdapterSelfTest();
  await runInteropSessionSelfTest();
  await runInteropEvidenceSelfTest();
  await runInteropRelationSelfTest();
  await runInteropIndexSelfTest();
  await runInteropProposalSelfTest();
  await runInteropGuardSelfTest();
}

const INTEROP_FAMILY_ORDER = ["adapter", "compatibility", "evidence", "guard", "index", "intent", "interface", "proposal", "relation", "session"];

async function checkInteropManifest(root, bodyRef) {
  const label = "projection-root/kit/interop/manifest.json";
  const text = await readRootDocument(root, label);
  assertNoCurrentBodyPath(text, bodyRef, label);
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error(label + " must be valid JSON: " + error.message);
  }
  if (text !== stableStringify(manifest) + "\n") {
    throw new Error(label + " must be canonical JSON");
  }
  assertRecord(manifest, label);
  assertKeys(manifest, ["architecture", "contract", "families", "kind", "version"], label);
  assertEqual(manifest.kind, "projection-kit/interop-manifest", label + ".kind");
  assertEqual(manifest.contract, "projection-kit:interop-manifest-v2", label + ".contract");
  assertEqual(manifest.version, 2, label + ".version");
  assertEqual(manifest.architecture, "projection-root/kit/interop/ARCHITECTURE.md", label + ".architecture");
  assertArray(manifest.families, label + ".families");
  const names = manifest.families.map((family) => family.name);
  assertJsonEqual(names, INTEROP_FAMILY_ORDER, label + ".families names");
  for (const family of manifest.families) {
    assertRecord(family, label + ".families[]");
    assertKeys(family, ["name", "verifier"], label + ".families." + family.name);
    if (!INTEROP_FAMILY_ORDER.includes(family.name)) {
      throw new Error(label + ".families contains unknown family: " + family.name);
    }
    assertEqual(family.verifier, "projection-root/kit/interop/" + family.name + "/verify.mjs", label + "." + family.name + ".verifier");
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((item) => stableStringify(item)).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be a JSON object");
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(label + " must be an array");
}

function assertKeys(value, expected, label) {
  assertJsonEqual(Object.keys(value).sort(), [...expected].sort(), label + " keys");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(label + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(label + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
