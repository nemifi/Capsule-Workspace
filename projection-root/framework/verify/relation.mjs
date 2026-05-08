export function assertSameOrigin(actual, expected, label) {
  if (!isSameOriginRelation(actual, expected)) {
    throw new Error(`${label} origin relation must remain unchanged`);
  }
}

export function assertDifferentOrigin(actual, expected, label) {
  if (isSameOriginRelation(actual, expected)) {
    throw new Error(`${label} origin relation must change`);
  }
}

function isSameOriginRelation(left, right) {
  return left.ref === right.ref && left.originCommitment === right.originCommitment;
}
