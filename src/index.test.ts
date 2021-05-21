import fs from "fs-extra";
import path from "path";

test("The stub should exist", () => {
  expect(fs.existsSync(path.join(__dirname, "../stub"))).toBe(true);
});
