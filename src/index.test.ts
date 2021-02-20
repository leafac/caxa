import { jest, test, expect, beforeAll } from "@jest/globals";
import os from "os";
import path from "path";
import fs from "fs-extra";
import execa from "execa";
import caxa from ".";

jest.setTimeout(60000);

let temporaryDirectory: string;
beforeAll(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "caxa-tests-"));
});

test("echo-command-line-parameters", async () => {
  const binary = path.join(temporaryDirectory, "echo-command-line-parameters");
  await caxa({
    directoryToPackage: "examples/echo-command-line-parameters",
    commandToRun: `node "{{caxa}}/index.js"`,
    output: binary,
    removeBuildDirectory: true,
  });
  await expect(
    (await execa(binary, ["parameter-without-spaces", "parameter with spaces"]))
      .stdout
  ).toMatchInlineSnapshot(`
          "[
            \\"parameter-without-spaces\\",
            \\"parameter with spaces\\"
          ]"
        `);
});

test("native-modules", async () => {
  const binary = path.join(temporaryDirectory, "native-modules");
  await execa("npm", ["install"], { cwd: "examples/native-modules" });
  await caxa({
    directoryToPackage: "examples/native-modules",
    commandToRun: `node "{{caxa}}/index.js"`,
    output: binary,
    removeBuildDirectory: true,
  });
  await expect((await execa(binary)).stdout).toMatchInlineSnapshot(`
          "@leafac/sqlite: {
            \\"example\\": \\"caxa native modules\\"
          }
          sharp: 48"
        `);
});
