import { jest, test, expect, beforeAll } from "@jest/globals";
import os, { platform } from "os";
import path from "path";
import fs from "fs-extra";
import execa from "execa";
import cryptoRandomString from "crypto-random-string";
import caxa from ".";

jest.setTimeout(60000);

const testsDirectory = path.join(
  os.tmpdir(),
  "caxa-tests",
  cryptoRandomString({
    length: 10,
    type: "alphanumeric",
  }).toLowerCase()
);
beforeAll(async () => {
  await fs.ensureDir(testsDirectory);
});

if (process.platform === "win32") test("echo-command-line-parameters.exe");

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
