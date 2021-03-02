(async () => {
  const os = require("os");
  const path = require("path");
  const fs = require("fs/promises");

  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "caxa-example-native-modules-")
  );

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
