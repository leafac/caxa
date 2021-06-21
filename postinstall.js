const fs = require("fs-extra");
const path = require("path");
const package = require("./package.json");
const crypto = require("crypto");
const { http, https } = require('follow-redirects');
const calladownload = require("calladownload");

(async () => {
  const stubPath = path.join(__dirname, "stub");
  if (fs.existsSync(stubPath)) process.exit(0);
  const stubParts = ["stub", process.platform, process.arch];
  if (process.platform === "linux" && process.arch === "arm")
    stubParts.push(process.config.variables.arm_version);
  const stubName = stubParts.join("--");
  const downloadPath = `https://github.com/leafac/caxa/releases/download/v${package.version}/${stubName}`;
  await calladownload(downloadPath, stubPath, { httpsAgent: https, httpAgent: http });
  await fs.chmod(stubPath, 0o755);
  const checksumsPath = path.join(__dirname, "checksums.txt");
  if (!fs.existsSync(checksumsPath)) process.exit(0);
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
})();
