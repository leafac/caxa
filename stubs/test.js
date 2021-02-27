const stream = require("stream/promises");
const fs = require("fs-extra");
const execa = require("execa");
const archiver = require("archiver");
const cryptoRandomString = require("crypto-random-string");

(async () => {
  await fs.remove("stub.exe");
  await execa("go", ["build", "stub.go"]);
  await fs.appendFile("stub.exe", "#".repeat(10));
  const archive = archiver("tar", { gzip: true });
  const archiveStream = fs.createWriteStream("stub.exe", { flags: "a" });
  archive.pipe(archiveStream);
  archive.append("HELLO WORLD", { name: "example.txt" });
  await archive.finalize();
  await stream.finished(archiveStream);
  await fs.appendFile(
    "stub.exe",
    "\n" +
      JSON.stringify({
        identifier: `testing-stub-${cryptoRandomString({
          length: 10,
          type: "alphanumeric",
        })}`,
        command: { file: "i-dont-exist", arguments: [] },
      })
  );
})();
