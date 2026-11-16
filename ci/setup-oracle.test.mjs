import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const script = fileURLToPath(new URL("./setup-oracle.sh", import.meta.url)).replaceAll("\\", "/");
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(mode = "complete") {
  const root = mkdtempSync(join(tmpdir(), "datastudio-oracle-setup-"));
  roots.push(root);
  const shellRoot = root.replaceAll("\\", "/");
  const stub = join(root, "commands.sh");
  writeFileSync(
    stub,
    `
unset LD_LIBRARY_PATH
sudo() { return 0; }
cargo() {
  if [ "$MOCK_MODE" = "download-failed" ]; then return 42; fi
  if [ "$MOCK_MODE" = "no-client" ]; then return 0; fi
  mkdir -p "$DATASTUDIO_DATA/oracle/instantclient_test"
  touch "$DATASTUDIO_DATA/oracle/instantclient_test/libclntsh.so"
  if [ "$MOCK_MODE" != "missing-library" ]; then touch "$DATASTUDIO_DATA/oracle/instantclient_test/libnnz.so"; fi
  if [ "$MOCK_MODE" = "ambiguous" ]; then mkdir -p "$DATASTUDIO_DATA/oracle/instantclient_other"; fi
}
`,
  );
  const envFile = join(root, "github-env");
  const result = spawnSync(bash, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      BASH_ENV: stub.replaceAll("\\", "/"),
      RUNNER_TEMP: shellRoot,
      GITHUB_ENV: envFile.replaceAll("\\", "/"),
      MOCK_MODE: mode,
      LD_LIBRARY_PATH: "",
    },
  });
  return { result, root: shellRoot, envFile };
}

describe("Oracle CI client setup", () => {
  it("uses a fixed data folder and exports the client path independently of Cargo test binary placement", () => {
    const { result, root, envFile } = setup();
    assert.equal(result.status, 0, result.stderr);
    const env = readFileSync(envFile, "utf8");
    assert.ok(env.includes(`DATASTUDIO_DATA=${root}/datastudio-oracle-contract\n`), env);
    assert.ok(env.includes(`LD_LIBRARY_PATH=${root}/datastudio-oracle-contract/oracle/instantclient_test\n`), env);
    assert.ok(!env.includes("target/debug/deps"));
  });

  for (const mode of ["missing-library", "ambiguous", "download-failed", "no-client"])
    it(`fails setup before publishing environment variables: ${mode}`, () => {
      const { result, envFile } = setup(mode);
      assert.notEqual(result.status, 0);
      if (mode !== "download-failed") assert.ok((result.stderr + result.stdout).includes("::error::"));
      else assert.equal(result.status, 42);
      assert.equal(existsSync(envFile), false);
    });
});
