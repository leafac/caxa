#!/usr/bin/env node

import process from "process";
import path from "path";
import os from "os";
import fs from "fs-extra";
import execa from "execa";
import archiver from "archiver";
import cryptoRandomString from "crypto-random-string";
import commander from "commander";

export default async function caxa({
  input,
  output,
  command,
}: {
  input: string;
  output: string;
  command: string[];
}): Promise<void> {
  if (!(await fs.pathExists(input)) || !(await fs.lstat(input)).isDirectory())
    throw new Error(`The path to package isn’t a directory: ‘${input}’.`);

  const identifier = path.join(
    path.basename(path.basename(output, ".app"), ".exe"),
    cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
  );
  const appDirectory = path.join(os.tmpdir(), "caxa/builds", identifier);
  await fs.copy(input, appDirectory);
  await execa("npm", ["prune", "--production"], { cwd: appDirectory });
  await execa("npm", ["dedupe"], { cwd: appDirectory });
  await fs.ensureDir(path.join(appDirectory, "node_modules/.bin"));
  await fs.copyFile(
    process.execPath,
    path.join(
      appDirectory,
      "node_modules/.bin",
      path.basename(process.execPath)
    )
  );

  await fs.ensureDir(path.dirname(output));

  if (output.endsWith(".app")) {
    if (process.platform !== "darwin")
      throw new Error(
        "macOS Application Bundles (.app) are supported in macOS only."
      );
    await fs.remove(output);
    await fs.ensureDir(path.join(output, "Contents/Resources"));
    await fs.move(appDirectory, path.join(output, "Contents/Resources/app"));
    await fs.ensureDir(path.join(output, "Contents/MacOS"));
    const name = path.basename(output, ".app");
    await fs.writeFile(
      path.join(output, "Contents/MacOS", name),
      `#!/usr/bin/env sh\nopen "$(dirname "$0")/../Resources/${name}"`,
      { mode: 0o755 }
    );
    await fs.writeFile(
      path.join(output, "Contents/Resources", name),
      `#!/usr/bin/env sh\n${command
        .map(
          (part) =>
            `"${part.replace(/\{\{\s*caxa\s*\}\}/g, `$(dirname "$0")/app`)}"`
        )
        .join(" ")}`,
      { mode: 0o755 }
    );
  } else {
    if (process.platform === "win32" && !output.endsWith(".exe"))
      throw new Error("An Windows executable must end in ‘.exe’.");
    await fs.copyFile(path.join(__dirname, "../stub"), output);
    const archive = archiver("tar", { gzip: true });
    const archiveStream = fs.createWriteStream(output, { flags: "a" });
    archive.pipe(archiveStream);
    archive.directory(appDirectory, false);
    await archive.finalize();
    // FIXME: Use ‘stream/promises’ when Node.js 16 lands, because then an LTS version will have the feature: await stream.finished(archiveStream);
    await new Promise((resolve, reject) => {
      archiveStream.on("finish", resolve);
      archiveStream.on("error", reject);
    });
    await fs.appendFile(output, "\n" + JSON.stringify({ identifier, command }));
  }
}

if (require.main === module)
  (async () => {
    await commander.program
      .version(require("../package.json").version)
      .requiredOption("-i, --input <input>", "The input directory to package.")
      .requiredOption(
        "-o, --output <output>",
        "The path at which to produce the executable. Overwrites existing files/folders. On Windows must end in ‘.exe’. On macOS may end in ‘.app’ to generate a macOS Application Bundle."
      )
      .arguments("<command...>")
      .description("Package Node.js applications into executable binaries", {
        command:
          "The command to run and optional arguments to pass to the command every time the executable is called. Paths must be absolute. The ‘{{caxa}}’ placeholder is substituted for the folder from which the package runs. The ‘node’ executable is available at ‘{{caxa}}/node_modules/.bin/node’. Use double quotes to delimit the command and each argument.",
      })
      .addHelpText(
        "after",
        `
Examples:

  Windows:
  > caxa --input "examples/echo-command-line-parameters" --output "echo-command-line-parameters.exe" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.js" "some" "embedded arguments" "--an-option-thats-part-of-the-command"

  macOS/Linux:
  $ caxa --input "examples/echo-command-line-parameters" --output "echo-command-line-parameters" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.js" "some" "embedded arguments" "--an-option-thats-part-of-the-command"

  macOS (Application Bundle):
  $ caxa --input "examples/echo-command-line-parameters" --output "Echo Command Line Parameters.app" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.js" "some" "embedded arguments" "--an-option-thats-part-of-the-command"
`
      )
      .action(
        async (
          command: string[],
          {
            input,
            output,
          }: {
            input: string;
            output: string;
          }
        ) => {
          try {
            await caxa({ input, output, command });
          } catch (error) {
            console.error(error.message);
            process.exit(1);
          }
        }
      )
      .parseAsync();
  })();
