# From

Moves the context back to an earlier table in the pipeline, so the next operations apply to that
table instead of the most recent one.

**Operation(s):** `from:`, `f:`

**Syntax:**
```
table_name as alias | [operations...] | from: alias | [more_operations...]
```

## Examples

### Return to an earlier table

```
customers as c | orders as o | from: c | select: email
```

After joining orders, `from: c` points back at customers, so `select: email` picks the
customer's email rather than looking for an email column on orders.

### Branch off in two directions

```
customers as c | orders as o | where: o.total > 100 | from: c | order_items
```

Filter on orders, then step back to customers and join something else from there.

### Shorthand

```
customers as c | orders | f: c | select: id, email
```

`f:` is the short form of `from:`.
