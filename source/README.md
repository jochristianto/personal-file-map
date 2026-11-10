# Bills Overview

Double-click **`bills-overview.app`** (macOS) or **`bills-overview.exe`** (Windows). It:

1. Finds the bills folder: `"folder"` in `config.default.json` next to the app (`./samples` in this repo). Without that file, the folder the app is in.
2. Reads the bill files (`YYYYMM Name.ext`) there. The year comes from the folder's name (`2026`), or else from the file names.
3. Tidies files like the old `file-mapper` did: uppercase extensions → lowercase, `.heic` → `.jpg`.
4. Writes **`config.local.json`** (first run) and **`bills-overview.output.pdf`** into the bills folder, and opens the PDF. The app, the exe and the config files are never counted as bills.

No Node, npm or other repos are needed to run it; the Node runtime is inside the executable.

Two ways to set it up:

- **Only the app, inside the bills folder** (e.g. `Monthly Bills/2026`). No `config.default.json` needed. For a new year, copy the app into the new folder (`config.local.json` too, to keep the schedules).
- **App + `config.default.json` anywhere**, `"folder"` pointing at the bills, e.g. `"./samples"`, `"../Monthly Bills/2026"`, `"~/Library/CloudStorage/GoogleDrive-…/My Drive/Bills/Monthly Bills/2026"` or `"G:/My Drive/Bills/Monthly Bills/2026"`. For a new year, change the path.

## Configuration

| File | Where | What | In git |
|---|---|---|---|
| [`config.default.json`](../config.default.json) | next to the app | Generic defaults: `"folder"` (the bills folder, `./samples` here) and shared bills (none). Optional: without it the app's own folder is used. | yes |
| `config.local.json` | inside the bills folder | That folder's bills. **Created automatically on first run** with `"folder": "./"` and every bill found set to `"monthly"`. Its bill keys replace the same keys in the default. | no |

On every run, bills found that no key covers yet (for example a new bill appearing) are **appended to `config.local.json` as `"monthly"`**, and the report's Housekeeping card says how many. Your existing entries, including ones set to `null`, are never changed.

`"folder"` in `config.local.json` is `"./"` (its own folder). Changing it makes the app read the bills (and write the PDF) somewhere else, relative to `config.local.json`, while the config itself stays put.

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

**`folder`** is resolved relative to the config file. It accepts `./`, relative paths, absolute paths and `~/…`. On Windows, use forward slashes or double backslashes (`"G:\\My Drive\\…"`).

**`bills`**, which months each bill is expected (nothing is guessed):

| Value | Expected months |
|---|---|
| `"monthly"` | every month |
| `"quarterly"` | Jan, Apr, Jul, Oct |
| `{ "months": [1, 7] }` | exactly those months |
| `{ "every": 2, "from": 3 }` | every 2 months starting March |
| `"from"` / `"until"` (1–12) | add to any `{…}` form to limit the range |
| `"irregular"` | none: shown, never flagged |
| `null` or not listed | none: shown as "Not scheduled" |

- A key matches the bill with that exact name **or every bill that starts with it**: `"Meter 01"` covers all `Meter 01 Photo …` files. When several keys match, the longest wins (`"Internet Payment"` beats `"Internet"`). Matching ignores case.
- A scheduled past month without a file is **missing**; the current month without a file is **due**.
- The report's Housekeeping card lists bills without a schedule, invalid values and keys that match no bill. A JSON syntax error stops the run with the line and column.

The last run's result is in `last-run.log` (macOS: `~/Library/Application Support/Bills Overview/`, Windows: `%APPDATA%\Bills Overview\`).

## Samples

[`../samples`](../samples) holds generic sample bills covering monthly, quarterly, irregular and one-off bills plus a few stray files for Housekeeping. `config.default.json` already points at them, so double-clicking the app in the repo root reports on the samples (creating `samples/config.local.json` the first time). Regenerate with:

```bash
cd source && npm run samples
```

Optionally pass a year and "current" month: `node scripts/make-samples.mjs 2026 11`.

## Rebuilding

```bash
cd source && npm install && npm run build
```

This produces `bills-overview.app` and `bills-overview.exe` in the parent folder. Building has to happen on a Mac (for the `.app`); the Windows `.exe` is cross-built. An Intel Mac build is left in `dist/bills-overview-intel.app`. `config.default.json` is embedded at build time.

Testing: `node build.mjs --bundle-only`, then `BILLS_DIR=/some/folder BILLS_NO_OPEN=1 node dist/bills-overview.cjs`. `BILLS_DIR` stands in for the app's folder (where `config.default.json` is read from). Optionally add `BILLS_TODAY=2026-11-10`.
