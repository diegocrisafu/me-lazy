import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = (program, args, options = {}) =>
  execFileSync(program, args, { cwd: root, stdio: "inherit", ...options });
const read = (args, cwd = root) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const remote = read(["remote", "get-url", "origin"]);
if (
  ![
    "https://github.com/diegocrisafu/me-lazy.git",
    "git@github.com:diegocrisafu/me-lazy.git",
  ].includes(remote)
) {
  throw new Error(
    "Unexpected deploy destination. Review scripts/deploy.mjs before publishing a fork.",
  );
}
run("npm", ["test"]);
run("npm", ["run", "build"], {
  env: { ...process.env, DEPLOY_BASE: "./" },
});
const source = read(["rev-parse", "HEAD"]);
const targets = [
  {
    remote,
    branch: "gh-pages",
    url: "https://diegocrisafu.github.io/me-lazy/",
  },
  {
    remote: "https://github.com/diegocrisafu/diegocrisafu.github.io.git",
    branch: "main",
    url: "https://diegocrisafu.github.io/",
  },
];
for (const target of targets) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "roomfit-deploy-"));
  const checkout = path.join(temp, "site");
  try {
    const existing = read([
      "ls-remote",
      "--heads",
      target.remote,
      target.branch,
    ]);
    if (existing)
      run("git", [
        "clone",
        "--depth",
        "1",
        "--branch",
        target.branch,
        target.remote,
        checkout,
      ]);
    else {
      fs.mkdirSync(checkout);
      run("git", ["init", `--initial-branch=${target.branch}`], {
        cwd: checkout,
      });
      run("git", ["remote", "add", "origin", target.remote], { cwd: checkout });
    }
    run("git", ["config", "user.name", read(["config", "user.name"])], {
      cwd: checkout,
    });
    run("git", ["config", "user.email", read(["config", "user.email"])], {
      cwd: checkout,
    });
    for (const name of fs.readdirSync(checkout))
      if (name !== ".git")
        fs.rmSync(path.join(checkout, name), { recursive: true, force: true });
    fs.cpSync(path.join(root, "dist"), checkout, { recursive: true });
    fs.writeFileSync(path.join(checkout, ".nojekyll"), "");
    fs.writeFileSync(
      path.join(checkout, "build.json"),
      JSON.stringify(
        {
          sourceRepository: "https://github.com/diegocrisafu/me-lazy",
          sourceCommit: source,
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    run("git", ["add", "-A"], { cwd: checkout });
    if (read(["status", "--porcelain"], checkout))
      run(
        "git",
        ["commit", "-m", `Publish RoomFit from ${source.slice(0, 12)}`],
        { cwd: checkout },
      );
    run("git", ["push", "origin", target.branch], { cwd: checkout });
    console.log(`Published ${target.url}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
