-- The database every agent case runs on. Small on purpose: an answer can be
-- checked by eye. Build it with scripts/agent-case-db.mjs.
CREATE TABLE tenant (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE user (
  id        INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenant (id),
  email     TEXT NOT NULL
);
CREATE TABLE activity (
  id         INTEGER PRIMARY KEY,
  tenant_id  INTEGER NOT NULL REFERENCES tenant (id),
  user_id    INTEGER REFERENCES user (id),
  type       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO tenant VALUES (1, 'Acme'), (2, 'Globex'), (3, 'Initech');

INSERT INTO user VALUES
  (1, 1, 'ann@acme.example'),
  (2, 1, 'bob@acme.example'),
  (3, 2, 'cleo@globex.example'),
  (4, 3, 'dana@initech.example'),
  (5, 3, 'eli@initech.example');

INSERT INTO activity VALUES
  (1, 1, 1, 'login',  '2026-10-30 11:00'),
  (2, 1, 2, 'login',  '2026-11-02 14:20'),
  (3, 1, 1, 'login',  '2026-11-03 09:15'),
  (4, 1, 1, 'export', '2026-11-04 10:00'),
  (5, 2, 3, 'login',  '2026-11-01 08:00'),
  (6, 2, 3, 'login',  '2026-11-04 12:30'),
  (7, 2, 3, 'login',  '2026-11-05 17:40'),
  (8, 3, 5, 'login',  '2026-10-28 08:02'),
  (9, 3, 5, 'export', '2026-11-06 16:00');
