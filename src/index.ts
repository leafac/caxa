#!/usr/bin/env node

import process from "process";
import path from "path";
import os from "os";
import { strict as assert } from "assert";
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
  const format = output.endsWith(".app")
    ? "macOS Application Bundle"
    : "Self-Extracting on UNIX";
  if (format === "macOS Application Bundle" && os.platform() !== "darwin")
    throw new Error(
      "macOS Application Bundles (.app) are supported in macOS only."
    );
  if (format === "macOS Application Bundle" && removeBuildDirectory)
    throw new Error(
      "The ‘removeBuildDirectory’ option doesn’t make sense with the macOS Application Bundle (.app) format."
    );
  let buildDirectory =
    format === "Self-Extracting on UNIX"
      ? path.join(
          "/tmp/caxa",
          path.basename(output),
          cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
        )
      : format === "macOS Application Bundle"
      ? path.join(output, "Contents/Resources/app")
      : undefined;
  assert(typeof buildDirectory === "string");
  const binDirectory = path.join(buildDirectory, "node_modules/.bin");
  await fs.copy(directoryToPackage, buildDirectory);
  await execa("npm", ["prune", "--production"], { cwd: buildDirectory });
  await execa("npm", ["dedupe"], { cwd: buildDirectory });
  await fs.copy(
    process.execPath,
    path.join(binDirectory, path.basename(process.execPath))
  );
  switch (format) {
    case "Self-Extracting on UNIX": {
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
      break;
    }

    case "macOS Application Bundle": {
      const entryPoint = path.join(
        output,
        "Contents/MacOS",
        path.basename(output, ".app")
      );
      const dirname = `$(dirname "$0")`;
      const buildDirectory = `${dirname}/../Resources/app`;
      const binDirectory = `${buildDirectory}/node_modules/.bin`;
      await fs.ensureDir(path.dirname(entryPoint));
      await fs.writeFile(
        entryPoint,
        sh`
          #!/usr/bin/env sh

          # Packaged by caxa/${VERSION} (https://github.com/leafac/caxa)

          env CAXA=true PATH="${binDirectory}:$PATH" ${commandToRun.replaceAll(
          /\{\{\s*caxa\s*\}\}/g,
          buildDirectory
        )} "$@"
        `,
        { mode: 0o755 }
      );
      break;
    }
  }
  if (removeBuildDirectory) await fs.remove(buildDirectory);
  return buildDirectory;
}

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
