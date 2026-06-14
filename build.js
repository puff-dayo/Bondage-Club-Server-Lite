const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function createDefaultIco() {
  const buf = Buffer.alloc(66);
  let off = 0;
  buf.writeUInt16LE(0, off); off += 2;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt8(1, off); off += 1;
  buf.writeUInt8(1, off); off += 1;
  buf.writeUInt8(0, off); off += 1;
  buf.writeUInt8(0, off); off += 1;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt16LE(32, off); off += 2;
  buf.writeUInt32LE(44, off); off += 4;
  buf.writeUInt32LE(22, off); off += 4;
  buf.writeUInt32LE(40, off); off += 4;
  buf.writeInt32LE(1, off); off += 4;
  buf.writeInt32LE(2, off); off += 4;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt16LE(32, off); off += 2;
  buf.writeUInt32LE(0, off); off += 4;
  buf.writeUInt32LE(4, off); off += 4;
  for (let i = 0; i < 16; i++) { buf.writeUInt8(0, off); off += 1; }
  buf.writeUInt8(0xD4, off); off += 1;
  buf.writeUInt8(0x78, off); off += 1;
  buf.writeUInt8(0x00, off); off += 1;
  buf.writeUInt8(0xFF, off); off += 1;
  return buf;
}

function cleanNodeModules(appDir) {
  const nmDir = path.join(appDir, "package.nw", "node_modules");
  if (!fs.existsSync(nmDir)) { console.log("  No node_modules to clean"); return; }

  let removed = 0;
  let savedBytes = 0;

  function shouldRemove(name, isDir) {
    const lower = name.toLowerCase();
    if (isDir) {
      return ["test", "tests", "__tests__", ".github", ".git"].includes(name);
    }
    if (lower.endsWith(".md")) return true;
    if (lower.endsWith(".map") || lower.endsWith(".flow") || lower.endsWith(".jst")) return true;
    if (lower === "tsconfig.json" || lower === "tslint.json" || lower.startsWith(".eslintrc") || lower === ".jshintrc") return true;
    if (lower === ".travis.yml" || lower === "appveyor.yml" || lower === ".gitattributes" || lower === ".npmignore" || lower === ".editorconfig" || lower === ".gitkeep") return true;
    if (lower.startsWith("changelog") || lower.startsWith("history") || lower.startsWith("authors") || lower.startsWith("contributing")) return true;
    if (lower === "makefile" || lower === "gulpfile.js" || lower === "gruntfile.js") return true;
    return false;
  }

  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      const isDir = stat.isDirectory();

      if (shouldRemove(entry, isDir)) {
        const size = stat.isDirectory() ? getSize(fullPath) : stat.size;
        fs.rmSync(fullPath, { recursive: true, force: true });
        removed++;
        savedBytes += size;
      } else if (isDir) {
        walk(fullPath);
      }
    }
  }

  walk(nmDir);
  if (removed > 0) {
    console.log(`  Removed ${removed} junk items from node_modules (saved ${formatSize(savedBytes)})`);
  } else {
    console.log("  No junk found in node_modules");
  }
}

const KEEP_LOCALES = new Set([
  "en-US.pak", "en-US.pak.info",
  "en-US_FEMININE.pak", "en-US_FEMININE.pak.info",
  "en-US_MASCULINE.pak", "en-US_MASCULINE.pak.info",
  "en-US_NEUTER.pak", "en-US_NEUTER.pak.info",
]);

function stripLocales(appDir) {
  const localesDir = path.join(appDir, "locales");
  if (!fs.existsSync(localesDir)) return;
  let removed = 0;
  for (const file of fs.readdirSync(localesDir)) {
    if (!KEEP_LOCALES.has(file)) {
      fs.rmSync(path.join(localesDir, file));
      removed++;
    }
  }
  console.log(`  Removed ${removed} locale files.`);
}


