#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== "--remote") {
    throw new Error(`unknown option: ${arg}`);
  }
}
const checkRemote = args.has("--remote");
const workspace = await readJson("capsule-workspace.json");
const lock = await readJson("capsule-workspace.lock.json");
const lockByPath = new Map(lock.projections.map((projection) => [projection.path, projection]));
const roots = workspace.projections.map((projection) => path.join(workspaceRoot, projection.path));
const baseBody = path.join(workspaceRoot, "Capsule Base", "capsule-base-body");
const directoryBody = path.join(workspaceRoot, "Capsule Directory", "projection-body");
const osBody = path.join(workspaceRoot, "Capsule OS", "capsule-os-body");

let hasAttention = false;
console.log("Capsule workspace doctor");

for (const projection of workspace.projections) {
  const root = path.join(workspaceRoot, projection.path);
  const head = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.trim();
  const expected = lockByPath.get(projection.path)?.commit;
  const locked = expected === head ? "locked" : "lock-drift";
  const clean = status.length === 0 ? "clean" : "dirty";
  if (locked !== "locked" || clean !== "clean") {
    hasAttention = true;
  }
  console.log(`- ${projection.role}: ${clean}, ${locked}, ${head.slice(0, 7)}`);

  if (checkRemote) {
    const remote = lockByPath.get(projection.path)?.remote;
    if (!remote || !expected) {
      hasAttention = true;
      console.log(`- remote ${projection.role}: attention`);
      continue;
    }
    if (await remoteCommitFetchable(remote, expected)) {
      console.log(`- remote ${projection.role}: fetchable`);
    } else {
      hasAttention = true;
      console.log(`- remote ${projection.role}: attention`);
    }
  }
}

for (const projection of workspace.projections) {
  const adoptionPolicy = projection.adoptionPolicy ?? "optional";
  if (!["none", "optional", "required"].includes(adoptionPolicy)) {
    hasAttention = true;
    console.log(`- adoption ${projection.role}: invalid policy ${adoptionPolicy}`);
    continue;
  }
  if (adoptionPolicy === "none") {
    console.log(`- adoption ${projection.role}: not applicable`);
    continue;
  }

  const targetRoot = path.join(workspaceRoot, projection.path);
  const report = run("node", ["verify/adoption.mjs", targetRoot, "--require-current"], baseBody);
  if (report.status === 0) {
    console.log(`- adoption ${projection.role}: current`);
  } else if (adoptionPolicy === "optional") {
    console.log(`- adoption ${projection.role}: none declared`);
  } else {
    hasAttention = true;
    console.log(`- adoption ${projection.role}: attention`);
  }
}

const scan = run("node", ["bin/capdir.mjs", "scan", workspaceRoot], directoryBody);
if (scan.status === 0) {
  const summary = scan.stdout.trim().split("\n").filter(Boolean).at(-1);
  console.log(`- directory scan: ${summary}`);
} else {
  hasAttention = true;
  console.log("- directory scan: attention");
}

for (const goal of ["bootstrap", "fleet-update", "verify"]) {
  const route = run("node", ["bin/capos.mjs", "route", goal, ...roots], osBody);
  if (route.status === 0 && route.stdout.includes("ok: yes")) {
    console.log(`- route ${goal}: ok`);
  } else {
    hasAttention = true;
    console.log(`- route ${goal}: attention`);
  }
}

const graph = run("node", ["bin/capos.mjs", "capability-graph", ...roots, "--json"], osBody);
if (graph.status === 0) {
  const report = JSON.parse(graph.stdout);
  const gapCount = report.gaps.length;
  if (gapCount === 0) {
    console.log(`- capability graph: ${report.summary.capabilities} capabilities, ${report.summary.invocations} invocations, no gaps`);
  } else {
    hasAttention = true;
    console.log(`- capability graph: attention (${gapCount} gaps)`);
  }
} else {
  hasAttention = true;
  console.log("- capability graph: attention");
}

if (hasAttention) {
  console.log("capsule workspace: attention");
  process.exit(1);
}

console.log("capsule workspace: healthy");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

function git(cwd, args) {
  const result = run("git", args, cwd);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result;
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function remoteCommitFetchable(remote, commit) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "capsule-remote-doctor-"));
  try {
    const init = run("git", ["init", "-q"], tempRoot);
    if (init.status !== 0) {
      throw new Error(init.stderr.trim() || "git init failed for remote doctor");
    }
    return run("git", ["fetch", "--dry-run", remote, commit], tempRoot).status === 0;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
