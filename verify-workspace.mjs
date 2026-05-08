#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
const workspace = JSON.parse(await readFile(path.join(workspaceRoot, "capsule-workspace.json"), "utf8"));

for (const projection of workspace.projections) {
  const bodyRoot = path.join(workspaceRoot, projection.path, projection.verify);
  run("npm", ["run", "verify"], bodyRoot, `${projection.role} body verify`);
}

const directoryBody = path.join(workspaceRoot, "Capsule Directory", "projection-body");
run("node", ["bin/capdir.mjs", "scan", workspaceRoot], directoryBody, "directory scan");

const osBody = path.join(workspaceRoot, "Capsule OS", "capsule-os-body");
const roots = workspace.projections.map((projection) => path.join(workspaceRoot, projection.path));
for (const goal of ["bootstrap", "fleet-update", "verify"]) {
  run("node", ["bin/capos.mjs", "route", goal, ...roots], osBody, `os route ${goal}`);
}

run("node", ["doctor-workspace.mjs"], workspaceRoot, "workspace doctor");
run("node", ["e2e-workspace.mjs"], workspaceRoot, "workspace e2e");

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
