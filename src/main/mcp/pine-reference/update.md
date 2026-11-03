# Update

Changes values in the rows the pipeline selects. Every operation in Pine that changes data ends in
`!`.

**Operation(s):** `update!`, `u!`

**Syntax:**
```
table_name | [conditions...] | update! column = value
table_name | [conditions...] | update! column = value, other_column = value
```

**You can't run this.** Over MCP, `run_query` refuses every `update!` and `delete!` before it
reaches the database. Only the user can change data. To propose a change, write the expression and
pass it to `open_in_desktop`. The link it returns opens the expression in a new tab without running
it, so the user can check it and press Run. Check first, with `count:`, how many rows the same
pipeline selects.

## Examples

### Set a value

```
customers | where: id = 7 | update! status = 'inactive'
```

### Several columns at once

```
customers | where: id = 7 | update! status = 'inactive', note = 'closed by request'
```

### The rows reached through a join

```
customers | where: status = 'inactive' | orders | where: status = 'open' | update! status = 'cancelled'
```

The last table in the pipeline is the one changed: here, the open orders of inactive customers.

### Values

```
session | where: expires_at < now() | update! revoked_at = now()
customers | where: id = 7 | update! nickname = null
customers | where: id = 7 | update! display_name = full_name
orders | where: id = 9 | update! price = 19.99
```

A value can be a literal, `null`, `now()`, a `$variable`, or another column of the same table,
whose value is copied.

### One key inside a JSON column

```
customer | where: id = 7 | update! data.plan = 'pro', data.seats = 12
```

Only that key changes. See the `json` topic.

## What is refused

- **Every row of a table.** Something has to narrow the rows: a `where:` or a `limit:` before it.
- **After `group:`, and on a named result.**
- **A table with no primary key,** such as a view. Pine finds each row by the table's primary key.
- **An `update!` ending in a comma.** It is treated as still being typed.

Each `update!` runs in a transaction, so one that fails part way changes nothing.
