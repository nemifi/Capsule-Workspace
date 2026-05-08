import { readFile } from "node:fs/promises";
import path from "node:path";

const CONCEPT_HEADERS = [
  "id",
  "layer",
  "strength",
  "depends_on",
  "may_be_adopted_by",
  "must_not_become",
  "verifier_role",
  "note"
];

const CONCEPT_STRENGTHS = new Set([
  "absolute",
  "core-required",
  "universal-framework",
  "common-optional",
  "body-local"
]);

export async function verifyConceptRecords(root, relativePath, options) {
  const {
    allowedStrengths,
    allowedDependencyPrefixes,
    expectedIdPrefix,
    expectedLayer,
    knownDependencyIds = [],
    requiredIds
  } = options;

  const records = await readConceptRecords(root, relativePath);
  const knownIds = new Set([
    ...knownDependencyIds,
    ...records.map((record) => record.id)
  ]);
  const localIds = new Set(records.map((record) => record.id));

  assertNonEmptyRecords(records, relativePath);
  assertSortedUnique(records, relativePath);
  assertRequiredIds(records, requiredIds, relativePath);

  for (const record of records) {
    assertEqual(record.layer, expectedLayer, `${record.id} layer`);
    assertStartsWith(record.id, expectedIdPrefix, `${record.id} id`);
    assertInSet(record.strength, CONCEPT_STRENGTHS, `${record.id} strength`);
    assertAllowed(record.strength, allowedStrengths, `${record.id} strength`);
    assertNonEmptyList(record.depends_on, `${record.id} depends_on`);
    assertNoDuplicates(record.depends_on, `${record.id} depends_on`);
    assertNotIncludes(record.depends_on, record.id, `${record.id} depends_on`);
    assertKnownReferences(record.depends_on, {
      allowedPrefixes: allowedDependencyPrefixes,
      knownIds,
      label: `${record.id} depends_on`
    });
    assertNonEmptyList(record.may_be_adopted_by, `${record.id} may_be_adopted_by`);
    assertNoDuplicates(record.may_be_adopted_by, `${record.id} may_be_adopted_by`);
    assertNonEmptyList(record.must_not_become, `${record.id} must_not_become`);
    assertNoDuplicates(record.must_not_become, `${record.id} must_not_become`);
    assertIncludes(record.must_not_become, "nucleus", `${record.id} must_not_become`);
    assertNonEmptyString(record.verifier_role, `${record.id} verifier_role`);
    assertNonEmptyString(record.note, `${record.id} note`);
  }

  assertAcyclicDependencies(records, localIds, relativePath);

  return records;
}

export async function readConceptRecords(root, relativePath) {
  return readRecords(root, relativePath, CONCEPT_HEADERS);
}

export async function readRecords(root, relativePath, expectedHeaders) {
  const text = await readText(root, relativePath);
  return parseRecordTable(text, relativePath, expectedHeaders);
}

async function readText(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function parseRecordTable(text, label, expectedHeaders) {
  const section = /^## Records$/m.exec(text);
  if (!section || section.index === undefined) {
    throw new Error(`${label} must include ## Records`);
  }

  const fenceStart = text.indexOf("```txt", section.index);
  if (fenceStart === -1) {
    throw new Error(`${label} records must use a txt code fence`);
  }

  const recordStart = text.indexOf("\n", fenceStart);
  const fenceEnd = text.indexOf("\n```", recordStart);
  if (recordStart === -1 || fenceEnd === -1) {
    throw new Error(`${label} records code fence is not closed`);
  }

  const lines = text
    .slice(recordStart + 1, fenceEnd)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error(`${label} records must include a header and at least one record`);
  }

  const headers = splitRecordLine(lines[0]);
  assertJsonList(headers, expectedHeaders, `${label} record headers`);

  return lines.slice(1).map((line, index) => {
    const values = splitRecordLine(line);
    if (values.length !== expectedHeaders.length) {
      throw new Error(
        `${label} record ${index + 1} field count: expected ${expectedHeaders.length}, got ${values.length}`
      );
    }

    return Object.fromEntries(
      expectedHeaders.map((header, valueIndex) => [
        header,
        parseValue(header, values[valueIndex])
      ])
    );
  });
}

function splitRecordLine(line) {
  return line.split("|").map((value) => value.trim());
}

function parseValue(header, value) {
  if (["depends_on", "may_be_adopted_by", "must_not_become"].includes(header)) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return value;
}

function assertNonEmptyRecords(records, label) {
  if (records.length === 0) {
    throw new Error(`${label} must include at least one record`);
  }
}

function assertSortedUnique(records, label) {
  const ids = records.map((record) => record.id);
  const sortedIds = [...ids].sort();
  assertJsonList(ids, sortedIds, `${label} record ids must be sorted`);

  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} record ids must be unique`);
  }
}

function assertRequiredIds(records, requiredIds, label) {
  const ids = new Set(records.map((record) => record.id));
  const missing = requiredIds.filter((id) => !ids.has(id));

  if (missing.length > 0) {
    throw new Error(`${label} missing required records: ${missing.join(", ")}`);
  }
}

function assertAllowed(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label}: expected one of ${JSON.stringify(allowed)}, got ${JSON.stringify(value)}`);
  }
}

function assertKnownReferences(values, options) {
  const { allowedPrefixes = [], knownIds, label } = options;

  for (const value of values) {
    const allowedPrefix = allowedPrefixes.find((prefix) => value.startsWith(prefix));
    if (!allowedPrefix) {
      throw new Error(`${label}: unexpected reference ${JSON.stringify(value)}`);
    }

    if (knownIds.has(value)) {
      continue;
    }

    throw new Error(`${label}: unknown reference ${JSON.stringify(value)}`);
  }
}

function assertIncludes(values, expected, label) {
  if (!values.includes(expected)) {
    throw new Error(`${label}: expected to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(values, unexpected, label) {
  if (values.includes(unexpected)) {
    throw new Error(`${label}: must not include ${JSON.stringify(unexpected)}`);
  }
}

function assertNoDuplicates(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label}: must not contain duplicates`);
  }
}

function assertAcyclicDependencies(records, localIds, label) {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const visiting = new Set();
  const visited = new Set();

  for (const record of records) {
    visit(record, []);
  }

  function visit(record, stack) {
    if (visited.has(record.id)) {
      return;
    }

    if (visiting.has(record.id)) {
      throw new Error(`${label} dependency cycle: ${[...stack, record.id].join(" -> ")}`);
    }

    visiting.add(record.id);

    for (const dependency of record.depends_on) {
      if (localIds.has(dependency)) {
        visit(recordsById.get(dependency), [...stack, record.id]);
      }
    }

    visiting.delete(record.id);
    visited.add(record.id);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}: expected non-empty string`);
  }
}

function assertNonEmptyList(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}: expected non-empty list`);
  }
}

function assertStartsWith(value, prefix, label) {
  assertNonEmptyString(value, label);

  if (!value.startsWith(prefix)) {
    throw new Error(`${label}: expected prefix ${JSON.stringify(prefix)}, got ${JSON.stringify(value)}`);
  }
}

function assertInSet(value, set, label) {
  assertNonEmptyString(value, label);

  if (!set.has(value)) {
    throw new Error(`${label}: unexpected value ${JSON.stringify(value)}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertJsonList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
