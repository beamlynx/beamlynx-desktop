# Limit

Caps how many rows come back.

**Operation(s):** `limit:`, `l:`

**Syntax:**
```
table_name | limit: number
```

## Examples

### Cap the result

```
customers | limit: 10
```

### After filtering and sorting

```
customers | where: status = 'active' | order: created_at desc | limit: 5
```

The five most recently created active customers. `limit:` applies last, so put it at the end.

### Piping past a limit

```
customers | limit: 10 | orders
```

`limit:` produces a final, bounded result. Joining another table after one wraps the limited
result first, so the join applies on top of those 10 rows rather than being applied before the
cap. See the `variables` topic.
