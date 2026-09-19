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

Without a qualifier, a column is looked for on the last table in the pipeline only. To reach an
earlier one — or to disambiguate an `id` that exists on both — prefix the column with an alias.

**A table name is not a qualifier.** `s: customers.email` fails, however natural it looks. Only
an alias works, and there are two kinds:

- one you named yourself with `as`, like `c` above
- the one Pine assigns when you did not: `customers | orders | s: c_0.email`

Both are equally usable. The assigned aliases are numbered by position (`c_0`, `o_1`), and
`complete_query` lists them under `aliases in scope:` for whatever expression you pass it.

### List what is available

Ending an expression at `| select: ` and asking for completions returns the current table's
columns. This is the way to discover column names rather than guessing at them.

To list some *other* table's columns, end at an alias and a dot instead:

```
customers as c | orders | select: c.
```

That returns the customers columns, even though orders is the current table.
