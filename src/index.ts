#!/usr/bin/env node

import fs from "fs";
import path from "path";
import archiver from "archiver";
import shell from "shelljs";
import cryptoRandomString from "crypto-random-string";
import * as commander from "commander";
import sh from "dedent";

const VERSION = require("../package.json").version;

export default function caxa({
  directoryToPackage,
  commandToRun,
  output,
}: {
  directoryToPackage: string;
  commandToRun: string;
  output: string;
}): void {
  const packageName = path.basename(path.resolve(directoryToPackage));
  const buildDirectory = path.join(
    "/tmp/caxa",
    packageName,
    cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
  );
  commandToRun = commandToRun.replaceAll(/\{\{\s*caxa\s*\}\}/g, buildDirectory);
  const binDirectory = path.join(buildDirectory, "node_modules/.bin");
  shell.mkdir("-p", path.dirname(buildDirectory));
  shell.cp("-R", directoryToPackage, buildDirectory);
  shell.exec("npm prune --production", { cwd: buildDirectory });
  shell.exec("npm dedupe", { cwd: buildDirectory });
  shell.mkdir("-p", binDirectory);
  shell.cp(process.execPath, binDirectory);
  shell.mkdir("-p", path.dirname(output));
  let stub =
    sh`
      #!/usr/bin/env sh

      # Packaged by caxa/${VERSION} (https://github.com/leafac/caxa)

      if [ ! -d "${buildDirectory}" ]; then
        mkdir -p "${buildDirectory}"
        tail -n+{{caxaStubLineCount}} "$0" | tar -xzC "${buildDirectory}"
      fi

      env CAXA=true PATH="${binDirectory}:$PATH" ${commandToRun} "$@"
      exit $?
    ` + `\n\n${"#".repeat(80)}\n\n`;
  stub = stub.replace("{{caxaStubLineCount}}", String(stub.split("\n").length));
  fs.writeFileSync(output, stub, { mode: 0o755 });
  const payload = archiver("tar");
  payload.pipe(fs.createWriteStream(output, { flags: "a" }));
  payload.directory(buildDirectory, false);
  payload.finalize();
  // TODO: Add option to remove build files?
  // TODO: Return ‘buildDirectory’?
}

// TODO: Extensions:
//       No-extension (self-extracting binary) (macOS / Linux)
//       .app / .app.zip / .app.tar.gz / .app.tgz (Bundle) (option to show the terminal or not) (macOS)
//       .exe / .exe.zip / .exe.tar.gz / .exe.tgz (self-extracting binary) (option to show the terminal or not) (Windows)
//       .zip / .tar.gz / .tgz (Binary bundle) (macOS / Linux / Windows)

if (require.main === module)
  commander.program
    .arguments("<directory-to-package> <command-to-run> <output>")
    .version(VERSION)
    .action(
      (directoryToPackage: string, commandToRun: string, output: string) => {
        caxa({ directoryToPackage, commandToRun, output });
      }
    )
    .parse();
