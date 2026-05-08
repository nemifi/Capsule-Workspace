#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const supportRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.dirname(supportRoot);
const lockPath = path.join(supportRoot, "capsule-workspace.lock.json");
const lock = JSON.parse(await readFile(lockPath, "utf8"));

const updated = {
  ...lock,
  projections: lock.projections.map((projection) => {
    validateLockEntry(projection);
    const root = path.join(workspaceRoot, projection.path);
    const commit = git(root, ["rev-parse", "HEAD"]).stdout.trim();
    const remote = git(root, ["remote", "get-url", "origin"]).stdout.trim();
    return {
      commit,
      path: projection.path,
      remote,
      role: projection.role,
    };
  }),
};

await writeFile(lockPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
console.log("capsule workspace lock updated");

function validateLockEntry(projection) {
  for (const key of ["path", "role"]) {
    if (typeof projection[key] !== "string" || projection[key].trim() !== projection[key] || projection[key].length === 0) {
      throw new Error(`workspace lock projection missing ${key}`);
    }
  }
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed in ${cwd}`);
  }
  return result;
}
