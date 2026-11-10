// Builds the double-click apps into out/:
//   pnpm build  → out/bills-overview.app (Apple Silicon), out/bills-overview-intel.app, out/bills-overview.exe
//   pnpm dev    → bundle and run once with Node, without packaging
// Intermediates (JS bundle, raw executables, icon) are made in a temporary folder that is always
// deleted afterwards, even when the build fails.
import { build } from "esbuild";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.join(here, "out"); // generated apps (git-ignored)
const APP_FILE = "bills-overview"; // bills-overview.app / bills-overview.exe
const APP_TITLE = "Bills Overview"; // name shown by macOS
const VERSION = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8")).version;
const devMode = process.argv.includes("--dev");

fs.rmSync(path.join(releaseDir, "build"), { recursive: true, force: true }); // left over by older builds
const work = fs.mkdtempSync(path.join(os.tmpdir(), "bills-overview-build-"));
try {
  await run();
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

async function run() {
  // 1. One self-contained JS file (fonts, HEIC decoder, settings page and config.default.json inlined)
  const bundle = path.join(work, "bills-overview.cjs");
  await build({
    entryPoints: [path.join(here, "src/main.ts")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    loader: { ".woff": "binary", ".html": "text" },
    // pdfkit's ESM build reads import.meta.url at load time; give it a real URL in CJS
    define: { "import.meta.url": "__importMetaUrl" },
    banner: { js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;' },
    legalComments: "none",
    logLevel: "warning",
  });
  console.log(`✓ bundle (${(fs.statSync(bundle).size / 1e6).toFixed(1)} MB)`);

  if (devMode) {
    // Run it once with this Node, then the finally block removes it
    const { status } = spawnSync(process.execPath, [bundle], { stdio: "inherit" });
    process.exitCode = status ?? 1;
    return;
  }

  // 2. Standalone executables (Node runtime embedded)
  const binDir = path.join(work, "bin");
  const targets = ["node22-macos-arm64", "node22-macos-x64", "node22-win-x64"];
  execFileSync(
    path.join(here, "node_modules/.bin/pkg"),
    [bundle, "--targets", targets.join(","), "--out-path", binDir, "--no-bytecode", "--public", "--public-packages", "*"],
    { stdio: "inherit" }
  );
  const bin = (t) => path.join(binDir, `bills-overview-${t}`);
  console.log("✓ executables");
  fs.mkdirSync(releaseDir, { recursive: true });

  // 3. Windows: the .exe is the app
  const exeOut = path.join(releaseDir, `${APP_FILE}.exe`);
  fs.copyFileSync(bin("win-x64.exe"), exeOut);
  console.log(`✓ ${path.relative(here, exeOut)}`);

  // 4. macOS: wrap each binary in an .app bundle so Finder runs it without a Terminal window
  if (process.platform === "darwin") {
    const icns = makeIcon();
    for (const arch of ["arm64", "x64"]) {
      const app = path.join(releaseDir, arch === "arm64" ? `${APP_FILE}.app` : `${APP_FILE}-intel.app`);
      fs.rmSync(app, { recursive: true, force: true });
      fs.mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
      fs.mkdirSync(path.join(app, "Contents/Resources"), { recursive: true });
      fs.copyFileSync(bin(`macos-${arch}`), path.join(app, "Contents/MacOS/bills-overview"));
      fs.chmodSync(path.join(app, "Contents/MacOS/bills-overview"), 0o755);
      if (icns) fs.copyFileSync(icns, path.join(app, "Contents/Resources/AppIcon.icns"));
      fs.writeFileSync(path.join(app, "Contents/Info.plist"), infoPlist());
      try {
        execFileSync("codesign", ["--force", "--sign", "-", app], { stdio: "pipe" });
      } catch (e) {
        console.warn(`! codesign failed for ${path.basename(app)}: ${String(e.stderr || e.message).trim()}`);
      }
      console.log(`✓ ${path.relative(here, app)}`);
    }
  }
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_TITLE}</string>
  <key>CFBundleDisplayName</key><string>${APP_TITLE}</string>
  <key>CFBundleIdentifier</key><string>id.becomeone.bills-overview</string>
  <key>CFBundleExecutable</key><string>bills-overview</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`;
}

/** Draws the app icon with pdfkit, rasterises with sips, packs with iconutil. */
function makeIcon() {
  try {
    const iconDir = path.join(work, "icon");
    fs.mkdirSync(path.join(iconDir, "AppIcon.iconset"), { recursive: true });
    const pdfPath = path.join(iconDir, "icon.pdf");
    execFileSync(process.execPath, [path.join(here, "scripts/icon.mjs"), pdfPath], { stdio: "inherit" });
    const png = path.join(iconDir, "icon-1024.png");
    execFileSync("sips", ["-s", "format", "png", "-z", "1024", "1024", pdfPath, "--out", png], { stdio: "pipe" });
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const px = size * scale;
        const name = `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`;
        execFileSync("sips", ["-z", String(px), String(px), png, "--out", path.join(iconDir, "AppIcon.iconset", name)], { stdio: "pipe" });
      }
    }
    const icns = path.join(iconDir, "AppIcon.icns");
    execFileSync("iconutil", ["-c", "icns", path.join(iconDir, "AppIcon.iconset"), "-o", icns]);
    return icns;
  } catch (e) {
    console.warn(`! icon skipped: ${e.message}`);
    return null;
  }
}
