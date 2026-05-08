# Capsule Workspace

This folder is the integration workspace for the Capsule projections.

## Projections

```txt
Capsule Base       shared projection system bundle and adoption proof
Capsule Generator  projection capsule materializer
Capsule Directory  read-only projection discovery and snapshot layer
Capsule Updater    safe Capsule Base update planner and applier
Capsule OS         operating layer for discovery, routing, invocation, and evidence
```

## Ideal Flow

```txt
Base publishes the shared system layer.
Generator creates projection capsules from specs.
Directory discovers readable projections and capabilities.
OS resolves routes and coordinates bounded workflows.
Updater plans and applies Base updates to adopting projections.
OS and Directory observe the updated fleet again.
```

## Verify

Run the workspace proof from this folder:

```sh
node verify-workspace.mjs
```

That command verifies every body, scans the workspace with Capsule Directory,
checks the OS routes for `bootstrap`, `fleet-update`, and `verify`, runs the
OS capability graph with no declaration gaps, runs the workspace doctor, and
completes a temporary generate/discover/route/update apply/reobserve E2E proof.

## Doctor

Use the doctor when you want a quick health read without running every proof:

```sh
node doctor-workspace.mjs
```

It checks child repo cleanliness, lock drift, Base adoption currency, Directory
scan health, the main OS routes, and the cross-projection capability graph.

Base adoption expectations are declared per projection in
`capsule-workspace.json` as `adoptionPolicy: none | optional | required`.
The current workspace treats Base and Generator as non-adopters, and requires
current Base adoption for Directory, Updater, and OS.

## Lock

`capsule-workspace.lock.json` records the expected commit for each child
projection. Update it whenever the workspace intentionally moves to new child
repo commits.

## Bootstrap

Recreate the child projection checkouts from the lock:

```sh
node scripts/bootstrap-workspace.mjs
```

The script clones missing child repos, fetches existing child repos, and checks
out each locked commit. Existing child repos must be clean unless
`--allow-dirty` is passed.

## Update Lock

After intentionally moving child repos, refresh the lock from local HEADs:

```sh
node scripts/update-lock.mjs
```
