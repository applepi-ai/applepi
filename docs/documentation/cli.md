# CLI reference

Global options:

| Option          | Description                  |
| --------------- | ---------------------------- |
| `-V, --version` | Print the Outfitter version. |
| `-h, --help`    | Show help for a command.     |

See [Telemetry](./telemetry.md) for the pseudonymous analytics event contract and opt-out controls.

## `outfitter run [agent] [args...]`

Resolve, compose, and launch an agent. `run` is the default command, so plain `outfitter` and `outfitter run` are equivalent.

| Argument / Option     | Description                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[agent]`             | Agent slug to run. Defaults to the settings `default_agent`.                                                                                                      |
| `--harness <harness>` | Harness to launch in: `pi`, `claude`, or `codex`. Defaults to `default_harness`.                                                                                  |
| `--log-level <level>` | Use `info` for quiet loading or `debug` for installer output.                                                                                                     |
| `--strict`            | Fail instead of warning when the adapter cannot project part of the composition.                                                                                  |
| `--isolated`          | Launch from the composition alone, ignoring your own harness configuration (trust, permissions, MCP servers, plugins). Claude only; the default is to inherit it. |
| `--retain-projection` | Keep the runtime projection directory after the run and print its path, for inspection.                                                                           |

Set `OUTFITTER_LOG_LEVEL=debug` to enable debug startup output without passing the option. The
`setup` command also accepts `--log-level` for its automatic profile launch.

Any other arguments and unrecognized options are passed through to the launched harness:

```bash
outfitter run engineer --harness claude
outfitter run engineer --harness codex -- exec "review this repo"
outfitter run persona-reviewer -- --print "summarize this repo"
```

Because `run` is the default command, leading flags that Outfitter does not own are forwarded to the harness automatically. With a configured `default_agent`, the following forms pass flags directly to Pi:

```bash
outfitter -r            # equivalent to: outfitter run -- -r
outfitter --resume      # equivalent to: outfitter run -- --resume
```

## `outfitter setup [source]`

Open the bundled Pi walkthrough using the original setup wording and sequence. Choose **Use the
default Outfitter profile catalog**, **Create your own profile**, or **Provide a different catalog
to import**; complete that branch; choose a home/project settings target; then choose the default
CLI agent. Pi/Outfitter is preselected. Passing `[source]` retains the original direct-source path
and starts at target selection. Pi hosts the deterministic setup UI without a model provider and
does not port or symlink harness configuration. The default picker always comes from
`ai-outfitter/community-profiles` at the immutable Release Please version tag pinned by the installed
Outfitter version; setup fetches or reuses that release through the normal source cache and writes
the same GitHub/ref pair to settings. It never reads a sibling checkout or a packaged catalog
fallback.

## `outfitter sync`

Synchronize remote sources and remote settings into the local cache. Sync validates local settings,
updates `remote_settings`, reloads the merged settings, and then updates the remote `sources` that
result. Each repository reports `updated`, `unchanged`, `skipped`, or `failed`.

Fetched content is validated in a temporary checkout before an atomic cache swap, so a failed fetch
or invalid update leaves the last valid cache available. Required-source failures and invalid
settings exit nonzero. Credentials embedded in URIs are redacted from status, errors, cache paths,
and Git output.

Sync is explicit: `outfitter run` never initiates network access. If a configured cache is absent,
resolution tells you to run `outfitter sync`.

## `outfitter list [kind]`

List resolvable resources across all layers, with the winning source for each slug and any shadowed IDs.

| Argument | Description                                                                |
| -------- | -------------------------------------------------------------------------- |
| `[kind]` | Optional filter: `agents`, `skills`, `knowledge`, `commands`, `workflows`. |

`--json` emits an object containing `ok`, `resources`, and `diagnostics`; diagnostics remain available when strict mode fails. Each workflow resource entry also contains a name-sorted `outputs` object with resolved output types, or `{}` when the workflow declares none. Non-JSON output is unchanged. See [OFTR-013: Workflow Contract](../requirements/OFTR-013-workflow-contract.md).

## `outfitter validate`

Validate the effective resource set: protocol layout, frontmatter, unresolved slugs in agent loadouts, broken or escaping skill references, workflow graphs and composed closures, and settings schema.

| Option     | Description                              |
| ---------- | ---------------------------------------- |
| `--strict` | Exit non-zero when warnings are present. |
| `--json`   | Print diagnostics as JSON.               |

## `outfitter dump`

Write the composed resource tree as a self-contained `.agents/` directory for review, vendoring, or air-gapped use. Identical sources, refs, and selections produce byte-identical output; dumps never contain credentials, sessions, caches, or other mutable runtime state.

| Option            | Description                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| `--agent <id>`    | Restrict the dump to one agent's transitive closure.                           |
| `--workflow <id>` | Export one workflow, its nested workflows, and every referenced agent closure. |
| `--out <dir>`     | Destination directory (default `./.agents`).                                   |

Workflow dumps are non-executable configuration bundles. They contain the canonical workflow YAML, composed agent resources, and a hash/provenance manifest whose `workflows[]` entries record resolved `outputs`. A workflow dump refuses an existing destination instead of replacing user files.

> **Tasks and `outfitter task bake`** — baking a task and its inputs into an immutable execution artifact — are the subject of a separate upcoming RFC and are not part of this command surface yet. See [Tasks](./tasks.md).

`outfitter run` verifies these caches before composition. Use
`--source-cache-policy <repair|locked|offline>` to override the configured startup policy.

## `outfitter link`

Project composed resources and native defaults into Pi, Claude Code, and Codex homes, so plain
`pi`, `claude`, and `codex` sessions carry shared configuration
without going through `outfitter run`. `run` still uses a temporary projection; `link` is the
opt-in persistent one. See [Linking into Claude Code and Codex](./linking-harnesses.md).

| Option             | Description                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `--harness <name>` | Harness home to link into: `pi`, `claude`, or `codex` (repeatable). Defaults to every harness on `PATH` or with an existing home. |
| `--agent <id>`     | Agent whose composed closure to link (repeatable).                                                                                |
| `--workflow <id>`  | Enabled workflow whose agent closures to link (repeatable).                                                                       |
| `--all`            | Link every resolvable agent, with its skills and commands.                                                                        |
| `--dry-run`        | Report what would change (`would create`, `would update`, `would prune`) without touching the home.                               |
| `--remove`         | Remove every entry this command created and forget it.                                                                            |
| `--strict`         | Exit non-zero on warnings, conflicts, or skipped entries.                                                                         |

```bash
outfitter link                                    # enabled workflows + default_agent, every installed harness
outfitter link --workflow engineer --harness claude
outfitter link --all --dry-run
outfitter link --remove
```

With no selection the scope is every enabled workflow root (`workflows:` in settings) plus
`default_agent`. Each scoped agent is composed the same way `run` and `dump` compose it, and its
subagents join the closure. The harness home is `$CLAUDE_CONFIG_DIR` (default `~/.claude`) or
`$CODEX_HOME` (default `~/.codex`); an explicit `--harness` creates the home if it is missing.

Ownership is recorded in `<harness home>/.outfitter/links.json`. `link` never overwrites, adopts, or
deletes anything it did not create: an unmanaged file, directory, or symlink in the way is reported
as a `conflict` and left alone. Re-running is idempotent (`unchanged`), a managed link whose target
vanished is `pruned`, and MCP servers already registered in the harness are left as they are.

## `outfitter sources`

Report local and remote source precedence, requested and resolved revisions, origins, and cache
health. `outfitter sources --json` emits stable credential-redacted machine-readable output.
