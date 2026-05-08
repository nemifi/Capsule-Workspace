#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = await readJson("capsule-workspace.lock.json");
const allowDirty = process.argv.includes("--allow-dirty");

for (const projection of lock.projections) {
  validateLockEntry(projection);
  const target = path.join(workspaceRoot, projection.path);

  if (!existsSync(target)) {
    run("git", ["clone", projection.remote, projection.path], workspaceRoot, `clone ${projection.role}`);
  } else {
    ensureGitRepo(target, projection);
    if (!allowDirty) {
      ensureClean(target, projection);
    }
  }

  run("git", ["fetch", "--tags", "origin"], target, `fetch ${projection.role}`);
  run("git", ["checkout", "--detach", projection.commit], target, `checkout ${projection.role}`);
  console.log(`[ok] ${projection.role}: ${projection.commit.slice(0, 7)}`);
}

console.log("capsule workspace bootstrap: ok");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

function validateLockEntry(projection) {
  for (const key of ["commit", "path", "remote", "role"]) {
    if (typeof projection[key] !== "string" || projection[key].trim() !== projection[key] || projection[key].length === 0) {
      throw new Error(`workspace lock projection ${projection.role ?? projection.path ?? ""} missing ${key}`);
    }
  }
  if (path.isAbsolute(projection.path) || projection.path.includes("\\") || projection.path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`workspace lock projection path must be portable: ${projection.path}`);
  }
  if (!/^[a-f0-9]{40}$/.test(projection.commit)) {
    throw new Error(`workspace lock projection commit must be a full sha: ${projection.path}`);
  }
}

function ensureGitRepo(target, projection) {
  const result = run("git", ["rev-parse", "--is-inside-work-tree"], target, `inspect ${projection.role}`, { quiet: true });
  if (result.stdout.trim() !== "true") {
    throw new Error(`${projection.path} exists but is not a git worktree`);
  }
}

function ensureClean(target, projection) {
  const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], target, `status ${projection.role}`, { quiet: true }).stdout.trim();
  if (status.length > 0) {
    throw new Error(`${projection.path} has local changes; commit, clean, or rerun with --allow-dirty`);
  }
}

function run(command, args, cwd, label, options = {}) {
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
  if (!options.quiet) {
    const summary = result.stdout.trim().split("\n").filter(Boolean).at(-1);
    if (summary) {
      console.log(`[ok] ${label}: ${summary}`);
    }
  }
  return result;
}
