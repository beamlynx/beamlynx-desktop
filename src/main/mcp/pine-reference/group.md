# Group

Collapses rows into one row per distinct value, with an aggregate alongside.

**Operation(s):** `group:`, `g:`

**Syntax:**
```
table_name | group: column_name => count
```

`count` takes no colon here. That is the opposite of the standalone `count:` operation, which
does — see the `count` topic. A grouped query returns at most 10 000 groups.

After `=>`, list one or more aggregates, separated by commas:

| Aggregate | What it gives for each group |
|---|---|
| `count` | The number of rows. Written bare, with no parentheses. |
| `min(x)`, `max(x)` | The smallest, or largest, value. |
| `sum(x)`, `avg(x)` | The total, or the average. |
| `any(condition)` | True when the condition is true for at least one row. |
| `all(condition)` | True when the condition is true for every row. |

Every aggregate can take a filter: `min(a.id) where a.type = 'sharepoint'` reads only the rows
where the condition is true. Name an aggregate with `as`. Without it, `min(a.id)` is `min_id`.
`string_agg` and other aggregates aren't in Pine.

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

### Several aggregates

```
customers as c | orders .customer_id | group: c.id => count, max(created_at) as latest, sum(total) as spent
```

One row per customer: how many orders, the latest one's date, and the total spent.

### An aggregate over some of the rows

```
customers as c | orders .customer_id | group: c.id => count, count where status = 'refunded' as refunds
```

`where` after an aggregate filters the rows that aggregate reads. The plain `count` still counts
every order.

### Keep only some groups

```
customers as c | orders .customer_id | group: c.id => any(status = 'refunded') as had_refund | where: had_refund = true
```

A `where:` after `group:` filters the groups, by the aggregates' names.

### Name the aggregate

```
customers as c | orders .customer_id | group: c.email => count | select: email, count as order_count
```

### Piping past a group

`group:` produces a final, bounded result. Joining another table after one wraps the grouped
result first, so the join applies on top of the groups instead of changing what was counted. See
the `named-results` topic for combining several aggregates on one row.