function getSize(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      let total = 0;
      for (const entry of fs.readdirSync(filePath)) {
        total += getSize(path.join(filePath, entry));
      }
      return total;
    }
    return stat.size;
  } catch { return 0; }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileHash(filePath) {
  const crypto = require("crypto");
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

const UPX_CACHE_DIR = path.join(__dirname, "upx_cache");

function tryUpx(appDir) {
  try {
    execSync("upx --version", { stdio: "pipe" });
    fs.mkdirSync(UPX_CACHE_DIR, { recursive: true });
    console.log("  UPX found - compressing binaries...");
    const targets = ["node.dll", "libGLESv2.dll", "dxcompiler.dll", "vk_swiftshader.dll", "ffmpeg.dll"];
    for (const bin of targets) {
      const binPath = path.join(appDir, bin);
      if (!fs.existsSync(binPath)) continue;
      const hash = fileHash(binPath);
      const cachePath = path.join(UPX_CACHE_DIR, bin + "." + hash + ".upx");
      const before = fs.statSync(binPath).size;
      if (fs.existsSync(cachePath)) {
        const cached = fs.readFileSync(cachePath);
        fs.writeFileSync(binPath, cached);
        const after = fs.statSync(binPath).size;
        console.log(`    ${bin}: ${formatSize(before)} -> ${formatSize(after)} (cached, ${((1 - after / before) * 100).toFixed(0)}% saved)`);
      } else {
        execSync(`upx -5 --force --no-color "${binPath}"`, { stdio: "pipe" });
        const after = fs.statSync(binPath).size;
        console.log(`    ${bin}: ${formatSize(before)} -> ${formatSize(after)} (${((1 - after / before) * 100).toFixed(0)}% saved)`);
        fs.copyFileSync(binPath, cachePath);
      }
    }
  } catch {
    console.log("  UPX not found - skipping binary compression");
  }
}

async function main() {
  const root = __dirname;
  const buildDir = path.join(root, "build-tmp");
  const distDir = path.join(root, "dist");
  const nwjsDir = path.join(root, "nwjs");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const appName = "BC-Server-Lite";
  const platform = "win";
  const arch = "x64";
  const version = pkg.version;

  console.log("[1/7] Preparing build directory...");
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });

  console.log("[2/7] Copying source files...");
  fs.cpSync(nwjsDir, buildDir, { recursive: true });
  const icoPath = path.join(buildDir, "app.ico");
  fs.writeFileSync(icoPath, createDefaultIco());
  for (const file of ["app.js", "database.js", "config.yaml"]) {
    fs.copyFileSync(path.join(root, file), path.join(buildDir, file));
  }

  console.log("[3/7] Installing production dependencies...");
  fs.copyFileSync(path.join(root, "package.json"), path.join(buildDir, "package.json"));
  // Merge NW.js-specific fields from nwjs/package.json for the GUI build
  const nwPkg = JSON.parse(fs.readFileSync(path.join(nwjsDir, "package.json"), "utf8"));
  const distPkg = JSON.parse(fs.readFileSync(path.join(buildDir, "package.json"), "utf8"));
  for (const key of ["main", "chromium-args", "node-integration", "window", "node-remote"]) {
    if (nwPkg[key] != null) distPkg[key] = nwPkg[key];
  }
  fs.writeFileSync(path.join(buildDir, "package.json"), JSON.stringify(distPkg, null, 2) + "\n");
  const lockSrc = path.join(root, "package-lock.json");
  if (fs.existsSync(lockSrc)) {
    fs.copyFileSync(lockSrc, path.join(buildDir, "package-lock.json"));
  }
  execSync("npm install --production", { cwd: buildDir, stdio: "inherit" });
  const npmCache = path.join(buildDir, "node_modules", ".cache");
  if (fs.existsSync(npmCache)) {
    fs.rmSync(npmCache, { recursive: true, force: true });
  }

  console.log("[4/7] Building NW.js executable...");
  const { default: nwbuild } = await import("nw-builder");
  await nwbuild({
    mode: "build",
    srcDir: buildDir,
    glob: false,
    outDir: distDir,
    platform,
    arch,
    app: {
      icon: icoPath,
      name: appName,
      version,
    },
  });

  console.log("[5/7] Post-build optimization...");
  const appOutDir = distDir;
  const totalBefore = getSize(appOutDir);
  console.log(`  Size before optimization: ${formatSize(totalBefore)}`);

  const emptyDataDir = path.join(appOutDir, "data");
  if (fs.existsSync(emptyDataDir)) {
    fs.rmSync(emptyDataDir, { recursive: true, force: true });
    console.log("  Removed empty data/ directory");
  }

  stripLocales(appOutDir);
  cleanNodeModules(appOutDir);
  tryUpx(appOutDir);

  const totalAfter = getSize(appOutDir);
  console.log(`  Size after optimization:  ${formatSize(totalAfter)} (saved ${formatSize(totalBefore - totalAfter)})`);

  console.log("[6/7] Cleaning up...");
  fs.rmSync(buildDir, { recursive: true, force: true });

  console.log("[7/7] Creating archive...");
  const archiveName = `${appName}-${platform}-${arch}-${version}`;
  const archivePath = path.join(root, "dist", `${archiveName}.zip`);
  const stageDir = path.join(root, "dist", archiveName);
  fs.mkdirSync(stageDir, { recursive: true });
  for (const entry of fs.readdirSync(distDir)) {
    const entryPath = path.join(distDir, entry);
    if (entry === archiveName) continue;
    fs.cpSync(entryPath, path.join(stageDir, entry), { recursive: true });
  }
  try {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${archivePath}' -Force"`, { stdio: "inherit" });
    fs.rmSync(stageDir, { recursive: true, force: true });
    const archiveSize = getSize(archivePath);
    console.log(`  Archive: ${archiveName}.zip (${formatSize(archiveSize)})`);
  } catch (e) {
    console.log("  Archive failed:", e.message);
  }

  console.log("Done! Output in:", distDir);
}

main().catch(function (err) {
  console.error("Build failed:", err);
  process.exit(1);
});
