import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
const source = new URL(process.env.DATABASE_URL);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(source.hostname) ||
  /prod/i.test(source.pathname)
)
  throw new Error("Backup drill requires a local development/test database");
const directory = mkdtempSync(join(tmpdir(), "bookflow-restore-"));
const dump = join(directory, "backup.dump");
const name = "bookflow_restore_" + randomUUID().replaceAll("-", "");
const admin = new Client({ connectionString: source.toString() });
const bin =
  process.env.PG_BIN ??
  (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
function run(command, args, database) {
  const executable = bin
    ? join(bin, command + (process.platform === "win32" ? ".exe" : ""))
    : command;
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      PGHOST: source.hostname,
      PGPORT: source.port || "5432",
      PGUSER: decodeURIComponent(source.username),
      PGPASSWORD: decodeURIComponent(source.password),
      PGDATABASE: database,
    },
  });
  if (result.status !== 0)
    throw new Error(
      `${command} failed; check local PostgreSQL client/version and permissions`,
    );
}
let created = false;
try {
  await admin.connect();
  run(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-acl", `--file=${dump}`],
    source.pathname.slice(1),
  );
  run("pg_restore", ["--list", dump], source.pathname.slice(1));
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  run(
    "pg_restore",
    [
      `--dbname=${name}`,
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "--single-transaction",
      dump,
    ],
    name,
  );
  const restoredUrl = new URL(source);
  restoredUrl.pathname = "/" + name;
  const restored = new Client({ connectionString: restoredUrl.toString() });
  await restored.connect();
  try {
    for (const table of [
      "Tenant",
      "Booking",
      "BookingEvent",
      "Notification",
      "PlatformAdmin",
      "PlatformEvent",
      "_prisma_migrations",
    ]) {
      // Only fixed internal identifiers are interpolated, never user input.
      const query = `SELECT count(*)::int AS n FROM "${table}"`;
      const before = await admin.query(query),
        after = await restored.query(query);
      if (before.rows[0].n !== after.rows[0].n)
        throw new Error(
          `Restore count mismatch: ${table}; do not run during concurrent writes`,
        );
    }
    const constraints = await restored.query(
      "SELECT conname FROM pg_constraint WHERE conname='Booking_no_overlap'",
    );
    const triggers = await restored.query(
      "SELECT tgname FROM pg_trigger WHERE tgname IN ('booking_occupied_range','booking_status_transition') AND NOT tgisinternal",
    );
    if (constraints.rows.length !== 1 || triggers.rows.length !== 2)
      throw new Error("Restored booking protections missing");
    console.info(
      "Backup/restore drill passed: isolated database, 7 table counts, GiST exclusion and booking triggers preserved.",
    );
  } finally {
    await restored.end();
  }
} finally {
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
  // Delete only the exact temporary directory created by this invocation.
  const target = realpathSync(directory);
  if (
    dirname(target) !== realpathSync(tmpdir()) ||
    !target.startsWith(resolve(tmpdir(), "bookflow-restore-"))
  )
    throw new Error("Unsafe temporary cleanup path");
  rmSync(target, { recursive: true });
}
