import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
const source = new URL(process.env.DATABASE_URL);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(source.hostname) ||
  /prod/i.test(source.pathname)
) {
  throw new Error(
    "Clean migration verification requires a local development database",
  );
}
const name = "bookflow_verify_" + randomUUID().replaceAll("-", "");
const admin = new Client({ connectionString: source.toString() });
await admin.connect();
let created = false;
try {
  // Identifier is generated internally, with a fixed prefix and hexadecimal UUID only.
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  source.pathname = "/" + name;
  const migration = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: source.toString() },
      encoding: "utf8",
    },
  );
  if (migration.status !== 0)
    throw new Error("Clean migration deploy failed: " + migration.stderr);
  const clean = new Client({ connectionString: source.toString() });
  await clean.connect();
  try {
    const constraints = await clean.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('Booking_no_overlap','Booking_occupied_required','Booking_buffer_bounds','Tenant_scheduling_bounds')`,
    );
    if (
      constraints.rows.length !== 4 ||
      !constraints.rows
        .find((r) => r.conname === "Booking_no_overlap")
        ?.definition.includes("tstzrange")
    )
      throw new Error("Missing scheduling constraints");
    const migrations = await clean.query(
      `SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    const indexes = await clean.query(
      `SELECT indexname FROM pg_indexes WHERE indexname IN ('Booking_tenantId_idempotencyKey_key','StaffAbsence_tenantId_staffId_date_idx','StaffSchedule_tenantId_staffId_idx')`,
    );
    const trigger = await clean.query(
      `SELECT tgname FROM pg_trigger WHERE tgname = 'booking_occupied_range' AND NOT tgisinternal`,
    );
    const extension = await clean.query(
      `SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`,
    );
    if (
      migrations.rows[0].count !== 3 ||
      indexes.rows.length !== 3 ||
      trigger.rows.length !== 1 ||
      extension.rows.length !== 1
    )
      throw new Error("Incomplete clean migration artifacts");
    console.info(
      "Clean PostgreSQL database: 3 migrations, 4 scheduling constraints, 3 indexes, occupied-range trigger and btree_gist verified",
    );
  } finally {
    await clean.end();
  }
} finally {
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
