# Bills Overview: source

How to use the app, configure it and build it is in the [root README](../README.md). These are notes for working on the code.

## Pipeline

`src/main.ts` runs once per double-click:

1. **Configs** (`config.ts`): read `config.local.json` next to the app (`locate.ts` finds the app's folder, including inside a `.app` bundle) and merge it over the built-in `config.default.json`. `"folder"` gives the bills folder.
2. **Scan** (`scan.ts`): lowercase extensions, convert HEIC to JPG, then parse `YYYYMM Name.ext` files. Everything else becomes a Housekeeping note.
3. **Update config**: bills no key covers yet are appended to `config.local.json` as `"monthly"` (the file is created from the default template on first run).
4. **Analyze** (`analyze.ts`): per bill and month, `paid` / `missing` / `due` / `none` / `future` from the schedules; groups by first word; stats for the overview page.
5. **Render** (`pdf.ts`): A4 landscape PDF with pdfkit and embedded Inter fonts; overview page + paginated matrix.
6. **Write and open** `bills-overview.output.pdf` (`platform.ts` handles dialogs and opening files per OS).

## Build notes

- `build.mjs` bundles everything into `dist/bills-overview.cjs` with esbuild (fonts and `config.default.json` inlined; pdfkit's `import.meta.url` is shimmed for CJS), packages it with `@yao-pkg/pkg` for macOS arm64/x64 and Windows x64, wraps the macOS binaries in `.app` bundles (icon from `scripts/icon.mjs`, ad-hoc signed) and copies the host `.app` and the `.exe` to the repo root.
- Keep anything read at runtime inside the bundle: the packaged app can't read files from `node_modules`.
- `scripts/make-samples.mjs` draws its own JPG/PNG images (`jpeg-js`, `pngjs`) and PDF receipts, so it runs anywhere Node does.
