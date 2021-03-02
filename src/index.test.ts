import { jest, beforeAll, test, expect } from "@jest/globals";
import os from "os";
import path from "path";
import fs from "fs-extra";
import execa from "execa";
import cryptoRandomString from "crypto-random-string";

jest.setTimeout(120000);

const testsDirectory = path.join(
  os.tmpdir(),
  "caxa-tests",
  cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
);
beforeAll(async () => {
  await fs.ensureDir(testsDirectory);
});

test("echo-command-line-parameters", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters${process.platform === "win32" ? ".exe" : ""}`
  );
  const appDirectory = path.join(
    os.tmpdir(),
    "caxa",
    "echo-command-line-parameters"
  );
  await execa("npx", [
    "ts-node",
    "src/index.ts",
    "--directory",
    "examples/echo-command-line-parameters",
    "--command",
    "{{caxa}}/node_modules/.bin/node",
    "{{caxa}}/index.js",
    "some",
    "embedded arguments",
    "--output",
    output,
  ]);
  // Cached from build.
  expect(
    (
      await execa(output, ["and", "some arguments passed on the call"], {
        all: true,
      })
    ).all
  ).toMatchInlineSnapshot(`
    "[
      \\"some\\",
      \\"embedded arguments\\",
      \\"and\\",
      \\"some arguments passed on the call\\"
    ]"
  `);
  expect(await fs.pathExists(appDirectory)).toBe(true);
  await fs.remove(appDirectory);
  expect(await fs.pathExists(appDirectory)).toBe(false);
  // Uncached.
  expect(
    (
      await execa(output, ["and", "some arguments passed on the call"], {
        all: true,
      })
    ).all
  ).toMatchInlineSnapshot(`
    "[
      \\"some\\",
      \\"embedded arguments\\",
      \\"and\\",
      \\"some arguments passed on the call\\"
    ]"
  `);
  // Cached from previous run.
  expect(
    (
      await execa(output, ["and", "some arguments passed on the call"], {
        all: true,
      })
    ).all
  ).toMatchInlineSnapshot(`
    "[
      \\"some\\",
      \\"embedded arguments\\",
      \\"and\\",
      \\"some arguments passed on the call\\"
    ]"
  `);
});

test("native-modules", async () => {
  const output = path.join(
    testsDirectory,
    `native-modules${process.platform === "win32" ? ".exe" : ""}`
  );
  const appDirectory = path.join(os.tmpdir(), "caxa", "native-modules");
  await execa("npm", ["install"], { cwd: "examples/native-modules" });
  await execa("npx", [
    "ts-node",
    "src/index.ts",
    "--directory",
    "examples/native-modules",
    "--command",
    "{{caxa}}/node_modules/.bin/node",
    "{{caxa}}/index.js",
    "--output",
    output,
  ]);
  // Cached from build.
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(`
    "@leafac/sqlite: {
      \\"example\\": \\"caxa native modules\\"
    }
    sharp: 48"
  `);
  expect(await fs.pathExists(appDirectory)).toBe(true);
  await fs.remove(appDirectory);
  expect(await fs.pathExists(appDirectory)).toBe(false);
  // Uncached.
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(`
    "@leafac/sqlite: {
      \\"example\\": \\"caxa native modules\\"
    }
    sharp: 48"
  `);
  // Cached from previous run.
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(`
    "@leafac/sqlite: {
      \\"example\\": \\"caxa native modules\\"
    }
    sharp: 48"
  `);
});

/*
test("echo-command-line-parameters", async () => {
  const output = path.join(testsDirectory, "echo-command-line-parameters");
  await caxa({
    directoryToPackage: "examples/echo-command-line-parameters",
    commandToRun: `node "{{ caxa }}/index.js"`,
    output,
    removeBuildDirectory: true,
  });
  await expect(
    (await execa(output, ["parameter-without-spaces", "parameter with spaces"]))
      .stdout
  ).toMatchInlineSnapshot(`
          "[
            \\"parameter-without-spaces\\",
            \\"parameter with spaces\\"
          ]"
        `);
});

if (os.platform() === "darwin")
  test("Echo Command-Line Parameters.app", async () => {
    const output = path.join(
      testsDirectory,
      "Echo Command-Line Parameters.app"
    );
    await caxa({
      directoryToPackage: "examples/echo-command-line-parameters",
      commandToRun: `node "{{ caxa }}/index.js"`,
      output,
    });
    await expect(
      (
        await execa(
          path.join(output, "Contents/MacOS/Echo Command-Line Parameters"),
          ["parameter-without-spaces", "parameter with spaces"]
        )
      ).stdout
    ).toMatchInlineSnapshot(`
          "[
            \\"parameter-without-spaces\\",
            \\"parameter with spaces\\"
          ]"
        `);
  });

test("native-modules", async () => {
  const output = path.join(testsDirectory, "native-modules");
  await execa("npm", ["install"], { cwd: "examples/native-modules" });
  await caxa({
    directoryToPackage: "examples/native-modules",
    commandToRun: `node "{{ caxa }}/index.js"`,
    output,
    removeBuildDirectory: true,
  });
  await expect((await execa(output)).stdout).toMatchInlineSnapshot(`
          "@leafac/sqlite: {
            \\"example\\": \\"caxa native modules\\"
          }
          sharp: 48"
        `);
});
*/
