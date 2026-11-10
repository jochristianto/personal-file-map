# Contributing to Personal File Map

Thanks for helping. Bug reports, ideas, documentation fixes and code are all welcome. This page explains how to set up the project, what a good change looks like, and how it gets merged.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug**: [open an issue](../../issues/new/choose) with the *Bug report* form. Say which app (macOS Apple Silicon, macOS Intel, Windows), what you did, and what happened. Attach `last-run.log` (see [Troubleshooting](README.md#troubleshooting)) if there is one. **Don't attach real bills or screenshots with personal data**; rename a sample file instead (`pnpm samples` makes plenty).
- **Suggest a feature**: open an issue with the *Feature request* form before writing code, so we can agree on the approach first.
- **Improve the docs**: small fixes can go straight to a pull request.
- **Fix a bug or build a feature**: comment on the issue so nobody else picks it up, then follow the steps below.

Security problems go through a private report instead, see [SECURITY.md](SECURITY.md).

## Set up

You need **macOS** (the `.app` bundles are built with macOS tools; the Windows `.exe` is cross-built), **Node.js 24** (version in [`.nvmrc`](.nvmrc)) and **pnpm 10** (`corepack enable` picks the version from `package.json`).

```bash
git clone <your fork's URL>
cd bills
nvm use          # or install the Node version in .nvmrc
corepack enable
pnpm install
pnpm samples     # ~200 sample bills in out/
```

On Windows or Linux you can still work on everything except the macOS bundles: `pnpm typecheck`, `pnpm samples` and `pnpm dev` all work, and `pnpm build` builds the `.exe` and skips the `.app` bundles. Linux isn't a supported platform for the app itself (no folder picker, for example), but it's fine for development.

## Develop

| Command | What |
|---|---|
| `pnpm dev` | Bundle and run once with Node, without packaging. The settings window opens; the command returns when you close it. |
| `BILLS_DIR=out pnpm dev` | Same, on the sample bills in `out/` |
| `pnpm typecheck` | TypeScript check (CI runs this) |
| `pnpm build` | The real apps in `out/` (CI runs this) |
| `pnpm samples [year] [month]` | Regenerate the sample bills |

Useful environment variables for `pnpm dev`: `BILLS_TODAY=2026-11-10` fakes today's date, `BILLS_NO_OPEN=1` doesn't open the PDF, `BILLS_NO_WINDOW=1` prints the window's address instead of opening a window. For the electricity meter reader, `BILLS_ANTHROPIC_BASE_URL` / `BILLS_OPENAI_BASE_URL` point it at a mock server, so you can test without an API key or credit.

[How it works](README.md#how-it-works) and [Project structure](README.md#project-structure) in the README walk through the code.

### Things to keep in mind

- **The packaged app can't read `node_modules`.** Anything needed at runtime (fonts, the settings page, defaults) must be imported so esbuild inlines it. If it works with `pnpm dev` but not in the built app, this is usually why.
- **Nothing leaves the computer.** The app has no network access beyond its own `127.0.0.1` server, no analytics and no update checks. Changes that add network calls won't be merged.
- **The bills folder is precious.** The app only lowercases extensions and converts HEIC to JPG. Anything that renames, moves or deletes a user's files needs a very good reason and a discussion first.
- **Both platforms.** Code in `platform.ts` has macOS and Windows branches; if you change one, check the other. Say in the PR which ones you tested on.
- **No new runtime dependencies without asking.** Every dependency ends up inside a ~60 MB app that people trust with their finances.

### Style

- TypeScript, `strict` mode, no `any` unless there's no way around it.
- Match the surrounding code: 2-space indent, double quotes, semicolons, short comments that say *why*.
- User-facing text is plain and short. Update the README when behaviour or the settings window changes.

## Pull requests

1. Fork the repo and create a branch from `main` (`fix/heic-rotation`, `feature/yearly-schedule`).
2. Make the change. Keep a PR to one topic; unrelated clean-up goes in its own PR.
3. Check it:
   ```bash
   pnpm typecheck
   pnpm build
   BILLS_DIR=out pnpm dev   # generate a report from the samples and look at it
   ```
4. Commit with a message that says what changes, in the imperative: *Show quarterly bills in the overview*, not *fixed stuff*.
5. Open the PR and fill in the template. Screenshots of the settings window or the PDF help a lot for visible changes.

GitHub Actions builds every PR on macOS (typecheck + all three apps). The built apps are attached to the run as an artifact for 14 days, so reviewers can try them without building. A maintainer reviews, may ask for changes, and squash-merges when it's ready.

### After merging

Every merge to `main` rebuilds the apps and replaces the **latest** release on the [Releases page](../../releases/latest). There's nothing extra to do.

## Contribution terms

Personal File Map is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE), not under an OSI open-source license. When you submit a contribution (code, docs, images or anything else) you agree that:

1. you wrote it, or otherwise have the right to submit it;
2. it's licensed to everyone under the same terms as the project ([LICENSE](LICENSE)); and
3. you grant the project's copyright holder a perpetual, worldwide, royalty-free, irrevocable license to use, modify and relicense your contribution, including under other terms such as a commercial license.

Point 3 keeps the project able to offer a commercial license or change its license later without tracking down every contributor. If you can't agree to it, say so in the PR before it's merged.

Mark your commits with `Signed-off-by` (`git commit -s`) to confirm the above.
