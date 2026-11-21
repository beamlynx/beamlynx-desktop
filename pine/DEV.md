# How to run tests while using the repl?

- `pine.db.main` -> `connection-id` needs to be reset.
- `pine.db.main` -> `references` needs to be reset.

# Local Postgres + MySQL databases (manual testing, both dialects)

`dev.docker-compose.yml` brings up a read-write Postgres and a read-write
MySQL side by side, seeded with the same tables and the same data
(`docker/db/init` and `docker/mysql/init` respectively -- the MySQL seed is
a hand-translation of the Postgres one, kept in sync by hand). Both are
read-write, so `update!`/`delete!` are testable too. Run Pine from source
against them:

```bash
bin/beam db    # from the repo's root; or: docker compose -f dev.docker-compose.yml up -d
bin/beam api   # or, from here: clj -M:run-dev
```

Connection details:

| | Postgres | MySQL |
|---|---|---|
| host | localhost | localhost |
| port | 5435 | 3308 |
| database | pine | pine |
| user / password | pine / pine | pine / pine |

```bash
curl -X POST http://localhost:33333/api/v1/connections \
  -H "Content-Type: application/json" \
  -d '{"dbtype":"mysql","host":"localhost","port":3308,"dbname":"pine","user":"pine","password":"pine"}'
```

The MySQL seed additionally has `warehouses`/`warehouse_staff` (a
heuristic-only relation, no real FK -- see `references.clj`'s naming-based
detection) and a second database, `pine_other`, with `SELECT` granted to
the `pine` user -- a live check that MySQL's `DATABASE()`-scoped schema
introspection actually excludes it (unlike Postgres, MySQL's
`information_schema` is server-global, not connection-scoped).
