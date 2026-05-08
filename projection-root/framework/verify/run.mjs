#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkProjectionReplacement } from "./replacement.mjs";
import { verifyProjectionCore } from "./core-capsules.mjs";
import { checkProjectionFramework } from "./framework.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const mode = process.argv[2] ?? "--framework";
const instanceCount = process.argv[3];

try {
  if (mode === "--core") {
    await verifyProjectionCore(root);
    console.log("[verify] projection core ok");
  } else if (mode === "--framework") {
    await checkProjectionFramework(root);
    console.log("[verify] projection framework ok");
  } else if (mode === "--replacement") {
    await checkProjectionReplacement(root, { instanceCount });
    console.log("[verify] projection replacement ok");
  } else {
    throw new Error(`Unknown verify mode: ${mode}`);
  }
} catch (error) {
  console.error(`[verify] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
