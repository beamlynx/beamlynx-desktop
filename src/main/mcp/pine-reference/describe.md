# Describe

Lists a table's columns. It reads the schema Pine already holds for the database, so nothing runs
on the database. Use it to learn a table's columns in one call, before writing a query on it. To
see how the table joins to others, use `references:` (the `references` topic).

**Operation(s):** `describe:`

**Syntax:**
```
table_name | describe:
```

## Examples

### One table

```
user | describe:
```

One row per column of `user`: its name, its type, its key (if it is part of one), whether it may
be empty, and whether it is masked. A masked column is listed, but its values never come back.

### After a join

```
user | activity .user_id | describe:
```

Describes the table the pipe ends on: here `activity`.

### A named result

```
user | select: id, email |= people

people | describe:
```

Lists only the columns the named result keeps, under the names it keeps them by.

`describe:` ends the query: nothing can follow it.
