const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("Hello from caxa");
});

app.listen(5000, () => {
  console.log("Web server running at http://localhost:5000");
});
