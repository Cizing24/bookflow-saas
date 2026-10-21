// Tests may create/delete only synthetic fixtures in explicitly local development databases.
export function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    /prod/i.test(url.pathname)
  ) {
    throw new Error("Database tests require a local development/test database");
  }
}
