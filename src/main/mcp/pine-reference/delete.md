# Delete

Removes rows from a table. Every operation in Pine that modifies data ends in `!`, which is what
marks it as a side effect rather than a query.

**Operation(s):** `delete!`

**Syntax:**
```
table_name | [conditions...] | delete! .id_column_name
```

## Examples

### Delete matching rows

```
customers | where: status = 'inactive' | delete! .id
```

The column after `delete!` identifies which table's rows to remove — necessary because a
pipeline can span several joined tables.

### Delete rows reached through a join

```
customers | where: status = 'inactive' | orders | delete! .id
```

Deletes the orders belonging to inactive customers, not the customers.

**This is disabled over MCP.** `delete!` is refused before it reaches the database unless the
machine is explicitly configured to allow it. Check what a filter matches with `count:` first —
a delete cannot be undone.
