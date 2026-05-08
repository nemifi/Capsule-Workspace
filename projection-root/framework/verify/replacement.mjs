import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ATOM_SEAL_FIELDS,
  BODY_REF_SEAL_FIELDS,
  BOUNDARY_SEAL_FIELDS,
  CLAIMS_SEAL_FIELDS,
  MOLECULE_SEAL_FIELDS,
  sealCapsuleValues,
  verifyProjectionCore
} from "./core-capsules.mjs";
import { assertRejects, withProofCopy } from "./proof-utils.mjs";
import { assertDifferentOrigin, assertSameOrigin } from "./relation.mjs";

const MOLECULE_PROOF_CONSTITUTION = '{"parameters":{},"rule":"all"}';
const CHANGED_ORIGIN_PROOF_NUCLEUS = "changedOriginProofNucleus00000000000000000000000";
const SHORT_ORIGIN_PROOF_NUCLEUS = "shortOriginProofNucleus000000000000000000000000";
const LONG_ORIGIN_PROOF_NUCLEUS = "longOriginProofNucleus000000000000000000000000000";
const MOLECULE_PROOF_PEER_NUCLEUS = "moleculeProofPeerNucleus000000000000000000000000";
const DEFAULT_INSTANCE_COUNT = 3;
const MAX_INSTANCE_COUNT = 64;

export async function checkProjectionReplacement(root, options = {}) {
  const before = await verifyProjectionCore(root);
  const replacementRef =
    options.replacementRef ?? `${before.bodyRef.ref}.replacement-proof`;
  const instanceCount = normalizeInstanceCount(options.instanceCount);

  assertDifferent(replacementRef, before.bodyRef.ref, "replacement body ref");
  await verifyInvalidAtomNucleiRejected(root);
  await verifyChangedOriginDetected(root, before);
  await verifyInvalidBodyRefsRejected(root, before);
  await verifyInvalidBoundaryPublicRefsRejected(root, before);
  await verifyMoleculeOriginGrammar(root, before);
  await verifyBodyRefReplacement(root, before, replacementRef);
  await verifyCandidateProjectionMultiplicity(root, before, instanceCount);

  return {
    from: before.bodyRef.ref,
    replacementRef,
    instanceCount
  };
}

async function verifyInvalidBodyRefsRejected(root, before) {
  const invalidRefs = [
    { ref: "/candidate-body", message: "bounded relative path" },
    { ref: "../candidate-body", message: "bounded relative path" },
    { ref: ".candidate-body", message: "bounded relative path" },
    { ref: "candidate-body//nested", message: "bounded relative path" },
    { ref: "candidate-body\\nested", message: "bounded relative path" },
    { ref: "projection-root/core", message: "framework-reserved root" },
    { ref: "projection-root/framework/body", message: "framework-reserved root" }
  ];

  for (const invalidRef of invalidRefs) {
    await withProjectionCoreCopy(root, async (candidateRoot) => {
      await replaceBodyRef(candidateRoot, before.bodyRef, invalidRef.ref);

      await assertRejectsProjectionCore(
        candidateRoot,
        `invalid body ref ${invalidRef.ref}`,
        invalidRef.message
      );
    });
  }

  for (const invalidKind of ["", "group", "single/fleet"]) {
    await withProjectionCoreCopy(root, async (candidateRoot) => {
      await writeBodyRef(candidateRoot, {
        basis: before.bodyRef.basis,
        kind: invalidKind,
        ref: before.bodyRef.ref
      });

      await assertRejectsProjectionCore(
        candidateRoot,
        `invalid body ref kind ${invalidKind}`,
        "body ref kind"
      );
    });
  }
}

async function verifyInvalidAtomNucleiRejected(root) {
  for (const nucleus of [SHORT_ORIGIN_PROOF_NUCLEUS, LONG_ORIGIN_PROOF_NUCLEUS]) {
    await withProjectionCoreCopy(root, async (candidateRoot) => {
      await writeAtomOrigin(candidateRoot, nucleus);

      await assertRejectsProjectionCore(
        candidateRoot,
        `invalid atom nucleus length ${nucleus.length}`,
        "48-character token"
      );
    });
  }
}

async function verifyInvalidBoundaryPublicRefsRejected(root, before) {
  const invalidRules = [
    {
      label: "absolute boundary public ref",
      message: "bounded relative path",
      rules: {
        default: "closed",
        public: ["/projection-root/core/atom"]
      }
    },
    {
      label: "duplicate boundary public ref",
      message: "boundary rules.public must not contain duplicates",
      rules: {
        default: "closed",
        public: ["projection-root/core/atom", "projection-root/core/atom"]
      }
    },
    {
      label: "body boundary public ref",
      message: "current projection-core declarations",
      rules: {
        default: "closed",
        public: [before.bodyRef.ref]
      }
    },
    {
      label: "unknown boundary public ref",
      message: "current projection-core declarations",
      rules: {
        default: "closed",
        public: ["projection-root/core/unknown"]
      }
    }
  ];

  for (const invalid of invalidRules) {
    await withProjectionCoreCopy(root, async (candidateRoot) => {
      await writeBoundary(candidateRoot, {
        basis: before.boundary.basis,
        context: before.boundary.context,
        projection: before.boundary.projection,
        rules: stableStringify(invalid.rules)
      });

      await assertRejectsProjectionCore(candidateRoot, invalid.label, invalid.message);
    });
  }
}

