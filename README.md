# Bills Overview

A double-click app for macOS and Windows that turns a folder of monthly bill files into a one-glance PDF report: **what's been paid, what's still due this month, and what's missing**.

You keep doing what you already do: save each bill, receipt or payment screenshot as `YYYYMM Name.ext` in a folder. Double-click the app in that folder: a settings window opens where you pick the bills folder and say when each bill is due. Click **Generate report**, and `bills-overview.output.pdf` opens with:

- **Overview page:** paid vs. still due this month, missing files, year-to-date coverage, latest upload, a files-per-month chart, highlights, and a *Housekeeping* list of files that couldn't be read.
- **Matrix pages:** every bill (grouped by first word) × every month, marked *file found* / *due this month* / *missing*, with a status per bill.

No terminal, Node or other installs are needed to run it: the runtime is inside the app. Generating the app (once, from this repo) does need Node, see below.

---

## Generate the app and sample data

The repo contains only source code. The apps and the sample bills are generated into **`out/`**, which is git-ignored.

**Prerequisites:** macOS (the `.app` is assembled with macOS tools; the Windows `.exe` is cross-built on the Mac), [Node.js](https://nodejs.org) 24 (the version is in [`.nvmrc`](.nvmrc); with nvm, run `nvm use`), [pnpm](https://pnpm.io) 10 (`corepack enable` sets it up from `package.json`, or see [pnpm.io/installation](https://pnpm.io/installation)) and an internet connection for the first build. All commands run in the repo root.

**1. Install the dependencies**

```bash
pnpm install
```

**2. Generate the sample data** (optional, to try the app without your own bills)

```bash
pnpm samples
```

This writes ~200 generic bills straight into `out/`, where the apps go too: monthly, quarterly, irregular and one-off bills for the current year up to the current month, plus a few deliberately wrong files that show up under *Housekeeping*. Running it again replaces them. For another year or "current" month, pass them explicitly:

```bash
pnpm samples 2026 11
```

**3. Generate the app**

```bash
pnpm build
```

This creates:

| File | For |
|---|---|
| `out/bills-overview.app` | macOS on Apple Silicon |
| `out/bills-overview-intel.app` | macOS on Intel |
| `out/bills-overview.exe` | Windows x64 |

Nothing else is left behind: intermediate files are made in a temporary folder that's deleted after every build, even a failed one. The first build downloads the Node runtimes that get packed into the apps (about 60 MB each, cached afterwards), so it takes a minute; later builds are faster. [`config.default.json`](config.default.json) is compiled in: change it and rebuild to change the defaults new `config.local.json` files start from.

**4. Try it on the samples**

The app and the sample bills are now side by side in `out/`, so just double-click `out/bills-overview.app` in Finder (or `out\bills-overview.exe` on Windows), or:

```bash
open out/bills-overview.app
```

The settings window opens with every sample bill listed as *monthly*. Click **Generate report**: the report opens and is saved as `out/bills-overview.output.pdf`, next to a new `out/config.local.json`.

Everything generated (`out/`, `node_modules/`, plus any `config.local.json` or `bills-overview.output.pdf` the app writes) is git-ignored. Delete it any time and generate it again.

## Quick start

1. Get the app: **`bills-overview.app`** (macOS, Apple Silicon) or **`bills-overview.exe`** (Windows x64), see [Generate the app](#generate-the-app-and-sample-data).
2. Copy it **into the folder with your bills**, e.g. `My Drive/Bills/Monthly Bills/2026`.
3. **Double-click it.** The settings window opens (see [Settings window](#settings-window)) with every bill it found set to *monthly*. Change the bills that aren't monthly.
4. Click **Generate report**. Only now is anything written: your settings are saved to `config.local.json` next to the app, and `bills-overview.output.pdf` is written and opened. Run it whenever you add files; the window opens with your saved settings, and the PDF is overwritten each time. Closing the window quits the app.

For a new year, copy the app and your `config.local.json` into the new year's folder.

**First launch notes**

- **macOS** may ask to let *Bills Overview* access files (for example on Google Drive). Click **Allow**. If you said no, re-enable it under System Settings → Privacy & Security → Files & Folders.
- **macOS**: if the app says it's "running from a temporary location", drag it to another folder and back in Finder, then open it again.
- **Windows** may show a SmartScreen warning because the app isn't signed: *More info → Run anyway*. A console window flashes as it starts.
- **The settings window** is a page the app serves on your own computer (nothing goes online), shown as a standalone app window by Microsoft Edge (Windows) or Google Chrome / Edge / Brave (macOS) with a profile of its own, so your normal browser is untouched. Without one of those, it opens in your default browser instead.

## Naming your files

```
YYYYMM Name.ext
```

| Part | Example | Notes |
|---|---|---|
| `YYYYMM` | `202603` | Year + month (01–12) the bill belongs to |
| space | | exactly one is expected (extra spaces are tolerated) |
| `Name` | `Internet Payment` | Anything; the same name across months = the same bill |
| `.ext` | `.pdf` | `pdf`, `png`, `jpg`, `jpeg` or `heic` |

Examples: `202601 Rent.pdf`, `202603 Internet Payment.jpg`, `202604 Meter 01 Photo 1 Before.jpg`.

- Bills that share a **first word** are grouped in the report (`Insurance Car`, `Insurance Health` → *Insurance*).
- The **year** is taken from the folder name if it's like `2026`, otherwise from the file names.
- Several files for one bill in one month (e.g. `.pdf` and `.jpg`) count once.
- Files that don't fit (wrong month like `202600`, a different year, unsupported type, no `YYYYMM` prefix) are skipped and listed under *Housekeeping*.

**The app tidies the folder** the same way the old script did: uppercase extensions are lowercased (`IMG.JPG` → `IMG.jpg`), and `.heic` photos are converted to `.jpg` (the `.heic` is removed afterwards; an existing `.jpg` is never overwritten). Nothing else is modified.

## Settings window

Every option is set in the window; there's no need to edit files. The bill list fills the left of the window; the bills folder and the schedule guide sit in a sidebar on the right (a quarter of the width) that stays in view while you scroll. In a narrow window they stack, folder first.

| In the window | Saved in `config.local.json` as |
|---|---|
| **Bills folder** (type it, or **Browse…**) | `"folder"`; a folder inside the app's folder is saved as `"./…"` |
| **Monthly** | `"monthly"` |
| **Quarterly** | `"quarterly"` |
| **Every N months** (N picked from 1–12), from / until | `{ "every": N, "from": …, "until": … }` |
| **Specific months**, from / until | `{ "months": [ … ], "from": …, "until": … }` |
| **Irregular** | `"irregular"` |
| **Not scheduled** | `null` |
| **+ Add bill** / **✕** | adds / removes a key |

- **What the schedules mean** (in the sidebar, collapsible) shows each schedule type side by side: an example of its months, whether empty months are flagged as *missing* / *due*, and when to use it.
- Under the folder it shows where that resolves to and how many files and bills it found. Each bill shows its expected months (dark) and the months with a file (green dot), and which files its name covers.
- Bills found in the folder that no name covers are listed with a **New** badge as *monthly*, the same thing the app used to add to `config.local.json` by itself. Change them before generating, or leave them.
- If macOS blocks the folder (e.g. on Google Drive), the message has an **Open Privacy & Security settings** button that opens Files & Folders, and the folder is checked again when you come back to the window.
- Problems (a bill without a name, a name listed twice, a *Specific months* bill with no month picked, a missing folder) are shown in place, and **Generate report** waits until they're fixed.
- **Generate report** (or ⌘/Ctrl + Enter) saves `config.local.json`, then tidies the folder and writes the PDF exactly as before. Afterwards **Open PDF** and **Show in Finder/Explorer** appear; change something and generate again as often as you like.
- If `config.local.json` was broken by hand, the window says why and starts from the defaults; generating replaces the file.

## Configuration

The settings live in **`config.local.json`**, next to the app. The window reads and writes it; you can still edit it by hand. It's created from the app's built-in defaults ([`config.default.json`](config.default.json)) the first time you click **Generate report**:

```json
{
  "folder": "./",
  "bills": {
    "Rent": "monthly",
    "Insurance Car": "quarterly",
    "Meter 02": "irregular",
    "Property Tax": { "months": [1] },
    "Mortgage": { "every": 1, "from": 3 },
    "Charity": null
  }
}
```

### `folder`

Where the bill files are, relative to `config.local.json`. `"./"` (the default) means the app's own folder. Relative paths (`"./samples"`, `"../2026"`), absolute paths and `"~/…"` work. On Windows use forward slashes (`"G:/My Drive/Bills/2026"`) or double backslashes. The PDF is written into that folder; `config.local.json` stays next to the app.

### `bills`

Which months each bill is expected. Nothing is guessed: a bill is only flagged as *due* or *missing* according to this list.

| Value | Expected months |
|---|---|
| `"monthly"` | every month |
| `"quarterly"` | Jan, Apr, Jul, Oct |
| `{ "months": [1, 7] }` | exactly those months |
| `{ "every": 2, "from": 3 }` | every 2 months starting March |
| `"from"` / `"until"` (1–12) | add to any `{…}` form to limit the range, e.g. `{ "every": 1, "until": 5 }` for a cancelled subscription |
| `"irregular"` | none: shown with checkmarks, never flagged |
| `null` | none: shown as *Not scheduled* |

- A key matches the bill with that exact name **or every bill that starts with it**: `"Meter 01"` covers `Meter 01 Photo 1 Before`, `Meter 01 Photo 2 After`, … When several keys match, the longest wins (`"Internet Payment"` beats `"Internet"`). Matching ignores case.
- A scheduled **past** month without a file is **missing**; the **current** month without a file is **due**.
- **New bills are added for you**: the window lists bills that no key covers yet as *monthly* (badge **New**), and they're saved when you generate. A bill whose file appears after the window scanned the folder is still appended as `"monthly"` and mentioned under *Housekeeping*.
- Keys that match no bill are listed under *Housekeeping*.

## Development

All commands run in the repo root (after `pnpm install`):

| Command | What |
|---|---|
| `pnpm build` | Generate `out/bills-overview.app` and `out/bills-overview.exe` (see [above](#generate-the-app-and-sample-data)) |
| `pnpm samples [year] [month]` | Generate sample bills in `out/` |
| `pnpm typecheck` | TypeScript check |
| `pnpm dev` | Bundle and run once with Node, without packaging (nothing is left behind) |

To run without double-clicking, e.g. on the samples: `BILLS_DIR=out pnpm dev`. The settings window opens; `pnpm dev` returns when you close it. `BILLS_DIR` stands in for the app's folder (without it, the current folder is used); `BILLS_TODAY=2026-11-10` fakes today's date; `BILLS_NO_OPEN=1` skips opening the PDF; `BILLS_NO_WINDOW=1` only prints the window's address (open it in any browser).

### How it works

`src/main.ts` runs once per double-click and opens the settings window (`window.ts`):

1. **Window**: an HTTP server on `127.0.0.1` with a random port and a random token in every URL (requests with another `Host` are refused) serves `window.html`, opened as an app window (`platform.ts`: Edge/Chrome `--app` with its own profile in the app's settings folder, else the default browser). The page keeps an event stream open; when the window closes and it doesn't reconnect within a few seconds, the app quits.
2. **Load** (`config.ts`): `config.local.json` next to the app (`locate.ts` finds the app's folder, including inside a `.app` bundle), or the built-in `config.default.json` if there's none yet. The window also scans the bills folder read-only (`scan.ts`) to list the bills found; nothing is renamed or written.
3. **Generate** (only on the button): check the settings, save them to `config.local.json` (other keys like `_help` are kept), then `generate.ts` runs the report as before:
   1. **Scan** (`scan.ts`): lowercase extensions, convert HEIC to JPG, then parse `YYYYMM Name.ext` files. Everything else becomes a *Housekeeping* note.
   2. **Update config**: bills no key covers yet are appended to `config.local.json` as `"monthly"`.
   3. **Analyze** (`analyze.ts`): per bill and month, *paid* / *missing* / *due* / *none* / *future* from the schedules; groups by first word; stats for the overview page.
   4. **Render** (`pdf.ts`): A4 landscape PDF with pdfkit and embedded Inter fonts; overview page plus a paginated matrix.
   5. **Write and open** `bills-overview.output.pdf`.

`build.mjs` bundles everything into one JS file with esbuild (fonts, the settings page and `config.default.json` inlined; pdfkit's `import.meta.url` is shimmed for CJS), packages it with `@yao-pkg/pkg` for macOS arm64/x64 and Windows x64, wraps the macOS binaries in `.app` bundles (icon from `scripts/icon.mjs`, ad-hoc signed), and puts both `.app` bundles and the `.exe` in `out/`. All intermediates live in a temporary folder that's removed when the build ends. Anything read at runtime must be inside the bundle: the packaged app can't read files from `node_modules`.

`scripts/make-samples.mjs` draws its own JPG/PNG images (`jpeg-js`, `pngjs`) and PDF receipts, so it runs anywhere Node does.

## Project structure

```
.
├── README.md               ← you are here
├── package.json            scripts and dependencies (pnpm)
├── pnpm-lock.yaml
├── config.default.json     defaults compiled into the app
├── build.mjs               bundle (esbuild) → executables (pkg) → .app / .exe in out/
├── scripts/
│   ├── icon.mjs            draws the app icon
│   └── make-samples.mjs    generates the sample bills in out/
├── src/
│   ├── main.ts             entry point: opens the settings window, quits when it closes
│   ├── window.ts           settings window server: load, preview, save + generate
│   ├── window.html         the settings window page
│   ├── generate.ts         scan → analyze → PDF → write
│   ├── config.ts           config.local.json / defaults, schedules, key matching
│   ├── locate.ts           where the app lives, year detection
│   ├── scan.ts             folder clean-up and file parsing
│   ├── analyze.ts          paid / due / missing per bill and month, stats
│   ├── pdf.ts              the report (pdfkit, Inter font)
│   └── platform.ts         app window, dialogs, folder picker, opening files on macOS / Windows
└── out/                    generated, git-ignored
    ├── bills-overview.app  pnpm build (Apple Silicon)
    ├── bills-overview-intel.app   pnpm build (Intel Mac)
    ├── bills-overview.exe  pnpm build
    ├── YYYYMM Name.*       sample bills (pnpm samples)
    ├── config.local.json   written by the app when you first generate
    └── bills-overview.output.pdf   the report, written by the app
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Report is empty or everything says *Not scheduled* | In the settings window, check the bills folder shows files, and that the bills have a schedule other than *Not scheduled*. |
| "The bills folder doesn't exist" | Fix the bills folder in the settings window (or **Browse…**); the message shows the resolved path. |
| The settings window doesn't appear | After a minute the app shows its address; open that in any browser. |
| "macOS blocked access" | Click **Open Privacy & Security settings** under the message (or go to System Settings → Privacy & Security → Files & Folders) and allow *Bills Overview*. Back in the window, the folder is checked again by itself, or click **Try again**. |
| "… is open in another app" (Windows) | Close `bills-overview.output.pdf` and run again. |
| A file is missing from the report | Look under *Housekeeping* on page 1; it says why each skipped file was skipped. |

The result of the last run (or the error) is logged to `last-run.log` in `~/Library/Application Support/Bills Overview/` (macOS) or `%APPDATA%\Bills Overview\` (Windows).
