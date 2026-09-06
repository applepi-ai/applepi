# Catalogs

A catalog is a git repository that publishes a `.agents` payload — agents, skills, workflows, tasks, knowledge, commands — so a person, team, or organization can share it. You can bootstrap a machine or project from one, or add one as an ongoing source that Outfitter keeps synchronized.

```bash
outfitter setup https://github.com/ncrmro/.agents
```

The repository names are discovery and distribution conventions; the payload is always the same protocol-shaped tree (pinned protocol revision [`502a9d5`](https://github.com/aj47/dotagentsprotocol-website/blob/502a9d5f886d0aad8d3da83c03354bdfa4b389e7/src/components/Structure.astro)):

| Convention                        | Purpose                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `owner/.agents` or `owner/.agent` | A shareable personal or team catalog.                                            |
| `owner/.outfitter`                | An organization/control repository distributing org-wide resources and settings. |

## Standalone `.agents` repositories (preferred)

The primary catalog pattern is a standalone repository whose **root is the payload** — the flat dotagents layout:

```text
ncrmro/.agents/            # repository root
  agents.md
  system-prompt.md
  agents/
    engineer/
      agent.md
      skills/                 # skills private to engineer
        release-debug/SKILL.md
    founder/agent.md
  skills/
    wiki/SKILL.md
    research/SKILL.md
  tasks/
    weekly-kpis/task.md
  knowledge/
  workflows/
    engineer/workflow.yaml
  settings.yml             # Outfitter settings (optional; see settings.md)
  settings.local.yml       # gitignored machine-local overrides
```

This is the same layout as `~/.agents/` — a standalone catalog is simply a global layer under version control. That makes it the natural home for personal dotagents development: clone it as `~/.agents` (or point your settings at the checkout), iterate locally, and open pull requests to move improvements upstream into shared catalogs. See [Local development](./local-development.md) for the full workflow.

## Colocated `.agents/` directories (fallback)

When agent configuration should travel with a codebase, colocate the payload as a `.agents/` subdirectory beside the code:

```text
payments-service/
  .agents/
    agents/
    skills/
    settings.yml
  src/
  docs/
```

The colocated tree doubles as the protocol's workspace overlay: its resources merge by ID over the global and remote layers for anyone running in that project. Prefer the standalone pattern for anything you intend to share across projects; prefer colocation only for resources that are meaningless outside the one repository.

## Consuming a catalog

Add the repository to `sources` in your [settings](./settings.md):

```yaml
# ~/.agents/settings.yml
sources:
  - github: my-org/.agent # owner/repo shorthand
    ref: 2f9c1ab0d3e44b6f9d2c8a17e5b40c91d6f3a8e2 # pin a commit, tag, or branch
  - github: my-org/payments-service
    ref: v1.2.0
    path: .agents # colocated payload inside the repo
  - uri: git+https://git.example.com/team/agents.git # any git URI
```

Each source entry is one of:

- `path:` — a local directory (no `ref`; read live from disk).
- `github:` — an `owner/repo` GitHub shorthand.
- `uri:` — any git-cloneable URI, for non-GitHub hosts.

Remote entries additionally accept:

- `ref:` — a tag, branch, or commit to pin. With a `ref`, `outfitter sync` fetches exactly that ref. Without one, sync fast-forwards the default branch.
- `path:` — the payload directory inside the repository, for colocated layouts.

Resources from all sources resolve by slug behind local layers, following [layer precedence](./concepts.md#layer-precedence). Agent-local skills keep their owning-agent namespace through cache and source merging. Outfitter reports shadowed IDs so consumers can see which source supplies a selected resource.

### Workflows are configuration, not an execution engine

Each `workflows/<slug>/workflow.yaml` is a typed graph that names its human, agent, tool, and system actors. Agent actors reference ordinary catalog profiles. Node-level skill, prompt, and MCP assertions must already belong to the selected agent's composed closure. Nested workflow references resolve by slug and may not form cycles.

A workflow can publish typed output declarations. An action node declares the output type directly;
a nested-workflow node maps one of the nested workflow's declared outputs:

```yaml
outputs:
  pull-request:
    from: draft # an action node in this workflow
    type: pull-request
  review-verdict:
    from: review # a nested-workflow node in this workflow
    output: verdict # declared by the nested workflow
```

The closed type set is `pull-request`, `git-commit`, `git-branch`, and `issue`. A mapped output
inherits the nested output's resolved type, including through multiple nesting levels.

A node's `needs` list expresses ordering only among nodes in the same workflow. Cross-task
prerequisites are an execution engine's responsibility: the engine evaluates them against declared,
typed outputs rather than treating a workflow node edge as a task dependency.

`outfitter validate --strict` validates the graph, output mappings, and complete composed dependency
closure. `outfitter dump --workflow <slug>` produces a reviewable `.agents` bundle for distribution.
Outfitter never schedules or executes the graph. See
[OFTR-013: Workflow Contract](../requirements/OFTR-013-workflow-contract.md) for the normative
contract.

#### Recording values

Outfitter declares outputs but does not record their concrete values; that belongs to the execution
engine. A runtime carrying a value over A2A should use `outfitter-task/v1` artifact metadata with
`output` set to the declared name, `type` set to its resolved type, and `value` validated against the
corresponding output-type schema.

### Catalog dependencies (transitive sources)

A catalog can depend on other catalogs by declaring `sources` in its own settings file
(`settings.yml` at its payload root, or `.agents/settings.yml`). Outfitter resolves those
declarations transitively: syncing and resolving a catalog also fetches and layers the catalogs it
declares, so one pinned root pulls in its dependency closure.

Transitive sources are deliberately the narrowest safe subset — a `github:` shorthand pinned to an
immutable ref — while the [remote-catalog trust model](https://github.com/ai-outfitter/outfitter/issues/212)
is defined. Anything else a catalog declares is skipped with a warning:

- **`github:` shorthand only.** A transitive source must be a `github: owner/repo` shorthand. A
  `uri:` source declared by a catalog is skipped, because a URI can name an arbitrary git transport
  (for example a local path or a remote helper) that a dependency should not be able to choose on
  your behalf. Keeping to `github:` also routes every transitive fetch that `outfitter sync`
  performs through the same private-catalog gate as your own sources. (The one exception is the
  first-party default catalog's own closure, fetched during setup — see the note below.)
- **Whole repository only.** A transitive `github:` source may not carry a `path:` subpath, so a
  declaration can never point outside the repository it fetches.
- **Pinned only.** A transitive source must pin an immutable `ref:` — a full commit SHA, or a
  version tag such as `v1.2.0`. A commit SHA is truly immutable; a version tag is a pin the
  dependency's maintainer could later move, in which case the next `outfitter sync` fetches the
  new commit and reports it as `updated`. Pin dependencies you rely on to a SHA when you need the
  closure to never change underneath you.
- **Content only.** A depended-on catalog contributes `.agents` payload resources. Nothing else in
  its settings file — default agent, default harness, cache directory, `remote_settings` — takes
  effect transitively.
- **Lower precedence.** Every source you configure directly outranks every transitive source;
  deeper dependencies rank below shallower ones.
- Cycles and duplicates resolve once — the first occurrence wins and resolution terminates.

A fresh `outfitter` install fetches this closure during setup, so a default profile whose skills
live in a depended-on catalog works without a manual sync. Because the default catalog is the
first-party catalog Outfitter ships (pinned in the CLI), its bootstrap fetches the declared closure
directly; the interactive private-catalog prompt is a property of `outfitter sync`, which is where
you add your own third-party sources.

## Organization control repositories

An `owner/.outfitter` repository distributes organization-wide resources plus shared settings that Outfitter layers below each user's local settings:

```yaml
# ~/.agents/settings.yml
remote_settings:
  - github: my-org/.outfitter
    path: .agents/settings.yml # file path inside the repo
    ref: 9c47d1e2b8a05f36c4d7e90a12b3f8c5d6e71a04
```

Remote settings are cached locally and merged at lower precedence than your project and user settings, so anything you set locally wins. This is how an organization distributes shared sources, agents, and defaults without controlling each user's machine. See the [organization catalog use case](./usecases/organization-profile-catalog.md).

## Syncing and updating

`outfitter sync` synchronizes every remote source into the local cache:

1. Local settings are validated. Remote settings repositories are cloned or updated first, then
   merged settings are reloaded.
2. Remote sources (including any added by remote settings) are cloned or updated.
3. Sources declared by the synced catalogs themselves (see
   [catalog dependencies](#catalog-dependencies-transitive-sources)) are fetched next, repeating
   until the whole dependency closure is cached.
4. Each synced source is validated; sync reports `updated`, `unchanged`, `skipped`, or `failed` per source.

All repositories live under `<cache_directory>/repos/<encoded-uri-and-ref>/` (default
`~/.agents/cache`). Pinned (`ref:`) sources stay on their selected ref until you change it; unpinned
sources resolve the remote's current default branch on every sync.

Fetch and validation happen in a temporary sibling directory. Outfitter swaps a valid checkout into
place atomically, so a failed fetch or invalid update preserves the last working cache. A required
source failure makes sync exit nonzero. `outfitter run` remains offline with respect to source
synchronization; run sync explicitly when you want network updates.

## Private repositories

Private GitHub catalogs are an enterprise feature. When sync detects a private GitHub repository, it asks for confirmation before use and records the decision in your user settings. Review the Outfitter Enterprise license or your enterprise agreement before enabling private catalogs. Non-GitHub `uri:` sources use whatever git credentials your environment already has; credentials embedded in URIs are redacted from sync output.

### How sync authenticates

Outfitter does not collect, store, or validate credentials. It delegates to `git`, so a private catalog clones with whatever credentials the surrounding environment already gives `git` — which differs by where sync runs:

| Where          | Credential                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your machine   | Your existing git configuration: SSH agent, credential helper, or `.netrc`.                                                                       |
| GitHub Actions | The workflow token, configured for git — see [token-permissions.md](https://github.com/ai-outfitter/actions/blob/main/docs/token-permissions.md). |
| A cluster pod  | Supplied by the deployment: `GIT_ASKPASS` over HTTPS, or `GIT_SSH_COMMAND` for a deploy key.                                                      |

Two failure modes are worth knowing before you hit them:

- **Credentials belong in the environment, not the URI.** Outfitter redacts credentials from a source URI before deriving its cache path, so a URI carrying a username produces a cache entry that later runs do not read. The source URI must be byte-identical everywhere it appears.
- **`outfitter run` does not sync.** A runtime that has never synced has an empty cache and cannot resolve a profile from it, however good its credentials are.

[The forge credential model](../architecture/forge-credential-model.md) covers which credential to use where, and why.

## Trust and review

Adding a catalog source means trusting its authors with your agent runtime. A catalog's resources can shape prompts and policy (agents, `agents.md`, `system-prompt.md`), add MCP servers (`mcp.json`), and ship skills whose scripts execute on your machine.

Before adding a source, review it:

1. Read the agent definitions, `agents.md`, and `system-prompt.md` you will compose.
2. Read every skill you will select, including its scripts and catalog-owned `file` references (see the [trust boundary](./skills.md#trust-boundary)).
3. Review `mcp.json` — MCP servers are code with whatever access you grant them.
4. Check `remote_settings` targets: a settings file can add further sources you did not review.
5. Check the catalog's own `sources`: its pinned `github:` dependencies are fetched transitively, so
   review each one like the catalog itself.
6. Confirm the repository's ownership and that its maintainers are who you expect.

**Pin a `ref:`** — ideally a full commit SHA — for any catalog you do not maintain yourself, and always for catalogs consumed in CI (see [Running tasks in GitHub Actions](./actions.md)). A pinned ref makes updates an explicit, reviewable action — bump the ref after reviewing the diff — instead of silently pulling whatever the catalog publishes next.
