import { jest, beforeAll, test, expect } from "@jest/globals";
import os from "os";
import path from "path";
import fs from "fs-extra";
import execa from "execa";

jest.setTimeout(300_000);

const caxaDirectory = path.join(os.tmpdir(), "caxa");
const testsDirectory = path.join(caxaDirectory, "tests");
beforeAll(async () => {
  await fs.remove(caxaDirectory);
});

test("echo-command-line-parameters", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters${process.platform === "win32" ? ".exe" : ""}`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "{{caxa}}/index.js",
    "some",
    "embedded arguments",
    "--an-option-thats-part-of-the-command",
  ]);
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
      \\"--an-option-thats-part-of-the-command\\",
      \\"and\\",
      \\"some arguments passed on the call\\"
    ]"
  `);
});

if (process.platform === "darwin")
  test("Echo Command Line Parameters.app", async () => {
    const output = path.join(
      testsDirectory,
      "Echo Command Line Parameters.app"
    );
    await execa("ts-node", [
      "src/index.ts",
      "--input",
      "examples/echo-command-line-parameters",
      "--output",
      output,
      "--",
      "{{caxa}}/node_modules/.bin/node",
      "{{caxa}}/index.js",
      "some",
      "embedded arguments",
    ]);
    console.log(
      `Test the macOS Application Bundle (.app) manually:\n$ open -a "${output}"`
    );
    expect(
      (
        await execa(
          path.join(output, "/Contents/Resources/Echo Command Line Parameters"),
          { all: true }
        )
      ).all
    ).toMatchInlineSnapshot(`
      "[
        \\"some\\",
        \\"embedded arguments\\"
      ]"
    `);
  });

if (process.platform !== "win32")
  test("echo-command-line-parameters.sh", async () => {
    const output = path.join(testsDirectory, "echo-command-line-parameters.sh");
    await execa("ts-node", [
      "src/index.ts",
      "--input",
      "examples/echo-command-line-parameters",
      "--output",
      output,
      "--",
      "{{caxa}}/node_modules/.bin/node",
      "{{caxa}}/index.js",
      "some",
      "embedded arguments",
      "--an-option-thats-part-of-the-command",
    ]);
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
        \\"--an-option-thats-part-of-the-command\\",
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
  await execa("npm", ["ci"], { cwd: "examples/native-modules" });
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/native-modules",
    "--output",
    output,
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "{{caxa}}/index.js",
  ]);
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(`
          "@leafac/sqlite: {
            \\"example\\": \\"caxa native modules\\"
          }
          sharp: 48"
      `);
});

test("false", async () => {
  const output = path.join(
    testsDirectory,
    `false${process.platform === "win32" ? ".exe" : ""}`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/false",
    "--output",
    output,
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "{{caxa}}/index.js",
  ]);
  await expect(execa(output)).rejects.toThrowError(
    "Command failed with exit code 1"
  );
});

test("--force", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--force${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "{{caxa}}/index.js",
    "some",
    "embedded arguments",
    "--an-option-thats-part-of-the-command",
  ]);
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "{{caxa}}/index.js",
    "some",
    "embedded arguments",
    "--an-option-thats-part-of-the-command",
  ]);
  await expect(
    execa("ts-node", [
      "src/index.ts",
      "--input",
      "examples/echo-command-line-parameters",
      "--output",
      output,
      "--no-force",
      "--",
      "{{caxa}}/node_modules/.bin/node",
      "{{caxa}}/index.js",
      "some",
      "embedded arguments",
      "--an-option-thats-part-of-the-command",
    ])
  ).rejects.toThrowError();
});

test("--exclude", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--exclude${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--exclude",
    "examples/echo-command-line-parameters/index.js",
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "--print",
    'JSON.stringify(require("fs").existsSync(require("path").join(String.raw`{{caxa}}`, "index.js")))',
  ]);
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(
    `"false"`
  );
});

test("--dedupe", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--dedupe${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--no-dedupe",
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "--print",
    'JSON.stringify(require("fs").existsSync(require("path").join(String.raw`{{caxa}}`, "package-lock.json")))',
  ]);
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(
    `"false"`
  );
});

test("--prepare-command", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--prepare-command${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--prepare-command",
    `"${process.execPath}" --eval "require('fs').writeFileSync('prepare-output.txt', '')"`,
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "--print",
    'JSON.stringify(require("fs").existsSync(require("path").join(String.raw`{{caxa}}`, "prepare-output.txt")))',
  ]);
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(
    `"true"`
  );
});

test("--include-node", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--include-node${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--no-include-node",
    "--",
    process.execPath,
    "--print",
    'JSON.stringify(require("fs").existsSync(require("path").join(String.raw`{{caxa}}`, "node_modules/.bin/node")))',
  ]);
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(
    `"false"`
  );
});

test("--stub", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--stub${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await expect(
    execa("ts-node", [
      "src/index.ts",
      "--input",
      "examples/echo-command-line-parameters",
      "--output",
      output,
      "--stub",
      "/a-path-that-doesnt-exist",
      "--",
      "{{caxa}}/node_modules/.bin/node",
      "{{caxa}}/index.js",
      "some",
      "embedded arguments",
      "--an-option-thats-part-of-the-command",
    ])
  ).rejects.toThrowError();
});

test("--identifier", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--identifier${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--identifier",
    "identifier",
    "--",
    process.execPath,
    "--print",
    'JSON.stringify(require("fs").existsSync(require("path").join(require("os").tmpdir(), "caxa/applications/identifier")))',
  ]);
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(
    `"true"`
  );
});

test("--remove-build-directory", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--remove-build-directory${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--no-remove-build-directory",
    "--prepare-command",
    `"${process.execPath}" --eval "require('fs').writeFileSync('build-directory.txt', process.cwd())"`,
    "--",
    process.execPath,
    "--print",
    'JSON.stringify(require("fs").existsSync(require("fs").readFileSync(require("path").join(String.raw`{{caxa}}`, "build-directory.txt"), "utf8")))',
  ]);
  expect((await execa(output, { all: true })).all).toMatchInlineSnapshot(
    `"true"`
  );
});

test("--uncompression-message", async () => {
  const output = path.join(
    testsDirectory,
    `echo-command-line-parameters--uncompression-message${
      process.platform === "win32" ? ".exe" : ""
    }`
  );
  await execa("ts-node", [
    "src/index.ts",
    "--input",
    "examples/echo-command-line-parameters",
    "--output",
    output,
    "--uncompression-message",
    "This may take a while to run the first time, please wait...",
    "--",
    "{{caxa}}/node_modules/.bin/node",
    "{{caxa}}/index.js",
    "some",
    "embedded arguments",
    "--an-option-thats-part-of-the-command",
  ]);
  expect((await execa(output, { all: true })).all).toMatch(
    "This may take a while to run the first time, please wait..."
  );
});