async function verifyChangedOriginDetected(root, before) {
  await withProjectionCoreCopy(root, async (candidateRoot) => {
    await replaceOrigin(candidateRoot, before.origin);

    const candidate = await verifyProjectionCore(candidateRoot);

    assertDifferentOrigin(candidate.origin, before.origin, "changed origin proof");
  });
}

async function verifyMoleculeOriginGrammar(root, before) {
  await withProjectionCoreCopy(root, async (candidateRoot) => {
    const atoms = proofMoleculeAtoms(before.origin);

    await writeMoleculeOrigin(candidateRoot, before, {
      atoms,
      constitution: MOLECULE_PROOF_CONSTITUTION
    });

    const candidate = await verifyProjectionCore(candidateRoot);

    assertEqual(candidate.origin.kind, "molecule", "molecule proof origin kind");
    assertJsonList(candidate.origin.atomsList, atoms, "molecule proof atoms");
    assertEqual(
      candidate.origin.constitution,
      MOLECULE_PROOF_CONSTITUTION,
      "molecule proof constitution"
    );
  });
}

async function verifyBodyRefReplacement(root, before, replacementRef) {
  await withProjectionCoreCopy(root, async (candidateRoot) => {
    await replaceBodyRef(candidateRoot, before.bodyRef, replacementRef);

    const after = await verifyProjectionCore(candidateRoot);

    assertSameOrigin(after.origin, before.origin, "replacement");
    assertEqual(after.boundary.seal, before.boundary.seal, "replacement boundary seal");
    assertEqual(after.claims.seal, before.claims.seal, "replacement claims seal");
    assertEqual(after.bodyRef.basis, before.bodyRef.basis, "replacement body-ref basis");
    assertEqual(after.bodyRef.kind, before.bodyRef.kind, "replacement body-ref kind");
    assertEqual(after.bodyRef.ref, replacementRef, "replacement body-ref ref");
    assertDifferent(after.bodyRef.seal, before.bodyRef.seal, "replacement body-ref seal");
  });
}

async function verifyCandidateProjectionMultiplicity(root, before, instanceCount) {
  const seenContexts = new Set();
  const seenBodyRefs = new Set();

  for (let index = 1; index <= instanceCount; index += 1) {
    const candidateBodyRef = `${before.bodyRef.ref}.projection-${index}`;
    const context = `context:projection-proof:${index}`;

    await withProjectionCoreCopy(root, async (candidateRoot) => {
      await replaceBodyRef(candidateRoot, before.bodyRef, candidateBodyRef);
      await replaceBoundaryContext(candidateRoot, before.boundary, context);

      const candidate = await verifyProjectionCore(candidateRoot);

      assertSameOrigin(candidate.origin, before.origin, "candidate projection");
      assertEqual(
        candidate.boundary.projection,
        before.boundary.projection,
        "candidate projection boundary projection"
      );
      assertEqual(candidate.claims.seal, before.claims.seal, "candidate projection claims seal");
      assertEqual(candidate.boundary.context, context, "candidate projection boundary context");
      assertEqual(candidate.bodyRef.ref, candidateBodyRef, "candidate projection body-ref ref");
      assertDifferent(
        candidate.boundary.seal,
        before.boundary.seal,
        "candidate projection boundary seal"
      );
      assertDifferent(
        candidate.bodyRef.seal,
        before.bodyRef.seal,
        "candidate projection body-ref seal"
      );

      seenContexts.add(candidate.boundary.context);
      seenBodyRefs.add(candidate.bodyRef.ref);
    });
  }

  assertEqual(seenContexts.size, instanceCount, "candidate projection contexts");
  assertEqual(seenBodyRefs.size, instanceCount, "candidate projection body refs");
}

async function replaceOrigin(root, origin) {
  if (origin.kind === "atom") {
    await writeAtomOrigin(root, CHANGED_ORIGIN_PROOF_NUCLEUS);
    return;
  }

  const atoms = [...origin.atomsList];
  atoms[0] = proofPeerAtomCommitment();
  await writeMolecule(root, {
    atoms: atoms.sort(),
    constitution: origin.constitution
  });
}

async function writeAtomOrigin(root, nucleus) {
  const values = {
    nucleus
  };

  assertOneLine(values.nucleus, "changed origin proof token");
  await rm(path.join(root, "projection-root/core/molecule"), { recursive: true, force: true });
  await mkdir(path.join(root, "projection-root/core/atom"), { recursive: true });
  await writeValue(root, "projection-root/core/atom/nucleus", values.nucleus);
  await writeValue(
    root,
    "projection-root/core/atom/seal",
    sealCapsuleValues(values, ATOM_SEAL_FIELDS)
  );
}

