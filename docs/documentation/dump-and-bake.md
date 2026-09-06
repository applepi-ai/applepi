# Dump

`outfitter dump` is an output of Outfitter's resolver — the same resolver that backs `list`, `validate`, and `run`, so what you inspect is exactly what executes.

## Dump

`outfitter dump` writes the composed resource tree as a plain `.agents/` directory you can commit, diff, and review through a normal pull request:

```bash
outfitter dump --out ./review
outfitter dump --agent engineer --out ./engineer   # one agent's transitive closure only
outfitter dump --workflow engineer --out ./workflow # graph + nested graphs + agent closures
```

Use dumps to:

- **Review** exactly what an organization or project composition resolves to before approving a source bump.
- **Vendor** a self-contained tree into a repository for air-gapped or provenance-sensitive environments.
- **Debug** layer and merge behavior by diffing dumps before and after a change.

## Guarantees

- **Deterministic** — identical sources, refs, and selections produce byte-identical output.
- **Self-contained** — the dumped tree resolves with no remote sources and no cache.
- **Safe** — a dump may include reviewable source provenance, but never credentials, auth state, sessions, transcripts, caches, backups, mutable harness state, or symlinks escaping the tree.
- **Protocol-shaped** — the output is a valid `.agents` payload usable by any protocol consumer, not just Outfitter. Any Outfitter-specific provenance metadata is namespaced, JSON-based, and removable without losing the underlying resources.
- **Harness-discoverable** — selected agent-local skills are flattened into top-level `skills/<id>/` in the closure output, with their packaged references, scripts, and assets intact.
- **Workflow-auditable** — workflow exports preserve canonical YAML and record every nested workflow, its resolved typed `outputs`, agent composition, file hash, and winning source in `.outfitter/workflow-composition.json`. Each `workflows[]` entry has an `outputs` object (empty when none are declared). See [OFTR-013: Workflow Contract](../requirements/OFTR-013-workflow-contract.md).

## Bake

> **Status: future RFC.** Baking a repeatable unit of work and its structured inputs into an immutable execution artifact for headless runs is part of the [tasks](./tasks.md) design, which is being specified separately. Dump above already gives a deterministic, self-contained tree for an agent; the additional guarantees baking adds around inputs and task contracts are deferred to that RFC.
