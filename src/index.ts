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
  directory,
  command,
  output,
  identifier,
}: {
  directory: string;
  command: string[];
  output: string;
  identifier?: string;
}): Promise<void> {
  if (
    !(await fs.pathExists(directory)) ||
    !(await fs.lstat(directory)).isDirectory()
  )
    throw new Error(`The path to package isn’t a directory: ‘${directory}’.`);

  if (!identifier) {
    identifier = path.join(
      path.basename(path.basename(output, ".app"), ".exe"),
      cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
    );
  }
  const appDirectory = path.join(os.tmpdir(), "caxa", identifier);
  await fs.copy(directory, appDirectory);
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
    await fs.copyFile(
      path.join(
        __dirname,
        "../stubs",
        ({
          win32: "windows.exe",
          darwin: "macos",
          linux: "linux",
        } as { [platform: string]: string })[process.platform] ??
          (() => {
            throw new Error("caxa isn’t supported on this operating system.");
          })()
      ),
      output
    );
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
      .requiredOption(
        "-d, --directory <directory>",
        "The directory to package."
      )
      .requiredOption(
        "-c, --command <command-and-arguments...>",
        "The command to run and optional arguments to pass to the command every time the executable is called. Paths must be absolute. The ‘{{caxa}}’ placeholder is substituted for the folder from which the package runs. The ‘node’ executable is available at ‘{{caxa}}/node_modules/.bin/node’. Use double quotes to delimit the command and each argument."
      )
      .requiredOption(
        "-o, --output <output>",
        "The path at which to produce the executable. Overwrites existing files/folders. On Windows must end in ‘.exe’. On macOS may end in ‘.app’ to generate a macOS Application Bundle."
      )
      .option(
        "-i, --identifier <identifier>",
        "Sets a manual app identifier. By default it is a random id based by the basename of output file. Example echo-command-line-parameters/1.2.3"
      )
      .version(require("../package.json").version)
      .addHelpText(
        "after",
        `
Examples:

  Windows:
  > caxa --directory "examples/echo-command-line-parameters" --command "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.js" "some" "embedded arguments" --output "echo-command-line-parameters.exe"

  macOS/Linux:
  $ caxa --directory "examples/echo-command-line-parameters" --command "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.js" "some" "embedded arguments" --output "echo-command-line-parameters"

  macOS (Application Bundle):
  $ caxa --directory "examples/echo-command-line-parameters" --command "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.js" "some" "embedded arguments" --output "Echo Command Line Parameters.app"
`
      )
      .action(
        async ({
          directory,
          command,
          output,
          identifier,
        }: {
          directory: string;
          command: string[];
          output: string;
          identifier?: string;
        }) => {
          try {
            await caxa({ directory, command, output, identifier });
          } catch (error) {
            console.error(error.message);
            process.exit(1);
          }
        }
      )
      .parseAsync();
  })();