async function writeMoleculeOrigin(root, before, molecule) {
  await writeMolecule(root, molecule);
  await replaceBodyRefBasis(root, before.bodyRef, "projection-root/core/molecule");
  await replaceBoundaryOrigin(root, before.boundary, "projection-root/core/molecule");
  await replaceClaimsBasis(root, before.claims, "projection-root/core/molecule");
}

async function writeMolecule(root, molecule) {
  const values = {
    atoms: jsonList(molecule.atoms),
    constitution: molecule.constitution
  };

  await rm(path.join(root, "projection-root/core/atom"), { recursive: true, force: true });
  await mkdir(path.join(root, "projection-root/core/molecule"), { recursive: true });
  await writeValue(root, "projection-root/core/molecule/atoms", values.atoms);
  await writeValue(root, "projection-root/core/molecule/constitution", values.constitution);
  await writeValue(
    root,
    "projection-root/core/molecule/seal",
    sealCapsuleValues(values, MOLECULE_SEAL_FIELDS)
  );
}

async function replaceBodyRef(root, currentBodyRef, ref) {
  assertOneLine(ref, "body-ref replacement ref");

  await writeBodyRef(root, {
    basis: currentBodyRef.basis,
    kind: currentBodyRef.kind,
    ref
  });
}

async function replaceBodyRefBasis(root, currentBodyRef, basis) {
  await writeBodyRef(root, {
    basis,
    kind: currentBodyRef.kind,
    ref: currentBodyRef.ref
  });
}

async function writeBodyRef(root, values) {
  await writeValue(root, "projection-root/core/body-ref/basis", values.basis);
  await writeValue(root, "projection-root/core/body-ref/kind", values.kind);
  await writeValue(root, "projection-root/core/body-ref/ref", values.ref);
  await writeValue(
    root,
    "projection-root/core/body-ref/seal",
    sealCapsuleValues(values, BODY_REF_SEAL_FIELDS)
  );
}

async function replaceBoundaryContext(root, currentBoundary, context) {
  assertOneLine(context, "boundary replacement context");

  await writeBoundary(root, {
    basis: currentBoundary.basis,
    context,
    projection: currentBoundary.projection,
    rules: currentBoundary.rules
  });
}

async function replaceBoundaryOrigin(root, currentBoundary, originRef) {
  await writeBoundary(root, {
    basis: originRef,
    context: currentBoundary.context,
    projection: originRef,
    rules: replaceBoundaryRulesOrigin(
      currentBoundary.rules,
      currentBoundary.projection,
      originRef
    )
  });
}

async function writeBoundary(root, values) {
  await writeValue(root, "projection-root/core/boundary/current/basis", values.basis);
  await writeValue(root, "projection-root/core/boundary/current/context", values.context);
  await writeValue(root, "projection-root/core/boundary/current/projection", values.projection);
  await writeValue(root, "projection-root/core/boundary/current/rules", values.rules);
  await writeValue(
    root,
    "projection-root/core/boundary/current/seal",
    sealCapsuleValues(values, BOUNDARY_SEAL_FIELDS)
  );
}

async function replaceClaimsBasis(root, currentClaims, basis) {
  const values = {
    basis,
    "body-ref": currentClaims["body-ref"],
    boundary: currentClaims.boundary
  };

  await writeValue(root, "projection-root/core/claims/current/basis", values.basis);
  await writeValue(
    root,
    "projection-root/core/claims/current/seal",
    sealCapsuleValues(values, CLAIMS_SEAL_FIELDS)
  );
}

async function withProjectionCoreCopy(root, callback) {
  return await withProofCopy(root, "projection-proof", ["projection-root/core"], callback);
}

async function writeValue(root, relativePath, value) {
  await writeFile(path.join(root, relativePath), `${value}\n`, "utf8");
}

async function assertRejectsProjectionCore(root, label, expectedMessage) {
  await assertRejects(() => verifyProjectionCore(root), label, expectedMessage);
}

function proofMoleculeAtoms(origin) {
  return [...origin.atomCommitments, proofPeerAtomCommitment()].sort();
}

function proofPeerAtomCommitment() {
  return sealCapsuleValues(
    {
      nucleus: MOLECULE_PROOF_PEER_NUCLEUS
    },
    ATOM_SEAL_FIELDS
  );
}

function normalizeInstanceCount(value) {
  if (value === undefined) {
    return DEFAULT_INSTANCE_COUNT;
  }

  const count = Number(value);

  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTANCE_COUNT) {
    throw new Error(`projection instance count must be an integer from 1 to ${MAX_INSTANCE_COUNT}`);
  }

  return count;
}

function jsonList(values) {
  return JSON.stringify([...values].sort());
}

function replaceBoundaryRulesOrigin(text, from, to) {
  const rules = JSON.parse(text);

  if (Array.isArray(rules.public)) {
    rules.public = rules.public.map((entry) => (entry === from ? to : entry));
  }

  return stableStringify(rules);
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

function assertOneLine(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  if (value.includes("\n") || value.includes("\t") || value.trim() !== value) {
    throw new Error(`${label} must contain exactly one trimmed line`);
  }
}

function assertDifferent(actual, expected, label) {
  if (actual === expected) {
    throw new Error(`${label} must change`);
  }
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
