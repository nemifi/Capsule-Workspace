#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { verifyProjectionCore } from "../../framework/verify/core-capsules.mjs";
import { checkProjectionFramework } from "../../framework/verify/framework.mjs";
import { checkProjectionReplacement } from "../../framework/verify/replacement.mjs";
import { verifyPolicyOrigin } from "./origin.mjs";
import { checkProjectionPolicy } from "./policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ROOT_SURGERY_ENV = "PROJECTION_ROOT_SURGERY";
const ROOT_OPERATION_ENV = "PROJECTION_ROOT_OPERATION";
const args = process.argv.slice(2);
const rootSurgeryIndex = args.indexOf("--root-surgery");
if (rootSurgeryIndex !== -1) {
  args.splice(rootSurgeryIndex, 1);
  process.env[ROOT_SURGERY_ENV] = "1";
}
const operationIndex = args.indexOf("--operation");
if (operationIndex !== -1) {
  const operationPath = args[operationIndex + 1];
  if (!operationPath || operationPath.startsWith("--")) {
    throw new Error("--operation requires an artifact path");
  }
  args.splice(operationIndex, 2);
  process.env[ROOT_OPERATION_ENV] = operationPath;
}
const mode = args[0] ?? "--policy";
const instanceCount = args[1];

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
  } else if (mode === "--origin") {
    await verifyPolicyOrigin(root);
    console.log("[verify] projection policy origin ok");
  } else if (mode === "--policy") {
    await checkProjectionPolicy(root);
    console.log("[verify] projection policy ok");
  } else {
    throw new Error(`Unknown verify mode: ${mode}`);
  }
} catch (error) {
  console.error(`[verify] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
