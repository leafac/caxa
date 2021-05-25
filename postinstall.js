const download = require("download");
const fs = require("fs-extra");
const path = require("path");
const package = require("./package.json");
const crypto = require("crypto");

(async () => {
  const stubParts = ["stub", process.platform, process.arch];
  if (stubParts.includes("linux") && stubParts.includes("arm"))
    stubParts.push(process.config.variables.arm_version);
  const stubName = stubParts.join("--");
  // const downloadPath = `https://github.com/leafac/caxa/releases/download/v${package.version}/${stubName}`;
  const downloadPath = `https://github.com/maxb2/caxa/releases/download/v1.0.0-test52/${stubName}`;
  const stubPath = path.join(__dirname, "stub");
  await fs.writeFile(stubPath, await download(downloadPath));
  const checksumsPath = path.join(__dirname, "checksums.txt");
  if (fs.existsSync(checksumsPath)) {
    const checksums = await fs.readFile(checksumsPath, "utf8");
    const stubHash = crypto
      .createHash("sha256")
      .update(await fs.readFile(stubPath))
      .digest("hex");
    const checksumLine = `${stubHash}  ${stubName}`;
    if (!checksums.includes(checksumLine)) {
      console.error(`Checksum verification failed: ‘${checksumLine}’`);
      process.exit(1);
    }
  }
})();
