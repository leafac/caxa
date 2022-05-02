(async () => {
  const os = require("os");
  const path = require("path");
  const fs = require("fs-extra");
  const cryptoRandomString = require("crypto-random-string");

  // Windows doesn't return DOMAIN\username with os.userInfo().username,
  // but the go implementation does, we have to emulate that with env vars
  // also instead of backslash we use an underscore so DOMAIN\username
  // Its not converted to a path slug
	// Ref: https://github.com/leafac/caxa/issues/53#issuecomment-1113285692
  const username = process.platform === "win32" ?
    `${process.env.USERDOMAIN}_${process.env.USERNAME}`
    : os.userInfo().username;

  const caxaDirectory = path.join(os.tmpdir(), "caxa");
  const userDirectory = path.join(caxaDirectory, username);

  const temporaryDirectory = path.join(
    userDirectory,
    "examples/native-modules",
    cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
  );
  await fs.ensureDir(temporaryDirectory);

  const { Database, sql } = require("@leafac/sqlite");
  const database = new Database(path.join(temporaryDirectory, "database.db"));
  database.execute(sql`CREATE TABLE caxaExampleNativeModules (example TEXT);`);
  database.run(
    sql`INSERT INTO caxaExampleNativeModules (example) VALUES (${"caxa native modules"})`
  );
  console.log(
    "@leafac/sqlite:",
    JSON.stringify(
      database.get(sql`SELECT example FROM caxaExampleNativeModules`),
      undefined,
      2
    )
  );

  const sharp = require("sharp");
  const imageFile = path.join(temporaryDirectory, "image.png");
  await fs.writeFile(
    imageFile,
    await sharp({
      create: {
        width: 48,
        height: 48,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer()
  );
  console.log("sharp:", (await sharp(imageFile).metadata()).width);
})();
