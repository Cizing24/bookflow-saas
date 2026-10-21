import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    readFileSync(".env.example", "utf8").replace(
      "replace-with-a-random-secret-of-at-least-32-characters",
      randomBytes(48).toString("base64url"),
    ),
  );
  console.log("Created .env with a unique local session secret.");
} else console.log(".env already exists; left unchanged.");
