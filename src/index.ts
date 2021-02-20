#!/usr/bin/env node

import process from "process";
import path from "path";
import fs from "fs-extra";
import execa from "execa";
import archiver from "archiver";
import cryptoRandomString from "crypto-random-string";
import * as commander from "commander";
import sh from "dedent";

const VERSION = require("../package.json").version;

export default async function caxa({
  directoryToPackage,
  commandToRun,
  output,
  removeBuildDirectory = false,
}: {
  directoryToPackage: string;
  commandToRun: string;
  output: string;
  removeBuildDirectory?: boolean;
}): Promise<string> {
  if (
    !(await fs.pathExists(directoryToPackage)) ||
    !(await fs.lstat(directoryToPackage)).isDirectory()
  )
    throw new Error(
      `Directory to package isn’t a directory: ‘${directoryToPackage}’`
    );
  const packageName = path.basename(path.resolve(directoryToPackage));
  const buildDirectory = path.join(
    "/tmp/caxa",
    packageName,
    cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
  );
  const binDirectory = path.join(buildDirectory, "node_modules/.bin");
  await fs.copy(directoryToPackage, buildDirectory);
  await execa("npm", ["prune", "--production"], { cwd: buildDirectory });
  await execa("npm", ["dedupe"], { cwd: buildDirectory });
  await fs.copy(
    process.execPath,
    path.join(binDirectory, path.basename(process.execPath))
  );
  let stub =
    sh`
      #!/usr/bin/env sh

      # Packaged by caxa/${VERSION} (https://github.com/leafac/caxa)

      if [ ! -d "${buildDirectory}" ]; then
        mkdir -p "${buildDirectory}"
        tail -n+{{ caxaPayloadStart }} "$0" | tar -xzC "${buildDirectory}"
      fi

      env CAXA=true PATH="${binDirectory}:$PATH" ${commandToRun.replaceAll(
      /\{\{\s*caxa\s*\}\}/g,
      buildDirectory
    )} "$@"
      exit $?
    ` + `\n\n${"#".repeat(80)}\n\n`;
  stub = stub.replace(
    "{{ caxaPayloadStart }}",
    String(stub.split("\n").length)
  );
  await fs.writeFile(output, stub, { mode: 0o755 });
  const payload = archiver("tar");
  payload.pipe(fs.createWriteStream(output, { flags: "a" }));
  payload.directory(buildDirectory, false);
  await payload.finalize();
  if (removeBuildDirectory) await fs.remove(buildDirectory);
  return buildDirectory;
}

// TODO: Extensions:
//       No-extension (self-extracting binary) (macOS / Linux)
//       .app / .app.zip / .app.tar.gz / .app.tgz (Bundle) (option to show the terminal or not) (macOS)
//       .exe / .exe.zip / .exe.tar.gz / .exe.tgz (self-extracting binary) (option to show the terminal or not) (Windows)
//       .zip / .tar.gz / .tgz (Binary bundle) (macOS / Linux / Windows)

if (require.main === module)
  (async () => {
    await commander.program
      .arguments("<directory-to-package> <command-to-run> <output>")
      .option("-r, --remove-build-directory")
      .version(VERSION)
      .action(
        async (
          directoryToPackage: string,
          commandToRun: string,
          output: string,
          {
            removeBuildDirectory,
          }: { removeBuildDirectory: boolean | undefined }
        ) => {
          try {
            await caxa({
              directoryToPackage,
              commandToRun,
              output,
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
