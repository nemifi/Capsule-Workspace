#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.dirname(supportRoot);
const workspace = JSON.parse(await readFile(path.join(supportRoot, "capsule-workspace.json"), "utf8"));
const projectionByRole = new Map(workspace.projections.map((projection) => [projection.role, projection]));

for (const projection of workspace.projections) {
  const bodyRoot = path.join(workspaceRoot, projection.path, projection.verify);
  run("npm", ["run", "verify"], bodyRoot, `${projection.role} body verify`);
}

const directoryBody = projectionBodyRoot("capsule-directory");
run("node", ["bin/capdir.mjs", "scan", workspaceRoot], directoryBody, "directory scan");

const osBody = projectionBodyRoot("capsule-os");
const roots = workspace.projections.map((projection) => path.join(workspaceRoot, projection.path));
for (const goal of ["bootstrap", "fleet-update", "verify"]) {
  run("node", ["bin/capos.mjs", "route", goal, ...roots], osBody, `os route ${goal}`);
}
runCapabilityGraph(osBody, roots);

run("node", ["projection-support/doctor-workspace.mjs"], workspaceRoot, "workspace doctor");
run("node", ["projection-support/e2e-workspace.mjs"], workspaceRoot, "workspace e2e");

console.log("capsule workspace: ok");

function run(command, args, cwd, label) {
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

  const summary = (result.stdout || result.stderr).trim().split("\n").filter(Boolean).at(-1);
  console.log(`[ok] ${label}${summary ? `: ${summary}` : ""}`);
}

function projectionBodyRoot(role) {
  const projection = projectionByRole.get(role);
  if (!projection) {
    throw new Error(`workspace projection role not declared: ${role}`);
  }
  return path.join(workspaceRoot, projection.path, projection.verify);
}

function runCapabilityGraph(cwd, roots) {
  const result = spawnSync("node", ["bin/capos.mjs", "capability-graph", ...roots, "--json"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error("os capability graph failed");
  }

  const graph = JSON.parse(result.stdout);
  if (graph.gaps.length > 0) {
    throw new Error(`os capability graph has ${graph.gaps.length} gaps`);
  }
  console.log(`[ok] os capability graph: ${graph.summary.capabilities} capabilities, ${graph.summary.invocations} invocations, no gaps`);
}
