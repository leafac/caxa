#!/usr/bin/env node

import commander from "commander";

import caxa from "./index.mjs";

await commander.program
  .version(require("../package.json").version)
  .requiredOption("-i, --input <input>", "The input directory to package.")
  .requiredOption(
    "-o, --output <output>",
    "The path where the executable will be produced. On Windows must end in ‘.exe’. In macOS may end in ‘.app’ to generate a macOS Application Bundle. In macOS and Linux, may end in ‘.sh’ to use the Shell Stub, which takes less space, but depends on some tools being installed on the end-user machine, for example, ‘tar’, ‘tail’, and so forth."
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
  .option(
    "-m, --uncompression-message <message>",
    "[Advanced] A message to show when uncompressing, for example, ‘This may take a while to run the first time, please wait...’."
  )
  .arguments("<command...>")
  .argument(
    "command",
    "The command to run and optional arguments to pass to the command every time the executable is called. Paths must be absolute. The ‘{{caxa}}’ placeholder is substituted for the folder from which the package runs. The ‘node’ executable is available at ‘{{caxa}}/node_modules/.bin/node’. Use double quotes to delimit the command and each argument."
  )
  .description("Package Node.js applications into executable binaries.")
  .addHelpText(
    "after",
    `
Examples:

  Windows:
  > caxa --input "examples/echo-command-line-parameters" --output "echo-command-line-parameters.exe" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.mjs" "some" "embedded arguments" "--an-option-thats-part-of-the-command"

  macOS/Linux:
  $ caxa --input "examples/echo-command-line-parameters" --output "echo-command-line-parameters" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.mjs" "some" "embedded arguments" "--an-option-thats-part-of-the-command"

  macOS (Application Bundle):
  $ caxa --input "examples/echo-command-line-parameters" --output "Echo Command Line Parameters.app" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.mjs" "some" "embedded arguments" "--an-option-thats-part-of-the-command"

  macOS/Linux (Shell Stub):
  $ caxa --input "examples/echo-command-line-parameters" --output "echo-command-line-parameters.sh" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/index.mjs" "some" "embedded arguments" "--an-option-thats-part-of-the-command"
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
        uncompressionMessage,
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
        uncompressionMessage?: string;
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
          uncompressionMessage,
        });
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    }
  )
  .showHelpAfterError()
  .parseAsync();
