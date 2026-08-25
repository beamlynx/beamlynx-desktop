# Count

Returns the number of rows instead of the rows themselves.

**Operation(s):** `count:`

**Syntax:**
```
table_name | [operations...] | count:
```

## Examples

### Count every row in a table

```
customers | count:
```

### Count what a filter matches

```
customers | where: status = 'active' | count:
```

Put `count:` last — it replaces the result with a single number, so nothing meaningful can
follow it.

### Count across a join

```
customers | where: status = 'active' | orders | count:
```

Counts orders belonging to active customers, not customers.

### Count per group

```
customers as c | orders .customer_id | group: c.email => count
```

Use `group:` rather than `count:` when you want one count per value. See the `group` topic.
