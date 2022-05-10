const os = require("os");

const username =
  process.platform === "win32"
    ? `${process.env.USERDOMAIN}_${process.env.USERNAME}`
    : os.userInfo().username;

// Tests will check that username its the correct user
console.log(username);