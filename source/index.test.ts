import { jest, beforeAll, test, expect, describe } from "@jest/globals";
import os from "os";
import path from "path";
import fs from "fs-extra";
import execa from "execa";

jest.setTimeout(300_000);

// Windows doesn't return DOMAIN\username with os.userInfo().username,
// but the go implementation does, we have to emulate that with env vars
// also instead of backslash we use an underscore so DOMAIN\username
// Its not converted to a path slug
// Ref: https://github.com/leafac/caxa/issues/53#issuecomment-1113285692
const username =
  process.platform === "win32"
    ? `${process.env.USERDOMAIN}_${process.env.USERNAME}`
    : os.userInfo().username;

const caxaDirectory = path.join(os.tmpdir(), "caxa");
const userDirectory = path.join(caxaDirectory, username);
const testsDirectory = path.join(userDirectory, "tests");
beforeAll(async () => {
  await fs.remove(userDirectory);
});

describe("example programs", () => {
  test("echo-command-line-parameters", async () => {
    const output = path.join(
      testsDirectory,
      `echo-command-line-parameters${
        process.platform === "win32" ? ".exe" : ""
      }`
    );
    await execa("ts-node", [
      "source/index.ts",
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
        "source/index.ts",
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
            path.join(
              output,
              "/Contents/Resources/Echo Command Line Parameters"
            ),
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
      const output = path.join(
        testsDirectory,
        "echo-command-line-parameters.sh"
      );
      await execa("ts-node", [
        "source/index.ts",
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
      "source/index.ts",
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
    // Delete node_modules for multi user tests
    // or else next user will fail with permission denied for npm ci
    await fs.remove(path.resolve("./examples/native-modules/node_modules"));
  });

  test("false", async () => {
    const output = path.join(
      testsDirectory,
      `false${process.platform === "win32" ? ".exe" : ""}`
    );
    await execa("ts-node", [
      "source/index.ts",
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

  describe(`multi user test - Set env MULTI_USER to enable${
    "MULTI_USER" in process.env ? "(enabled)" : ""
  } - Will run OS specific test`, () => {
    const testIf = (
      condition: boolean,
      ...args: [testName: string, fn: () => void, timeout?: number | undefined]
    ) => (condition ? test(...args) : test.skip(...args));

    const caxaDirectory = path.join(os.tmpdir(), "caxa");

    testIf(
      "MULTI_USER" in process.env && process.platform === "linux",
      "multi-user.linux",
      async () => {
        async function encryptPwd(pass: string) {
          const io = await execa("openssl", ["passwd", "-1", pass]);
          return io.stdout;
        }

        async function hasSudo() {
          const testsudo = await execa("sudo", ["-vn"], {
            all: true,
            reject: false,
          });
          return !testsudo.failed;
        }

        async function createUser(username: string, password: string) {
          const useradd = await execa(
            "sudo",
            ["useradd", "-p", await encryptPwd(password), username],
            { all: true }
          ).catch((err) => {
            if (err.stderr.includes("Permission denied")) {
              console.error("Cannot useradd without sudo");
            } else if (err.stderr.includes("already exists")) {
              console.error("User already exists, ok");
              return true;
            } else {
              console.error("Unhandled error");
              console.error(err);
            }
            process.exit(1);
          });
          return true;
        }

        async function deleteUser(username: string) {
          const userdel = await execa("sudo", ["userdel", username], {
            all: true,
          }).catch((err) => {
            if (err.stderr.includes("Permission denied")) {
              console.error("Cannot userdel without sudo");
            } else {
              console.error("Unhandled error");
              console.error(err);
            }
            process.exit(1);
          });
          return true;
        }

        async function runAs(username: string, cmd: string[]) {
          const exec = await execa("sudo", ["-u", username, ...cmd], {
            all: true,
          }).catch((err) => {
            if (err.stderr.includes("Permission denied")) {
              console.error("Cannot run as without sudo");
            } else {
              console.error("Unhandled error");
              console.error(err);
            }
            process.exit(1);
          });

          return exec;
        }

        const canSudo = await hasSudo();
        // ATENTION! MUST have sudo logged in to test multi-user
        // Run 'sudo su' log in and then 'exit', so we can use sudo in the tests without pwd prompt
        expect(canSudo).toBe(true);

        const output = path.join(caxaDirectory, `multi-user`);
        await execa("ts-node", [
          "source/index.ts",
          "--input",
          "examples/multi-user",
          "--output",
          output,
          "--",
          "{{caxa}}/node_modules/.bin/node",
          "{{caxa}}/index.js",
        ]);

        const passwd = "testpasswd";
        const users = ["caxauser1", "caxauser2"];

        // Test 2 users
        for (const user of users) {
          // console.log(`Create user: ${user}`);
          await createUser(user, passwd);

          // Get uid and gid to check later if user dir has correct perms
          const uid = parseInt((await runAs(user, ["id", "-u"])).stdout);
          const gid = parseInt((await runAs(user, ["id", "-g"])).stdout);

          // console.log(`Running program at: ${output}`);
          const caxa = await runAs(user, [output]);
          // console.log("> ", caxa.stdout);

          // TEST: caxa.stdout === username
          expect(caxa.stdout).toBe(user);

          const stats = await fs.stat(path.join(caxaDirectory, user));
          // TEST: check caxa/user permissions
          expect(stats.uid).toBe(uid);
          expect(stats.gid).toBe(gid);
        }

        // console.log("Del users");
        for (const user of users) {
          // console.log(`Deleting user: ${user}`);
          await deleteUser(user);
        }
      }
    );

    testIf(
      "MULTI_USER" in process.env && process.platform === "win32",
      "multi-user.win",
      async () => {
        const output = path.join(testsDirectory, `multi-user.exe`);
        await execa("ts-node", [
          "source/index.ts",
          "--input",
          "examples/multi-user",
          "--output",
          output,
          "--",
          "{{caxa}}/node_modules/.bin/node",
          "{{caxa}}/index.js",
        ]);
        expect(
          (
            await execa(output, {
              all: true,
            })
          ).all
        ).toMatchInlineSnapshot("pipo");
      }
    );
  });
});

describe("caxa parameters", () => {
  test("--force", async () => {
    const output = path.join(
      testsDirectory,
      `echo-command-line-parameters--force${
        process.platform === "win32" ? ".exe" : ""
      }`
    );
    await execa("ts-node", [
      "source/index.ts",
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
      "source/index.ts",
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
        "source/index.ts",
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
      "source/index.ts",
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
      "source/index.ts",
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
      "source/index.ts",
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
      "source/index.ts",
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
        "source/index.ts",
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
      "source/index.ts",
      "--input",
      "examples/echo-command-line-parameters",
      "--output",
      output,
      "--identifier",
      "identifier",
      "--",
      process.execPath,
      "--print",
      `JSON.stringify(require("fs").existsSync(require("path").join(require("os").tmpdir(), "caxa/${username}/applications/identifier")))`,
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
      "source/index.ts",
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
      "source/index.ts",
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
});
