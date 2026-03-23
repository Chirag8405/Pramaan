const fs = require("fs");
const path = require("path");

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

function main() {
  const cwd = process.cwd();
  const localNextDir = path.join(cwd, ".next");
  const localRoutes = path.join(localNextDir, "routes-manifest.json");
  const localDeterministic = path.join(localNextDir, "routes-manifest-deterministic.json");

  const hasLocalRoutes = ensureFile(localRoutes, localDeterministic);

  if (!hasLocalRoutes) {
    console.log("source missing", localRoutes);
    return;
  }

  // Vercel monorepo builds may package from the parent project root and look
  // for manifests under /vercel/path0/.next even when build runs in frontend/.
  const shouldMirrorToParent = process.env.VERCEL === "1" || process.env.CI === "true";
  if (!shouldMirrorToParent) {
    return;
  }

  const parentNextDir = path.resolve(cwd, "..", ".next");
  const parentRoutes = path.join(parentNextDir, "routes-manifest.json");
  const parentDeterministic = path.join(parentNextDir, "routes-manifest-deterministic.json");

  ensureFile(localRoutes, parentRoutes);
  ensureFile(localDeterministic, parentDeterministic);
}

main();
