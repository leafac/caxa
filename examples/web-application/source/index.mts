import express from "express";

const app = express();

app.get<{}, string, {}, {}, {}>("/", (req, res) => {
  res.send("Hello World");
});

app.listen(4000, () => {
  console.log("Server started at http://localhost:4000");
});
