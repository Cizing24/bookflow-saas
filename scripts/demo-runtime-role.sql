\set ON_ERROR_STOP on
\getenv demo_runtime_password DEMO_RUNTIME_PASSWORD
SELECT current_database() = 'bookflow_demo' AND length(:'demo_runtime_password') >= 24 AS safe_target \gset
\if :safe_target
\else
  \echo Refused: requires bookflow_demo and a runtime password of at least 24 characters.
  \quit 3
\endif
CREATE ROLE bookflow_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'demo_runtime_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE bookflow_demo TO bookflow_runtime;
GRANT USAGE ON SCHEMA public TO bookflow_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bookflow_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bookflow_runtime;
REVOKE ALL ON TABLE "_prisma_migrations" FROM bookflow_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "PlatformAdmin" FROM bookflow_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "PlatformEvent", "BookingEvent" FROM bookflow_runtime;
