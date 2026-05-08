import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function withProofCopy(root, label, relativePaths, callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), `${label}-`));

  try {
    for (const relativePath of relativePaths) {
      assertProofRelativePath(relativePath);

      const source = path.join(root, relativePath);
      const target = path.join(tempRoot, relativePath);

      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: true });
    }

    return await callback(tempRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function replaceText(root, relativePath, needle, replacement) {
  assertProofRelativePath(relativePath);

  const filePath = path.join(root, relativePath);
  const text = await readFile(filePath, "utf8");
  const occurrences = countOccurrences(text, needle);

  if (occurrences === 0) {
    throw new Error(`${relativePath} proof needle is missing: ${needle}`);
  }

  if (occurrences > 1) {
    throw new Error(`${relativePath} proof needle is not unique: ${needle}`);
  }

  await writeFile(filePath, text.replace(needle, () => replacement), "utf8");
}

export async function assertRejects(action, label, expectedMessage) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedMessage)) {
      return;
    }

    throw new Error(`${label}: expected ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(message)}`);
  }

  throw new Error(`${label}: expected rejection`);
}

function countOccurrences(text, needle) {
  if (needle.length === 0) {
    throw new Error("proof needle must be non-empty");
  }

  return text.split(needle).length - 1;
}

function assertProofRelativePath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`proof path must be a bounded relative path: ${relativePath}`);
  }
}
