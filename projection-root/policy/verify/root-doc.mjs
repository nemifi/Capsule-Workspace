import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyDocumentContract } from "../../framework/verify/doc-contracts.mjs";

export async function readRootDocument(root, relativePath) {
  assertRootDocumentPath(relativePath);
  return readFile(path.join(root, relativePath), "utf8");
}

export function assertTitle(text, expected, label) {
  assertEqual(firstLine(text), expected, `${label} title`);
}

export function assertRequiredSections(text, required, label) {
  assertOrderedIncludes(readSections(text), required, `${label} sections`);
}

export function assertNoCurrentBodyPath(text, bodyRefOrPath, label) {
  const bodyRef = typeof bodyRefOrPath === "string"
    ? { kind: "single", ref: bodyRefOrPath }
    : bodyRefOrPath;

  if (bodyRef.kind === "fleet") {
    return;
  }

  const bodyPath = bodyRef.ref;
  const pathLikeNeedles = [
    `\`${bodyPath}\``,
    `\`${bodyPath}/`,
    `${bodyPath}/`,
    `](${bodyPath}`,
    `](${bodyPath}/`
  ];

  for (const needle of pathLikeNeedles) {
    if (text.includes(needle)) {
      throw new Error(`${label} must not name the current body path`);
    }
  }

  if (hasSpecificPathToken(bodyPath) && pathTokenPattern(bodyPath).test(text)) {
    throw new Error(`${label} must not name the current body path`);
  }
}

export function assertVerificationContract(text, options) {
  verifyDocumentContract(text, options);
}

function firstLine(text) {
  return text.split("\n")[0] ?? "";
}

function readSections(text) {
  return [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
}

function hasSpecificPathToken(value) {
  return /[^A-Za-z0-9]/.test(value);
}

function pathTokenPattern(value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s\`"'(\\[])${escaped}($|[\\s\`"')\\],.;:])`);
}

function assertRootDocumentPath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`root document path must be a bounded relative path: ${relativePath}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOrderedIncludes(actual, required, label) {
  let start = 0;

  for (const section of required) {
    const index = actual.indexOf(section, start);
    if (index === -1) {
      throw new Error(
        `${label}: missing required section ${JSON.stringify(section)} in ${JSON.stringify(actual)}`
      );
    }

    start = index + 1;
  }
}
