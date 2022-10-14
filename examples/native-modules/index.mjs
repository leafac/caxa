import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import cryptoRandomString from "crypto-random-string";
import { Database, sql } from "@leafac/sqlite";
import sharp from "sharp";

const temporaryDirectory = path.join(
  os.tmpdir(),
  "caxa/examples/native-modules",
  cryptoRandomString({ length: 10, type: "alphanumeric" }).toLowerCase()
);
await fs.ensureDir(temporaryDirectory);

const database = new Database(path.join(temporaryDirectory, "database.db"));
database.migrate(
  sql`CREATE TABLE "caxaExampleNativeModules" ("example" TEXT);`
);
database.run(
  sql`INSERT INTO "caxaExampleNativeModules" ("example") VALUES (${"caxa native modules"})`
);
console.log(
  "@leafac/sqlite:",
  JSON.stringify(
    database.get(
      sql`
        SELECT "example" FROM "caxaExampleNativeModules"
      `
    ),
    undefined,
    2
  )
);
database.close();

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
