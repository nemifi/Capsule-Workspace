const CONTRACT_HEADERS = ["id", "obligation", "scope"];
const DEFAULT_ALLOWED_SCOPES = new Set([
  "agents",
  "body",
  "projection-core",
  "projection-framework",
  "projection-kit",
  "projection-policy",
  "projection-root/core",
  "projection-root/framework",
  "projection-root/kit",
  "projection-root/policy",
  "repository",
  "root-docs"
]);

export function verifyDocumentContract(text, options) {
  const {
    allowedScopes = DEFAULT_ALLOWED_SCOPES,
    expectedIdPrefix,
    label,
    requiredIds,
    requiredObligationTermsById = {}
  } = options;

  const records = readDocumentContract(text, label);

  assertNonEmptyRecords(records, label);
  assertSortedUnique(records, `${label} contract`);
  assertRequiredIds(records, requiredIds, `${label} contract`);

  for (const record of records) {
    assertContractId(record.id, `${record.id} id`);

    if (expectedIdPrefix !== undefined) {
      assertStartsWith(record.id, expectedIdPrefix, `${record.id} id`);
    }

    assertNonEmptyString(record.obligation, `${record.id} obligation`);
    assertRequiredObligationTerms(
      record.obligation,
      requiredObligationTermsById[record.id] ?? [],
      `${record.id} obligation`
    );
    assertNonEmptyList(record.scope, `${record.id} scope`);
    assertNoDuplicates(record.scope, `${record.id} scope`);

    for (const scope of record.scope) {
      assertInSet(scope, allowedScopes, `${record.id} scope`);
    }
  }

  return records;
}

export function readDocumentContract(text, label) {
  const section = /^## Verification Contract$/m.exec(text);
  if (!section || section.index === undefined) {
    throw new Error(`${label} must include ## Verification Contract`);
  }

  const fenceStart = text.indexOf("```txt", section.index);
  if (fenceStart === -1) {
    throw new Error(`${label} verification contract must use a txt code fence`);
  }

  const recordStart = text.indexOf("\n", fenceStart);
  const fenceEnd = text.indexOf("\n```", recordStart);
  if (recordStart === -1 || fenceEnd === -1) {
    throw new Error(`${label} verification contract code fence is not closed`);
  }

  const lines = text
    .slice(recordStart + 1, fenceEnd)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error(`${label} verification contract must include a header and records`);
  }

  const headers = splitContractLine(lines[0]);
  assertJsonList(headers, CONTRACT_HEADERS, `${label} verification contract headers`);

  return lines.slice(1).map((line, index) => {
    const values = splitContractLine(line);
    if (values.length !== CONTRACT_HEADERS.length) {
      throw new Error(
        `${label} verification contract record ${index + 1} field count: expected ${CONTRACT_HEADERS.length}, got ${values.length}`
      );
    }

    return Object.fromEntries(
      CONTRACT_HEADERS.map((header, valueIndex) => [
        header,
        parseContractValue(header, values[valueIndex])
      ])
    );
  });
}

function splitContractLine(line) {
  return line.split("|").map((value) => value.trim());
}

function parseContractValue(header, value) {
  if (header === "scope") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return value;
}

function assertContractId(value, label) {
  assertNonEmptyString(value, label);

  if (!/^[a-z][a-z0-9.-]*:[a-z][a-z0-9.-]*(?:-[a-z0-9.-]+)*$/.test(value)) {
    throw new Error(`${label}: invalid contract id ${JSON.stringify(value)}`);
  }
}

function assertNonEmptyRecords(records, label) {
  if (records.length === 0) {
    throw new Error(`${label} verification contract must include at least one record`);
  }
}

function assertRequiredIds(records, requiredIds, label) {
  const ids = new Set(records.map((record) => record.id));
  const missing = requiredIds.filter((id) => !ids.has(id));

  if (missing.length > 0) {
    throw new Error(`${label} missing required records: ${missing.join(", ")}`);
  }
}

function assertRequiredObligationTerms(obligation, terms, label) {
  assertNoDuplicates(terms, `${label} required terms`);

  for (const term of terms) {
    assertNonEmptyString(term, `${label} required term`);

    if (!obligation.includes(term)) {
      throw new Error(`${label}: expected obligation to include ${JSON.stringify(term)}`);
    }
  }
}

function assertSortedUnique(records, label) {
  const ids = records.map((record) => record.id);
  const sortedIds = [...ids].sort();
  assertJsonList(ids, sortedIds, `${label} ids must be sorted`);

  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} ids must be unique`);
  }
}

function assertNoDuplicates(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label}: must not contain duplicates`);
  }
}

function assertNonEmptyList(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}: expected non-empty list`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label}: expected one trimmed non-empty line`);
  }

  if (value.includes("\n") || value.includes("\t")) {
    throw new Error(`${label}: expected one trimmed non-empty line`);
  }
}

function assertStartsWith(value, prefix, label) {
  if (!value.startsWith(prefix)) {
    throw new Error(`${label}: expected prefix ${JSON.stringify(prefix)}, got ${JSON.stringify(value)}`);
  }
}

function assertInSet(value, set, label) {
  assertNonEmptyString(value, label);

  if (!set.has(value)) {
    throw new Error(`${label}: unexpected scope ${JSON.stringify(value)}`);
  }
}

function assertJsonList(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
