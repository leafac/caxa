#!/usr/bin/env node

import process from "process";
import path from "path";
import os from "os";
import fs from "fs-extra";
import execa from "execa";
import archiver from "archiver";
import cryptoRandomString from "crypto-random-string";
import * as commander from "commander";
import sh from "dedent";

export default async function caxa({
  directory,
  command,
  output,
}: {
  directory: string;
  command: string[];
  output: string;
}): Promise<void> {
  if (
    !(await fs.pathExists(directory)) ||
    !(await fs.lstat(directory)).isDirectory()
  )
    throw new Error(`Given path isn’t a directory: ‘${directory}’`);

  const buildDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), `caxa-build-`)
  );
  await fs.copy(directory, buildDirectory);
  await execa("npm", ["prune", "--production"], { cwd: buildDirectory });
  await execa("npm", ["dedupe"], { cwd: buildDirectory });

  await fs.copyFile(
    path.join(
      __dirname,
      "../stubs",
      ({
        win32: "windows",
        darwin: "macos",
        linux: "linux",
      } as { [platform: string]: string })[os.platform()] ??
        (() => {
          throw new Error("caxa isn’t supported on this platform.");
        })()
    ),
    output
  );
  const archive = archiver("tar", { gzip: true });
  const archiveStream = fs.createWriteStream(output, { flags: "a" });
  archive.pipe(archiveStream);
  archive.directory(buildDirectory, false);
  archive.file(process.execPath, {
    name: path.join("node_modules/.bin/", path.basename(process.execPath)),
  });
  await archive.finalize();
  // FIXME: Use ‘stream/promises’ when Node.js 16 lands, because then an LTS version will have the feature: await stream.finished(archiveStream);
  await new Promise((resolve, reject) => {
    archiveStream.on("finish", resolve);
    archiveStream.on("error", reject);
  });
  await fs.appendFile(
    output,
    "\n" +
      JSON.stringify({
        identifier: cryptoRandomString({ length: 10, type: "alphanumeric" }),
        command,
      })
  );

  // const format = output.endsWith(".app")
  //   ? "macOS Application Bundle"
  //   : "Self-Extracting on UNIX";
  // if (format === "macOS Application Bundle" && os.platform() !== "darwin")
  //   throw new Error(
  //     "macOS Application Bundles (.app) are supported in macOS only."
  //   );
  // let buildDirectory =
  //   format === "Self-Extracting on UNIX"
  //     ? path.join(
  //         "/tmp/caxa",
  //         path.basename(output),
  //         cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
  //       )
  //     : format === "macOS Application Bundle"
  //     ? path.join(output, "Contents/Resources/app")
  //     : undefined;
  // assert(typeof buildDirectory === "string");
  // const binDirectory = path.join(buildDirectory, "node_modules/.bin");
  // await execa("npm", ["prune", "--production"], { cwd: buildDirectory });
  // await execa("npm", ["dedupe"], { cwd: buildDirectory });
  // await fs.copy(
  //   process.execPath,
  //   path.join(binDirectory, path.basename(process.execPath))
  // );
  // switch (format) {
  //   case "Self-Extracting on UNIX": {
  //     let stub =
  //       sh`
  //         #!/usr/bin/env sh

  //         # Packaged by caxa/${VERSION} (https://github.com/leafac/caxa)

  //         if [ ! -d "${buildDirectory}" ]; then
  //           mkdir -p "${buildDirectory}"
  //           tail -n+{{ caxaPayloadStart }} "$0" | tar -xzC "${buildDirectory}"
  //         fi

  //         env CAXA=true PATH="${binDirectory}:$PATH" ${command.replaceAll(
  //         /\{\{\s*caxa\s*\}\}/g,
  //         buildDirectory
  //       )} "$@"
  //         exit $?
  //       ` + `\n\n${"#".repeat(80)}\n\n`;
  //     stub = stub.replace(
  //       "{{ caxaPayloadStart }}",
  //       String(stub.split("\n").length)
  //     );
  //     await fs.writeFile(output, stub, { mode: 0o755 });
  //     const payload = archiver("tar");
  //     payload.pipe(fs.createWriteStream(output, { flags: "a" }));
  //     payload.directory(buildDirectory, false);
  //     await payload.finalize();
  //     break;
  //   }

  //   case "macOS Application Bundle": {
  //     const entryPoint = path.join(
  //       output,
  //       "Contents/MacOS",
  //       path.basename(output, ".app")
  //     );
  //     const dirname = `$(dirname "$0")`;
  //     const buildDirectory = `${dirname}/../Resources/app`;
  //     const binDirectory = `${buildDirectory}/node_modules/.bin`;
  //     await fs.ensureDir(path.dirname(entryPoint));
  //     await fs.writeFile(
  //       entryPoint,
  //       sh`
  //         #!/usr/bin/env sh

  //         # Packaged by caxa/${VERSION} (https://github.com/leafac/caxa)

  //         env CAXA=true PATH="${binDirectory}:$PATH" ${command.replaceAll(
  //         /\{\{\s*caxa\s*\}\}/g,
  //         buildDirectory
  //       )} "$@"
  //       `,
  //       { mode: 0o755 }
  //     );
  //     break;
  //   }
  // }
  // if (removeBuildDirectory) await fs.remove(buildDirectory);
  // return buildDirectory;

//   if (process.platform !== "win32")
//   package.append(
//     `#!/usr/bin/env sh
// "$(dirname "$0")/app/node_modules/.bin/node" "$(dirname "$0")/app/lib/index.js" "$(dirname "$0")/configuration.js"
// `,
//     { name: "courselore/courselore", mode: 0o755 }
//   );
// else
//   package.append(`"src\\node_modules\\.bin\\node.exe" "src\\lib\\index.js"`, {
//     name: "courselore/courselore.cmd",
//   });
}

if (require.main === module)
  (async () => {
    await commander.program
      .requiredOption("-d, --directory <directory>")
      .requiredOption("-c, --command <command-and-arguments...>")
      .requiredOption("-o, --output <output>")
      .version(require("../package.json").version)
      .addHelpText(
        "after",
        `Examples:
`
      )
      .action(
        async ({
          directory,
          command,
          output,
        }: {
          directory: string;
          command: string[];
          output: string;
        }) => {
          try {
            await caxa({
              directory,
              command,
              output,
            });
          } catch (error) {
            console.error(error.message);
            process.exit(1);
          }
        }
      )
      .parseAsync();
  })();
