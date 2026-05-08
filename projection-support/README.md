# Projection Support

This directory contains projection-specific operational support.

Manifests, locks, bootstrap or update scripts, doctors, workspace verifiers,
E2E proofs, generated support artifacts, and similar operational files belong
here rather than as ad hoc root entries.

`adoptions/capsule-base/workspace.json` is the support-owned Capsule Base
adoption witness for this fleet root. It proves the workspace root's shared
system layer without making the fleet manifest an implementation body.

This directory is not projection core, projection validity, body
implementation, policy, framework, kit, origin material, truth source, or a new
center.
