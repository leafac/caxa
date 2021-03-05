import express from "express";
import methodOverride from "method-override";
import { html, HTML } from "@leafac/html";
import { css, process as processCSS } from "@leafac/css";
import { sql, Database } from "@leafac/sqlite";
import databaseMigrate from "@leafac/sqlite-migration";

const app = express();

const database = new Database(":memory:");

databaseMigrate(database, [
  sql`
    CREATE TABLE "items" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "description" TEXT NOT NULL
    );
  `,
]);

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.get<{}, HTML, {}, {}, {}>("/", (req, res) => {
  res.send(
    processCSS(html`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>caxa Example Application</title>
        </head>
        <body
          style="${css`
            /* https://pico-8.fandom.com/wiki/Palette */

            @at-root {
              body {
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                  Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans",
                  "Helvetica Neue", sans-serif;
                max-width: 300px;
                margin: 0 auto;
                -webkit-text-size-adjust: 100%;
                line-height: 1.5;
              }

              a {
                color: inherit;
              }

              ::selection {
                color: white;
                background-color: #ff77a8;
              }

              h1 {
                font-size: large;
              }

              input,
              button {
                font-size: 1em;
              }

              input[type="text"] {
                -webkit-appearance: none;
              }

              input {
                border-radius: 10px;
                padding: 0.3em 1em;
                border: 1px solid gray;
                box-sizing: border-box;
                width: 100%;
                outline: none;
                transition: border-color 0.2s;

                &:focus {
                  border-color: #29adff;
                }
              }

              button {
                font-weight: bold;
                background-color: transparent;
                padding: 0;
                border: none;
                cursor: pointer;
              }

              a,
              button {
                transition: color 0.2s;

                &:hover {
                  color: #ff77a8;
                }

                &:active {
                  color: #e66c98;
                }
              }
            }
          `}"
        >
          <header
            style="${css`
              text-align: center;
            `}"
          >
            <h1>
              <a
                href="https://github.com/leafac/caxa"
                style="${css`
                  text-decoration: none;
                `}"
                >caxa Example Application</a
              >
            </h1>
            <p
              style="${css`
                margin-top: -1em;
                line-height: 1.2;
              `}"
            >
              <small
                style="${css`
                  color: gray;
                `}"
              >
                It’s a simple to-do app that<br />uses a native module (<a
                  href="https://github.com/leafac/sqlite"
                  >@leafac/sqlite</a
                >)
              </small>
            </p>
          </header>
          <main>
            <ul
              style="${css`
                list-style: none;
                padding: 0;
              `}"
            >
              $${database
                .all<{ id: number; description: string }>(
                  sql`SELECT "id", "description" FROM "items" ORDER BY "id"`
                )
                .map(
                  (item) =>
                    html`<li>
                      <form
                        method="post"
                        action="/items/${item.id}?_method=delete"
                        style="${css`
                          display: inline;
                        `}"
                      >
                        <button
                          style="${css`
                            &:hover {
                              color: #ff004d;
                            }

                            &:active {
                              color: #e60045;
                            }
                          `}"
                        >
                          ×
                        </button>
                      </form>
                      ${item.description}
                    </li>`
                )}
            </ul>
            <form method="post" action="/items">
              <p
                style="${css`
                  text-align: center;
                `}"
              >
                <input
                  type="text"
                  name="description"
                  autocomplete="off"
                  required
                /><br />
                <button>+</button>
              </p>
            </form>
          </main>
        </body>
      </html>
    `)
  );
});

app.post<{}, never, { description: string }, {}, {}>("/items", (req, res) => {
  database.run(
    sql`INSERT INTO "items" ("description") VALUES (${req.body.description})`
  );
  res.redirect("/");
});

app.delete<{ itemId: string }, never, {}, {}, {}>(
  "/items/:itemId",
  (req, res) => {
    database.run(sql`DELETE FROM "items" WHERE "id" = ${req.params.itemId}`);
    res.redirect("/");
  }
);

app.listen(5000, () => {
  console.log("Server started at http://localhost:5000");
});
