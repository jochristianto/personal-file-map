# Bills Overview

A double-click app for macOS and Windows that turns a folder of monthly bill files into a one-glance PDF report: **what's been paid, what's still due this month, and what's missing**.

You keep doing what you already do: save each bill, receipt or payment screenshot as `YYYYMM Name.ext` in a folder. Double-click the app in that folder, and `bills-overview.output.pdf` opens with:

- **Overview page:** paid vs. still due this month, missing files, year-to-date coverage, latest upload, a files-per-month chart, highlights, and a *Housekeeping* list of files that couldn't be read.
- **Matrix pages:** every bill (grouped by first word) × every month, marked *file found* / *due this month* / *missing*, with a status per bill.

No terminal, Node or other installs are needed to run it: the runtime is inside the app. Generating the app (once, from this repo) does need Node, see below.

---

## Generate the app and sample data

The repo contains only source code. The apps and the sample bills are generated.

**Prerequisites:** macOS (the `.app` is assembled with macOS tools; the Windows `.exe` is cross-built on the Mac), [Node.js](https://nodejs.org) 24 (the version is in [`.nvmrc`](.nvmrc); with nvm, run `nvm use` in the repo root) and an internet connection for the first build.

**1. Install the dependencies**

```bash
cd source
npm install
```

**2. Generate the sample data** (optional, to try the app without your own bills)

```bash
npm run samples
```

This writes ~200 generic bills to `samples/` in the repo root: monthly, quarterly, irregular and one-off bills for the current year up to the current month, plus a few deliberately wrong files that show up under *Housekeeping*. Running it again replaces them. For another year or "current" month, pass them explicitly:

```bash
node scripts/make-samples.mjs 2026 11
```

**3. Generate the app**

```bash
npm run build
```

This creates, in the repo root:

| File | For |
|---|---|
| `bills-overview.app` | macOS on Apple Silicon |
| `bills-overview.exe` | Windows x64 |

An Intel Mac build is left in `source/dist/bills-overview-intel.app`. The first build downloads the Node runtimes that get packed into the apps (about 60 MB each, cached afterwards), so it takes a minute; later builds are faster. [`source/config.default.json`](source/config.default.json) is compiled in: change it and rebuild to change the defaults new `config.local.json` files start from.

**4. Try it on the samples**

```bash
cp -R ../bills-overview.app ../samples/
open ../samples/bills-overview.app
```

Or copy the app into `samples/` in Finder and double-click it. The report opens and is saved as `samples/bills-overview.output.pdf`, next to a new `samples/config.local.json`. On Windows, copy `bills-overview.exe` into `samples\` and double-click it.

Everything generated (`samples/`, the apps, `config.local.json`, the PDFs, `source/dist`, `source/node_modules`) is git-ignored. Delete it any time and generate it again.

## Quick start

1. Get the app: **`bills-overview.app`** (macOS, Apple Silicon) or **`bills-overview.exe`** (Windows x64), see [Generate the app](#generate-the-app-and-sample-data).
2. Copy it **into the folder with your bills**, e.g. `My Drive/Bills/Monthly Bills/2026`.
3. **Double-click it.** On the first run it creates `config.local.json` next to itself (every bill found set to *monthly*), writes `bills-overview.output.pdf` and opens it.
4. Adjust `config.local.json` for bills that aren't monthly (see [Configuration](#configuration)) and double-click again. Run it whenever you add files; the PDF is overwritten each time.

For a new year, copy the app and your `config.local.json` into the new year's folder.

**First launch notes**

- **macOS** may ask to let *Bills Overview* access files (for example on Google Drive). Click **Allow**. If you said no, re-enable it under System Settings → Privacy & Security → Files & Folders.
- **macOS**: if the app says it's "running from a temporary location", drag it to another folder and back in Finder, then open it again.
- **Windows** may show a SmartScreen warning because the app isn't signed: *More info → Run anyway*. A console window flashes while it runs.

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

## Configuration

Everything lives in **`config.local.json`**, next to the app. It's created automatically on the first run from the app's built-in defaults ([`source/config.default.json`](source/config.default.json)):

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
- **New bills are added for you**: every run appends bills that no key covers yet as `"monthly"` and says so under *Housekeeping*. Your existing entries, including ones you set to `null`, are never changed.
- A typo in the JSON stops the run with the line and column. Invalid values and keys that match no bill are listed under *Housekeeping*.

## Development

All commands run in `source/` (after `npm install`):

| Command | What |
|---|---|
| `npm run build` | Generate `bills-overview.app` and `bills-overview.exe` (see [above](#generate-the-app-and-sample-data)) |
| `npm run samples` | Generate `samples/` (or `node scripts/make-samples.mjs <year> <month>`) |
| `npm run typecheck` | TypeScript check |
| `npm run dev` | Bundle and run once with Node, without packaging |

To run without double-clicking: `node build.mjs --bundle-only`, then `BILLS_DIR=../samples BILLS_NO_OPEN=1 node dist/bills-overview.cjs`. `BILLS_DIR` stands in for the app's folder; `BILLS_TODAY=2026-11-10` fakes today's date.

## Project structure

```
.
├── README.md                 ← you are here
├── samples/                  generated sample bills (npm run samples, git-ignored)
├── source/
│   ├── config.default.json   defaults compiled into the app
│   ├── build.mjs             bundle (esbuild) → executables (pkg) → .app / .exe
│   ├── scripts/
│   │   ├── icon.mjs          draws the app icon
│   │   └── make-samples.mjs  generates samples/
│   └── src/
│       ├── main.ts           entry point: configs → scan → analyze → PDF → open
│       ├── config.ts         config.local.json / defaults, schedules, key matching
│       ├── locate.ts         where the app lives, year detection
│       ├── scan.ts           folder clean-up and file parsing
│       ├── analyze.ts        paid / due / missing per bill and month, stats
│       ├── pdf.ts            the report (pdfkit, Inter font)
│       └── platform.ts       dialogs and opening files on macOS / Windows
├── bills-overview.app        generated app (npm run build, git-ignored)
└── bills-overview.exe        generated app (npm run build, git-ignored)
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Report is empty or everything says *Not scheduled* | Check `folder` in `config.local.json` points at the bills, and that the bills have schedules (`null` = not scheduled). |
| "The bills folder doesn't exist" | The `folder` path in `config.local.json` is wrong; the message shows the resolved path. |
| "macOS blocked access" | System Settings → Privacy & Security → Files & Folders → allow *Bills Overview*. |
| "… is open in another app" (Windows) | Close `bills-overview.output.pdf` and run again. |
| A file is missing from the report | Look under *Housekeeping* on page 1; it says why each skipped file was skipped. |

The result of the last run (or the error) is logged to `last-run.log` in `~/Library/Application Support/Bills Overview/` (macOS) or `%APPDATA%\Bills Overview\` (Windows).
