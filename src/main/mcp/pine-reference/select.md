# Select

Choose which columns to return.

**Operation(s):** `select:`, `s:`

## Examples

### Pick specific columns

```
customers | select: id, email
```

Without `select:`, every column of the current table comes back.

### Rename a column in the output

```
customers | s: id as customer_id
```

### Qualify columns when tables are joined

```
customers as c | orders as o | s: c.email, o.total_amount
```

With more than one table in the pipeline, an unqualified `id` is ambiguous — prefix it with the
table's alias to say which one you mean.

### List what is available

Ending an expression at `| select: ` and asking for completions returns the current table's
columns. This is the way to discover column names rather than guessing at them.
