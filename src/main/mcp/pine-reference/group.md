# Group

Collapses rows into one row per distinct value, with an aggregate alongside.

**Operation(s):** `group:`, `g:`

**Syntax:**
```
table_name | group: column_name => count
```

`count` takes no colon here. That is the opposite of the standalone `count:` operation, which
does — see the `count` topic. `count` is also the only aggregate worth writing: the parser
accepts `sum`, `avg`, `min`, `max` and `string_agg`, but they take no column argument and all
come back as a constant.

## Examples

### Count per group

```
categories as c | products .category_id | order_items .product_id | group: c.name => count
```

One row per category name, with how many order items fall under it.

### The count is there whether you ask for it or not

```
categories | group: name
categories | group: name | select: name, count
```

`=> count` is optional. Grouping alone already produces a `count` column, which later
operations can select, rename or order by.

### Group by several columns

```
customers as c | orders .customer_id | group: c.id, c.email => count
```

Grouping by `id` as well as `email` keeps customers who share an email address distinct.

### Name the aggregate

```
customers as c | orders .customer_id | group: c.email => count | select: email, count as order_count
```

### Piping past a group

`group:` produces a final, bounded result. Joining another table after one wraps the grouped
result first, so the join applies on top of the groups instead of changing what was counted. See
the `variables` topic for combining several aggregates on one row.
