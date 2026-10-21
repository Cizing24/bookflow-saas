import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
const bin = process.env.PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const directory = resolve(".local-db/data");
mkdirSync(resolve(".local-db"), { recursive: true });
function run(name, args) {
  const result = spawnSync(
    join(bin, name + (process.platform === "win32" ? ".exe" : "")),
    args,
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!existsSync(join(directory, "PG_VERSION"))) {
  run("initdb", [
    "-D",
    directory,
    "-U",
    "bookflow",
    "-A",
    "trust",
    "--encoding=UTF8",
    "--locale=C",
  ]);
  writeFileSync(
    join(directory, "postgresql.auto.conf"),
    "listen_addresses = '127.0.0.1'\nport = 5433\n",
  );
}
const status = spawnSync(
  join(bin, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl"),
  ["-D", directory, "status"],
  { stdio: "ignore" },
);
if (status.status !== 0)
  run("pg_ctl", [
    "-D",
    directory,
    "-l",
    resolve(".local-db/postgres.log"),
    "start",
    "-w",
  ]);
const check = spawnSync(
  join(bin, process.platform === "win32" ? "psql.exe" : "psql"),
  [
    "-h",
    "127.0.0.1",
    "-p",
    "5433",
    "-U",
    "bookflow",
    "-d",
    "postgres",
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname='bookflow'",
  ],
  { encoding: "utf8" },
);
if (check.status !== 0) process.exit(check.status ?? 1);
if (check.stdout.trim() !== "1")
  run("createdb", [
    "-h",
    "127.0.0.1",
    "-p",
    "5433",
    "-U",
    "bookflow",
    "bookflow",
  ]);
console.log(
  "Project-local PostgreSQL ready on 127.0.0.1:5433 (local development only).",
);
