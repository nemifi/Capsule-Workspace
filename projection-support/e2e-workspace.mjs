#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.dirname(supportRoot);
const workspace = JSON.parse(await readFile(path.join(supportRoot, "capsule-workspace.json"), "utf8"));
const projectionByRole = new Map(workspace.projections.map((projection) => [projection.role, projection]));
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "capsule-workspace-e2e-"));
const targetRoot = path.join(tempRoot, "Generated Projection");
const specPath = path.join(tempRoot, "spec.json");
const planPath = path.join(tempRoot, "update-plan.json");
const applyReportPath = path.join(tempRoot, "apply-report.json");

try {
  await writeFile(specPath, JSON.stringify({
    body: {
      packageName: "workspace-e2e-body"
    },
    bodyPath: "projection-body",
    bodyTemplate: "minimal",
    boundary: {
      limits: [
        "body-owned implementation stays outside projection-root/core",
        "adopted Capsule Base system files stay outside origin material"
      ],
      publicRefs: [
        "projection-root/core/atom",
        "projection-root/core/claims/current",
        "projection-root/core/boundary/current",
        "projection-root/core/body-ref"
      ]
    },
    description: "Temporary projection used by the Capsule workspace E2E proof.",
    name: "Workspace E2E Projection"
  }, null, 2) + "\n", "utf8");

  const baseRoot = projectionRoot("capsule-base");
  const generatorBody = projectionBodyRoot("capsule-generator");
  const directoryBody = projectionBodyRoot("capsule-directory");
  const updaterBody = projectionBodyRoot("capsule-updater");
  const osBody = projectionBodyRoot("capsule-os");

  step("generate projection", "node", ["bin/capgen.mjs", "create", specPath, "--out", targetRoot, "--base", baseRoot], generatorBody);
  step("verify generated projection", "node", ["bin/capgen.mjs", "verify", targetRoot], generatorBody);
  step("inspect generated projection", "node", ["bin/capdir.mjs", "inspect", targetRoot], directoryBody);
  step("route generated verification", "node", ["bin/capos.mjs", "route", "verify", targetRoot], osBody);
  step("plan generated update", "node", ["bin/capupd.mjs", "plan", targetRoot, "--base", baseRoot, "--out", planPath], updaterBody);
  step("preflight generated update", "node", ["bin/capupd.mjs", "preflight", planPath, "--base", baseRoot], updaterBody);
  step("apply generated update", "node", ["bin/capupd.mjs", "apply", planPath, "--base", baseRoot, "--out", applyReportPath], updaterBody);
  step("inspect applied projection", "node", ["bin/capdir.mjs", "inspect", targetRoot], directoryBody);
  step("route applied verification", "node", ["bin/capos.mjs", "route", "verify", targetRoot], osBody);

  console.log("capsule workspace e2e: ok");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function step(label, command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${label} failed`);
  }
  const summary = result.stdout.trim().split("\n").filter(Boolean).at(-1);
  console.log(`[ok] ${label}${summary ? `: ${summary}` : ""}`);
}

function projectionRoot(role) {
  const projection = projectionByRole.get(role);
  if (!projection) {
    throw new Error(`workspace projection role not declared: ${role}`);
  }
  return path.join(workspaceRoot, projection.path);
}

function projectionBodyRoot(role) {
  const projection = projectionByRole.get(role);
  if (!projection) {
    throw new Error(`workspace projection role not declared: ${role}`);
  }
  return path.join(workspaceRoot, projection.path, projection.verify);
}
