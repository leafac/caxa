const download = require('download');
const fs = require('fs-extra');
const path = require('path');
const package = require('./package.json');
const crypto = require('crypto');
const https = require('https');

const mirror = {
  CN: 'download.fastgit.org',
};

(async () => {
  const stubPath = path.join(__dirname, 'stub');
  if (fs.existsSync(stubPath)) process.exit(0);
  const stubParts = ['stub', process.platform, process.arch];
  if (process.platform === 'linux' && process.arch === 'arm')
    stubParts.push(process.config.variables.arm_version);
  const stubName = stubParts.join('--');
  const getdownloadPath = domain =>
    `https://${domain}/leafac/caxa/releases/download/v${package.version}/${stubName}`;
  const getMirrorDomain = () => {
    let data = '';
    return new Promise(resolve => {
      // get country info
      const get = https.get('https://api.hostip.info/country.php', res => {
        res.setEncoding('utf8');
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(
            mirror[data.toString()] ? mirror[data.toString()] : 'github.com'
          );
        });
      });
      get.end();
    });
  };
  const downloadPath = getdownloadPath(await getMirrorDomain());
  await fs.writeFile(stubPath, await download(downloadPath), { mode: 0o755 });
  const checksumsPath = path.join(__dirname, 'checksums.txt');
  if (!fs.existsSync(checksumsPath)) process.exit(0);
  const checksums = await fs.readFile(checksumsPath, 'utf8');
  const stubHash = crypto
    .createHash('sha256')
    .update(await fs.readFile(stubPath))
    .digest('hex');
  const checksumLine = `${stubHash}  ${stubName}`;
  if (!checksums.includes(checksumLine)) {
    console.error(`Checksum verification failed: ‘${checksumLine}’`);
    process.exit(1);
  }
})();
