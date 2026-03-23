const fs = require("fs");
const path = require("path");

const FALLBACK_ROUTES_MANIFEST = {
  version: 3,
  pages404: true,
  caseSensitive: false,
  basePath: "",
  redirects: [],
  headers: [],
  dynamicRoutes: [],
  staticRoutes: [],
  dataRoutes: [],
  i18n: null
};

function ensureFile(src, dst) {
  if (!fs.existsSync(src)) {
    return false;
  }

  const dstDir = path.dirname(dst);
  fs.mkdirSync(dstDir, { recursive: true });

  if (!fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log("created", dst);
  }

  return true;
}

function ensureJsonFile(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
    console.log("created fallback", filePath);
  }
}

function ensureManifestsInDir(dirPath, preferredSource) {
  const routesPath = path.join(dirPath, "routes-manifest.json");
  const deterministicPath = path.join(dirPath, "routes-manifest-deterministic.json");

  if (!fs.existsSync(routesPath)) {
    if (preferredSource && fs.existsSync(preferredSource)) {
      ensureFile(preferredSource, routesPath);
    } else {
      ensureJsonFile(routesPath, FALLBACK_ROUTES_MANIFEST);
    }
  }

  if (!fs.existsSync(deterministicPath)) {
    if (!ensureFile(routesPath, deterministicPath)) {
      ensureJsonFile(deterministicPath, FALLBACK_ROUTES_MANIFEST);
    }
  }
}

function copyIfExists(src, dst) {
  if (!fs.existsSync(src)) {
    return;
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log("mirrored", src, "->", dst);
}

function mirrorCoreNextFilesToParent(localNextDir, parentNextDir) {
  const filesToMirror = [
    "routes-manifest.json",
    "routes-manifest-deterministic.json",
    "app-path-routes-manifest.json",
    path.join("server", "pages-manifest.json")
  ];

  for (const relPath of filesToMirror) {
    const src = path.join(localNextDir, relPath);
    const dst = path.join(parentNextDir, relPath);
    copyIfExists(src, dst);
  }
}

function main() {
  const cwd = process.cwd();
  const localNextDir = path.join(cwd, ".next");
  const localRoutes = path.join(localNextDir, "routes-manifest.json");
  ensureManifestsInDir(localNextDir, localRoutes);

  // Vercel can resolve some manifests from /vercel/path0/.next even when
  // the app is in a subdirectory. Mirror the core manifests only on Vercel.
  if (process.env.VERCEL === "1") {
    const parentNextDir = path.resolve(cwd, "..", ".next");
    mirrorCoreNextFilesToParent(localNextDir, parentNextDir);
    ensureManifestsInDir(parentNextDir, path.join(parentNextDir, "routes-manifest.json"));
  }
}

main();
