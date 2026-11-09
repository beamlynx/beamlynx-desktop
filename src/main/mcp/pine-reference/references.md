# References

Lists how a table joins to other tables, in both directions: the tables it points to, and the
tables that point to it. It reads the schema Pine already holds for the database, so nothing runs
on the database. Use it to see how to get from one table to the next. For the table's own columns,
use `describe:` (the `describe` topic).

**Operation(s):** `references:`

**Syntax:**
```
table_name | references:
```

## Examples

### One table

```
user | references:
```

One row per join that touches `user`, both ways: the side that holds the key, the side it points
at, how Pine knows the join (`foreign key` when the database declares it, `naming` when Pine
guessed it from a column's name), and what to type after `| ` to make that join.

A guessed join has no foreign key behind it, so check that it returns sensible rows before relying
on it.

### After a join

```
user | activity .user_id | references:
```

Lists the joins of the table the pipe ends on: here `activity`.

`references:` ends the query: nothing can follow it. To make a join, put what the row says to
type into a new expression after `user`.
