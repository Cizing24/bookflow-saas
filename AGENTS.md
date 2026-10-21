<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BookFlow engineering rules

- Follow strict TypeScript and Modular Monolith boundaries: UI -> HTTP -> application services -> domain / scoped data access. UI and route handlers must not own booking or authorization rules.
- Every management use case must authorize the server session and Membership. Never trust client tenantId, userId or role; scope business queries and relationships to the authorized tenant.
- OWNER and ADMIN may manage; STAFF may read its tenant. Preserve and test server and database isolation.
- Preserve composite foreign keys, checks and the partial booking exclusion constraint. Availability checks alone do not prevent concurrent double booking.
- Store UTC instants; calculate wall-clock schedules with tenant IANA timezone. Derive end time on the server and snapshot service name / price.
- Anonymous submissions must not rewrite historical customer contacts. Use parameterized SQL and validated inputs. Never log or commit real credentials, secrets or customer PII; test credentials must be synthetic.
- Applied migrations are append-only. Do not use db push / reset against important data. Keep custom database constraints in SQL migrations.
- Fix dependency versions and commit the lockfile. Verify official compatibility before upgrades; do not implicitly adopt prereleases.
- Run relevant lint, typecheck, unit, database integration and browser checks. Never disable security, rate limits, checks or tests to obtain green results. Never claim unexecuted checks passed.
- Test fixtures must have unique identities and cleanup only their own data. Never run tests against Production.
- Update README, ARCHITECTURE, ROADMAP and STATUS with changes. Every phase handoff must state exact verification and blockers.
- Use Traditional Chinese UI and English code identifiers. Preserve accessible labels, responsive layouts, loading, empty, error and success feedback.
- Do not discard user changes or force push. Production deployment and destructive operations require explicit authorization.
