import { test, expect } from "@jest/globals";
import os from "os";
import path from "path";
import fs from "fs/promises";
import shell from "shelljs";

test("echo-command-line-parameters", async () => {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "caxa-test-echo-command-line-parameters-")
  );
  shell.exec(
    `ts-node src/index.ts examples/echo-command-line-parameters "node '{{caxa}}/index.js'" "${temporaryDirectory}/echo-command-line-parameters"`,
    { silent: true }
  );
  shell.rm("-rf", "/tmp/caxa/echo-command-line-parameters");
  expect(
    shell.exec(
      `"${temporaryDirectory}/echo-command-line-parameters" single-parameter "parameter separated by spaces" 'parameter delimited by single quotes'`,
      { silent: true }
    ).stdout
  ).toMatchInlineSnapshot(`
    "[
      \\"single-parameter\\",
      \\"parameter separated by spaces\\",
      \\"parameter delimited by single quotes\\"
    ]
    "
  `);
});

test("native-modules", async () => {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "caxa-test-native-modules-")
  );
  shell.exec("npm install", { cwd: "examples/native-modules", silent: true });
  shell.exec(
    `ts-node src/index.ts examples/native-modules "node '{{caxa}}/index.js'" "${temporaryDirectory}/native-modules"`,
    { silent: true }
  );
  shell.rm("-rf", "/tmp/caxa/native-modules");
  expect(
    shell.exec(`"${temporaryDirectory}/native-modules"`, { silent: true })
      .stdout
  ).toMatchInlineSnapshot(`
    "@leafac/sqlite: {
      \\"example\\": \\"caxa native modules\\"
    }
    sharp: 48
    "
  `);
});
