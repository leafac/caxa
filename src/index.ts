#!/usr/bin/env node

import fs from "fs";
import path from "path";
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
  // TODO: Expand ‘directoryToPackage’ (for example, if it’s ‘.’)?
  const packageName = path.basename(directoryToPackage);
  const buildDirectory = path.join(
    "/tmp",
    "caxa",
    packageName,
    cryptoRandomString({
      length: 10,
    })
  );
  const packageDirectory = path.join(buildDirectory, packageName);
  const binDirectory = path.join(packageDirectory, "node_modules/.bin");
  const tarFile = `${packageDirectory}.tar.gz`;
  commandToRun = commandToRun.replaceAll("[CAXA]", packageDirectory);
  console.log(`Build directory: ‘${buildDirectory}’`);
  shell.mkdir("-p", buildDirectory);
  shell.cp("-R", directoryToPackage, buildDirectory);
  // TODO: Allow user to provide more paths to delete.
  shell.rm("-rf", path.join(packageDirectory, ".git"));
  // TODO: Allow user to not run ‘prune’.
  shell.exec("npm prune --production", { cwd: packageDirectory });
  shell.mkdir("-p", binDirectory);
  shell.cp(process.execPath, binDirectory);
  // TODO: Allow user to keep output silent.
  shell.exec(`tar -cvzf "${tarFile}" "${packageName}"`, {
    cwd: buildDirectory,
  });
  shell.mkdir("-p", path.dirname(output));
  let preamble = sh`
    #!/usr/bin/env sh
    # Created by caxa/${VERSION} (https://github.com/leafac/caxa)
    if [ ! -d "${buildDirectory}" ]; then
      mkdir -p "${buildDirectory}"
      tail -n+$CAXA_TAR_LINE_COUNT "$0" | tar -xzC "${buildDirectory}"
    fi
    env PATH="${binDirectory}":$PATH CAXA=true ${commandToRun} "$@"
    exit $?
  `;
  preamble = (preamble + "\n\n__CAXA_TAR__\n\n").replace(
    "$CAXA_TAR_LINE_COUNT",
    String(preamble.split("\n").length + 1)
  );
  fs.writeFileSync(output, preamble, { mode: 0o755 });
  fs.appendFileSync(output, fs.readFileSync(tarFile));
  // TODO: Add option to remove build files?
}

if (require.main === module)
  commander.program
    .version(VERSION)
    .arguments("<directory-to-package> <command-to-run> <output>")
    .action(
      (directoryToPackage: string, commandToRun: string, output: string) => {
        caxa({ directoryToPackage, commandToRun, output });
      }
    )
    .parse();
