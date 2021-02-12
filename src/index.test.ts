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
    `ts-node src/index.ts examples/echo-command-line-parameters "node '[CAXA]/index.js'" "${temporaryDirectory}/echo-command-line-parameters"`,
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
