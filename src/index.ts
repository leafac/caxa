#!/usr/bin/env node

import process from "process";
import path from "path";
import os from "os";
import fs from "fs-extra";
import execa from "execa";
import archiver from "archiver";
import cryptoRandomString from "crypto-random-string";
import commander from "commander";
import globby from "globby";

export default async function caxa({
  input,
  output,
  command,
  force = true,
  exclude = [],
  filter = (() => {
    const pathsToExclude = globby.sync(exclude, {
      expandDirectories: false,
      onlyFiles: false,
    });
    return (path: string) => !pathsToExclude.includes(path);
  })(),
  dedupe = true,
  prepareCommand,
  prepare = async (buildDirectory: string) => {
    if (prepareCommand === undefined) return;
    await execa.command(prepareCommand, { cwd: buildDirectory, shell: true });
  },
  includeNode = true,
  stub = path.join(
    __dirname,
    `../stubs/stub--${process.platform}--${process.arch}`
  ),
  identifier = path.join(
    path.basename(path.basename(output, ".app"), ".exe"),
    cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
  ),
  removeBuildDirectory = true,
}: {
  input: string;
  output: string;
  command: string[];
  force?: boolean;
  exclude?: string[];
  filter?: fs.CopyFilterSync | fs.CopyFilterAsync;
  dedupe?: boolean;
  prepareCommand?: string;
  prepare?: (buildDirectory: string) => Promise<void>;
  includeNode?: boolean;
  stub?: string;
  identifier?: string;
  removeBuildDirectory?: boolean;
}): Promise<void> {
  if (!(await fs.pathExists(input)) || !(await fs.lstat(input)).isDirectory())
    throw new Error(
      `The path to your application isn’t a directory: ‘${input}’.`
    );
  if ((await fs.pathExists(output)) && !force)
    throw new Error(`Output already exists: ‘${output}’.`);
  if (process.platform === "win32" && !output.endsWith(".exe"))
    throw new Error("An Windows executable must end in ‘.exe’.");

  const buildDirectory = path.join(
    os.tmpdir(),
    "caxa/builds",
    cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
  );
  await fs.copy(input, buildDirectory, { filter });
  if (dedupe)
    await execa("npm", ["dedupe", "--production"], { cwd: buildDirectory });
  await prepare(buildDirectory);
  if (includeNode) {
    const node = path.join(
      buildDirectory,
      "node_modules/.bin",
      path.basename(process.execPath)
    );
    await fs.ensureDir(path.dirname(node));
    await fs.copyFile(process.execPath, node);
  }

  await fs.ensureDir(path.dirname(output));
  await fs.remove(output);

  if (output.endsWith(".app")) {
    if (process.platform !== "darwin")
      throw new Error(
        "macOS Application Bundles (.app) are supported in macOS only."
      );
    await fs.ensureDir(path.join(output, "Contents/Resources"));
    await fs.move(
      buildDirectory,
      path.join(output, "Contents/Resources/application")
    );
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
            `"${part.replace(
              /\{\{\s*caxa\s*\}\}/g,
              `$(dirname "$0")/application`
            )}"`
        )
        .join(" ")}`,
      { mode: 0o755 }
    );
  } else {
    if (!(await fs.pathExists(stub)))
      throw new Error(
        `Stub not found (your operating system / architecture may be unsupported): ‘${stub}’`
      );
    await fs.copyFile(stub, output);
    await fs.chmod(output, 0o755);
    const archive = archiver("tar", { gzip: true });
    const archiveStream = fs.createWriteStream(output, { flags: "a" });
    archive.pipe(archiveStream);
    archive.directory(buildDirectory, false);
    await archive.finalize();
    // FIXME: Use ‘stream/promises’ when Node.js 16 lands, because then an LTS version will have the feature: await stream.finished(archiveStream);
    await new Promise((resolve, reject) => {
      archiveStream.on("finish", resolve);
      archiveStream.on("error", reject);
    });
    await fs.appendFile(output, "\n" + JSON.stringify({ identifier, command }));
  }

  if (removeBuildDirectory) await fs.remove(buildDirectory);
}

if (require.main === module)
  (async () => {
    await commander.program
      .version(require("../package.json").version)
      .requiredOption("-i, --input <input>", "The input directory to package.")
      .requiredOption(
        "-o, --output <output>",
        "The path where the executable will be produced. On Windows must end in ‘.exe’. On macOS may end in ‘.app’ to generate a macOS Application Bundle."
      )
      .option("-f, --force", "[Advanced] Overwrite output if it exists.", true)
      .option("-F, --no-force")
      .option(
        "-e, --exclude <path...>",
        `[Advanced] Paths to exclude from the build. The paths are passed to https://github.com/sindresorhus/globby and paths that match will be excluded. [Super-Advanced, Please don’t use] If you wish to emulate ‘--include’, you may use ‘--exclude "*" ".*" "!path-to-include" ...’. The problem with ‘--include’ is that if you change your project structure but forget to change the caxa invocation, then things will subtly fail only in the packaged version.`
      )
      .option(
        "-d, --dedupe",
        "[Advanced] Run ‘npm dedupe --production’ on the build directory.",
        true
      )
      .option("-D, --no-dedupe")
      .option(
        "-p, --prepare-command <command>",
        "[Advanced] Command to run on the build directory while packaging."
      )
      .option(
        "-n, --include-node",
        "[Advanced] Copy the Node.js executable to ‘{{caxa}}/node_modules/.bin/node’.",
        true
      )
      .option("-N, --no-include-node")
      .option("-s, --stub <path>", "[Advanced] Path to the stub.")
      .option(
        "--identifier <identifier>",
        "[Advanced] Build identifier, which is the path in which the application will be unpacked."
      )
      .option(
        "-b, --remove-build-directory",
        "[Advanced] Remove the build directory after the build.",
        true
      )
      .option("-B, --no-remove-build-directory")
      .arguments("<command...>")
      .description("Package Node.js applications into executable binaries.", {
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
            force,
            exclude = [],
            dedupe,
            prepareCommand,
            includeNode,
            stub,
            identifier,
            removeBuildDirectory,
          }: {
            input: string;
            output: string;
            force?: boolean;
            exclude?: string[];
            dedupe?: boolean;
            prepareCommand?: string;
            includeNode?: boolean;
            stub?: string;
            identifier?: string;
            removeBuildDirectory?: boolean;
          }
        ) => {
          try {
            await caxa({
              input,
              output,
              command,
              force,
              exclude,
              dedupe,
              prepareCommand,
              includeNode,
              stub,
              identifier,
              removeBuildDirectory,
            });
          } catch (error) {
            console.error(error.message);
            process.exit(1);
          }
        }
      )
      .parseAsync();
  })();
