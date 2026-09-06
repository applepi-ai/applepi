# Outfitter File Structure

This document records the key repository file and directory structure used by Outfitter.
See [`./README.md`](./README.md) for runtime file conventions such as `.agents` layers, settings files, and generated composition directories.

> **RFC [#165](https://github.com/ai-outfitter/outfitter/issues/165) status:** the profile-era `profiles/` and `compositeProfile/` modules have been removed; `code/cli/src` now uses the dotagents pipeline (`resolver/`, `composer/`, `projection/`, `dump/`, `sources/`).
> Interactive `.agents` onboarding and explicit remote synchronization are implemented as `outfitter setup` and `outfitter sync`.

## Repository Layout

Outfitter is organized around a private npm workspace root, clear TypeScript package boundaries, requirement documents, and scenario-based tests.

```text
.                                      # repository root
├── .deepreview                        # root DeepWork review rules for project-wide checks
├── .deepwork/                         # DeepWork schemas and generated review instruction scratch files
│   └── schemas/                       # project-specific DeepSchema definitions
├── .github/                           # GitHub automation configuration
│   └── workflows/                     # GitHub Actions workflows and local .deepreview rules
├── .outfitter/                        # Outfitter's own project configuration
│   └── skills/outfitter/              # bundled self-documentation skill published into launches
├── docs/                              # documentation, architecture, requirements, plans, and specs
│   ├── architecture/                  # architecture and internal design docs
│   ├── documentation/                 # user-facing Outfitter docs, including the container runtime contract
│   ├── requirements/                  # formal OUTFITTER requirement documents
│   └── specs/                         # detailed supporting specs
├── .prettierignore                    # Prettier ignore rules
├── .prettierrc.json                   # Prettier formatting configuration
├── .snapperrc.toml                    # Snapper Markdown formatting configuration
├── CONTRIBUTING.md                    # local install and contributor workflow guide
├── container/                         # Dockerfile for the primary Debian-based published image
├── flake.nix                          # Nix package and development container outputs for the Outfitter CLI
├── flake.lock                         # pinned Nix flake inputs
├── code/                              # npm workspace packages and license-separated code areas
│   ├── cli/                           # @ai-outfitter/outfitter npm package root
│   │   ├── eslint.config.js           # CLI package ESLint configuration
│   │   ├── package.json               # published package metadata, bin, files, and package-local scripts
│   │   ├── scripts/                   # package-local helper scripts
│   │   │   ├── dev-install.mjs        # npm-link installer for local CLI development
│   │   │   └── sync-package-assets.mjs # prepack staging for root README/license, docs, the bundled skill, and enterprise notices
│   │   ├── src/                       # production TypeScript source
│   │   │   ├── cli.ts                 # executable CLI entry point
│   │   │   ├── cli/                   # CLI parser construction and command objects
│   │   │   │   └── commands/          # run, setup, sync, list, validate, dump, and link command objects
│   │   │   ├── settings/              # settings loading and merging
│   │   │   ├── telemetry/             # consent, pseudonymous state, allowlisted events, and PostHog boundary
│   │   │   ├── setup/                 # onboarding state + pinned default-catalog bootstrap
│   │   │   ├── sources/               # cache paths, atomic Git checkout, redaction, private-catalog gating, and transitive catalog-source expansion
│   │   │   │   ├── SourceState.ts     # versioned cache manifests, health inspection, and per-source repair locks
│   │   │   │   └── SourceCachePolicy.ts # repair, locked, and offline startup enforcement
│   │   │   ├── resolver/              # .agents layer resolution into one effective resource set
│   │   │   ├── composer/              # harness-neutral CompositionPlan from the effective set
│   │   │   ├── Chain.ts           # agent inheritance-chain resolution with cycle and parent checks
│   │   │   ├── Defaults.ts        # settings-layer agent_defaults selection, resolution, and provenance
│   │   │   └── Mcp.ts             # selected MCP server definitions after layer and owner precedence
│   │   │   ├── projection/            # materialize a composition + build pi/claude/codex launch plans
│   │   │   │   └── CodexMcp.ts        # translate selected MCP definitions to Codex TOML CLI overrides
│   │   │   ├── dump/                  # deterministic self-contained `.agents` tree output
│   │   │   ├── links/                 # opt-in managed projection of the composed tree into Claude Code and Codex homes
│   │   │   │   ├── HarnessHome.ts     # harness home resolution (CLAUDE_CONFIG_DIR, CODEX_HOME) and installed-harness detection
│   │   │   │   ├── HarnessLinkPlan.ts # scope selection, closure composition, and per-harness link entries
│   │   │   │   ├── HarnessLinkApply.ts # ownership manifest, conflict-preserving reconciliation, prune, and remove
│   │   │   │   └── HarnessMcp.ts      # harness CLI arguments for MCP add, get, and remove
│   │   │   ├── merge/                 # deterministic value and array merge policy helpers
│   │   │   ├── agents/                # process launch, configuration strategy, and adapter persistence bridges
│   │   │   │   ├── ClaudeConfigStrategy.ts        # inherit/isolated resolution plus the harness compatibility probe
│   │   │   │   ├── ClaudeStatePersistence.ts      # isolated-mode Claude credential/trust and project-session bridges
│   │   │   │   └── PiCredentialPersistence.ts     # durable Pi credential/provider seed and copy-back
│   │   │   ├── paths/                 # Outfitter cache root and repository/packaged asset resolution
│   │   │   ├── system/                 # root-owned launcher-scope system extension hook loading
│   │   │   ├── schemas/                # JSON Schemas for persisted config and typed workflow output values
│   │   │   └── validation/            # shared validation helpers
│   │   ├── tests/                     # automated CLI package tests and fixtures
│   │   ├── tsconfig.json              # strict package typecheck configuration
│   │   ├── tsconfig.build.json        # production emission from code/cli/src/ to code/cli/dist/
│   │   └── vitest.config.ts           # package test and coverage configuration
│   ├── enterprise/                    # enterprise/business licensed code; see code/enterprise/LICENSE
│   │   └── privateCatalog.js          # enterprise private profile catalog policy module used during package staging
│   └── pi-extension/                  # private workspace boundary for future Pi extension source/assets
├── bin/                               # local executable development helpers
├── scripts/                           # repository-level development, release, and formatting helper scripts
├── LICENSE.md                         # root source-available license notice
├── package-lock.json                  # locked npm workspace dependency graph
└── package.json                       # private npm workspace root and delegating scripts
```

The exact layout may evolve, but these boundaries should stay recognizable.
Root scripts delegate to the `@ai-outfitter/outfitter` workspace so commands such as `npm run check-ci` continue to work from the repository root.

Within a resolved `.agents` layer, an agent may include a harness-native Pi configuration overlay:

```text
agents/<agent>/
├── agent.md
├── config.json             # optional harness-neutral loadout overrides
└── pi/                     # copied into the temporary PI_CODING_AGENT_DIR
    ├── settings.json
    ├── keybindings.json
    └── ...                 # other native Pi configuration files/directories
```

The resolver retains every contributing `pi/` directory in layer-precedence order.
The Pi projection materializes them from lowest to highest precedence and skips symlinks; other harness projections do not consume them.

A generated dump MAY include `.agents/.outfitter/composition.json`.
This deterministic, removable audit record contains resolved inheritance and prompt provenance but no prompt contents, absolute paths, credentials, or runtime state; protocol consumers may ignore the `.outfitter/` metadata directory.

## Published Package Assets

The CLI package root is `code/cli`, but the npm package must still include repository-level notices.
The CLI package `prepack` script runs `code/cli/scripts/sync-package-assets.mjs`, which stages `README.md`, `LICENSE.md`, `code/enterprise/LICENSE`, and `code/enterprise/README.md` inside `code/cli` before `npm pack` or `npm publish`.

## Test Fixtures

Integration fixtures should live under `code/cli/tests/fixtures/integration/` with full `home/`, `project/`, and optional `expected/` trees.
Fixture-backed integration tests and shared harness helpers should live under `code/cli/tests/integration/`.

Scenario fixtures should live under `code/cli/tests/fixtures/scenarios/`, for example:

```text
code/cli/tests/fixtures/scenarios/
  profile-cycle/
  profile-inheritance-chain/
  profile-missing-inheritance/
  profile-multiple-inheritance/
  profile-precedence/
```

The `profile-*` scenarios above are the current profile-era fixtures; per the transition note, the implementation PRs that add the resolver and composition modules replace them with target-state scenarios whose fixtures include realistic `.agents` trees and expected resolution output.
Protocol conformance fixtures (layered trees plus expected effective output, pinned to the protocol revision) follow the same convention.
