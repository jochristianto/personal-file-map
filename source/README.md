# Bills Overview

Put **Bills Overview.app** (macOS) or **Bills Overview.exe** (Windows) **inside the folder with the bills** (e.g. `Monthly Bills/2026`) and double-click it. It:

1. Reads the files next to it. The year comes from the folder name (`2026`), or else from the file names.
2. Tidies files like the old `file-mapper` did: uppercase extensions → lowercase, `.heic` → `.jpg`.
3. Writes **`Bills Overview <year>.pdf`** into that same folder (overwritten each run, never counted as a bill) and opens it. The app/exe itself is ignored.

For a new year, copy the app **and `bills-overview.config.json`** into the new year's folder.

No Node, npm or other repos are needed to run it; the Node runtime is inside the executable.

## Schedules: `bills-overview.config.json`

Nothing is guessed. Which months a bill is expected comes only from `bills-overview.config.json`, which sits next to the app and the bills (see [`../bills-overview.config.json`](../bills-overview.config.json)). If it's missing, the first run creates one listing every bill as `null` (not scheduled), ready to fill in. The app never edits an existing config.

```json
{
  "bills": {
    "PLN": "monthly",
    "Klaska IPL": "quarterly",
    "Klaska PLN 02": "irregular",
    "PBB": { "months": [1] },
    "Maybank KPR": { "every": 1, "from": 3 },
    "BNI": null
  }
}
```

| Value | Expected months |
|---|---|
| `"monthly"` | every month |
| `"quarterly"` | Jan, Apr, Jul, Oct |
| `{ "months": [1, 7] }` | exactly those months |
| `{ "every": 2, "from": 3 }` | every 2 months starting March |
| `"from"` / `"until"` (1–12) | add to any `{…}` form to limit the range |
| `"irregular"` | none: shown, never flagged |
| `null` or not listed | none: shown as "Not scheduled" |

- A key matches the bill with that exact name **or every bill that starts with it**: `"Klaska PLN 01"` covers all five `Klaska PLN 01 Photo …` files. When several keys match, the longest wins (`"Solnet Payment"` beats `"Solnet"`). Matching ignores case.
- A scheduled past month without a file is **missing**; the current month without a file is **due**.
- The report's Housekeeping card lists bills without a schedule, invalid values and keys that match no bill. A JSON syntax error stops the run with the line and column.

The last run's result is in `last-run.log` (macOS: `~/Library/Application Support/Bills Overview/`, Windows: `%APPDATA%\Bills Overview\`).

## Rebuilding

```bash
cd source && npm install && npm run build
```

This produces both apps and copies them into the parent folder. Building has to happen on a Mac (for the `.app`); the Windows `.exe` is cross-built. An Intel Mac build is left in `dist/Bills Overview (Intel).app`.

Testing without touching Drive: `node build.mjs --bundle-only`, then `BILLS_DIR=/some/2026 BILLS_NO_OPEN=1 node dist/bills-overview.cjs` (optional `BILLS_TODAY=2026-11-10`).
