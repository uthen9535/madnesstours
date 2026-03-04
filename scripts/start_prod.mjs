import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasValidProdBuild() {
  if (!existsSync(".next/BUILD_ID")) {
    return false;
  }

  const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();

  if (!buildId || buildId === "development") {
    return false;
  }

  return true;
}

function ensureProdBuild() {
  if (!hasValidProdBuild()) {
    console.log("[start:prod] Missing valid production build. Running production build...");
    run("npm", ["run", "build"]);
    return;
  }

  console.log("[start:prod] Using existing production build.");
}

run("npm", ["run", "prisma:migrate:deploy"]);
ensureProdBuild();
run("npm", ["run", "start", "--", ...process.argv.slice(2)]);
