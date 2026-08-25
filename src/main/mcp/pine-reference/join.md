# Join

Join tables by piping them together. You do not name the join columns — Pine resolves the
relationship between the two tables itself.

Supported modifiers:
- `:left` — keeps rows from the left table even where the right has no match
- `:right` — keeps rows from the right table even where the left has no match
- `:parent` — joins toward the referenced table instead of the one holding the foreign key

## Examples

### Join two tables

```
customers | orders
```

The foreign key between them is found automatically. The result carries the last table's
columns — here, orders.

### Join several

```
customers | orders | order_items
```

Each table joins to the one before it.

### Across schemas

```
customers | audit.order_status_changes
```

### Say which column to join on

```
customers | orders .customer_id
```

Needed when two tables are related through more than one column — for example an `orders` table
with both `customer_id` and `shipping_customer_id`. Ambiguity is the usual reason a join comes
back wrong.

### Keep unmatched rows

```
customers | orders :left
```

Customers with no orders are kept, with the order columns empty.

### Join a table to itself

```
categories as p | categories as c
```

Aliases are required here, so each side of the relationship can be referred to separately.

### Choose the direction

```
categories as p | categories as c :parent
```

By default Pine joins toward the table holding the foreign key (the child). `:parent` reverses
that, joining toward the table being referenced.

### Finding the join you want

Ending an expression at `| ` and asking for completions lists every table the current one can
join to, best first. Joins backed by a real foreign key are marked separately from ones guessed
from column naming — a guessed join has no foreign key behind it and can simply be wrong, so
confirm it returns sensible rows before relying on it.
