const download = require("download");
const fs = require("fs-extra");
const path = require("path");
const package = require("./package.json");
const crypto = require("crypto");

const stubName = [
  "stub",
  process.platform,
  process.arch,
  process.config.variables.arm_version,
]
  .filter((x) => x !== undefined)
  .join("--");
// const downloadPath = `https://github.com/leafac/caxa/releases/download/v${package.version}/${stub}`;

const downloadPath = `https://github.com/maxb2/caxa/releases/download/v1.0.0-test52/${stubName}`;

const parseFile = (file, stubName) => {
  const lines = file.split("\n");
  for (const line of lines) {
    const [hash, name] = line.split(" ");
    if (name === stubName) return hash;
  }
};

(async () => {
  const stubPath = path.join(__dirname, "stub");
  await fs.writeFile(stubPath, await download(downloadPath));
  const stubHash = crypto
    .createHash("sha256")
    .update(await fs.readFile(stubPath))
    .digest()
    .toString("hex");
  const checksums = await fs.readFile(
    path.join(__dirname, "checksums.txt"),
    "utf8"
  );
  const david = checksums.includes(`${stubHash}  ${stubName}`);
  console.log(david);
})();
