#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import * as commander from "commander";
import shell from "shelljs";
import cryptoRandomString from "crypto-random-string";

export default function caxa(
  directoryToPackage: string,
  commandToRun: string,
  output: string
): void {
  const packageName = path.basename(directoryToPackage);
  const buildDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), `caxa-${packageName}-`)
  );
  const packageDirectory = path.join(buildDirectory, packageName);
  const binDirectory = path.join(packageDirectory, "node_modules/.bin");
  const tarFile = `${packageDirectory}.tar.gz`;
  const untarDirectory = path.join(
    "/tmp",
    `${packageName}-${cryptoRandomString({ length: 10 })}`
  );
  const untarPackageDirectory = path.join(untarDirectory, packageName);
  const untarBinDirectory = path.join(
    untarPackageDirectory,
    "node_modules/.bin"
  );
  console.log(`Build directory: ‘${buildDirectory}’`);
  shell.cp("-R", directoryToPackage, buildDirectory);
  // TODO: Allow user to provide more paths to delete.
  shell.rm("-rf", path.join(packageDirectory, ".git"));
  // TODO: Allow user to not run ‘prune’.
  shell.exec("npm prune --production", { cwd: packageDirectory });
  shell.mkdir("-p", binDirectory);
  shell.cp(process.execPath, binDirectory);
  // TODO: Allow user to keep output silent.
  shell.exec(`tar -cvzf ${tarFile} ${packageName}`, {
    cwd: buildDirectory,
  }).stdout;
  fs.writeFileSync(
    output,
    `#!/usr/bin/env sh
if [ ! -d "${untarDirectory}" ]; then
  mkdir -p ${untarDirectory}
  tail -n+8 $0 | tar -xzC ${untarDirectory}
fi
env PATH=${untarBinDirectory}:$PATH ${commandToRun.replaceAll(
      ":caxa:",
      untarPackageDirectory
    )}
exit $?
`,
    { mode: 0o755 }
  );
  fs.appendFileSync(output, fs.readFileSync(tarFile));
  // TODO: Add option to remove build files?
}

if (require.main === module)
  commander.program
    .version(require("../package.json").version)
    .arguments("<directory-to-package> <command-to-run> <output>")
    .action(
      (directoryToPackage: string, commandToRun: string, output: string) => {
        caxa(directoryToPackage, commandToRun, output);
      }
    )
    .parse();
