# Join

Join tables by piping them together. You do not name the join columns — Pine resolves the
relationship between the two tables itself, and joins on every column that relationship uses.
Most use one column; a foreign key made of several uses all of them, in one join.

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

### Say which relationship you mean

```
customers | orders .customer_id
```

Needed when two tables are related in more than one way — for example an `orders` table with both
`customer_id` and `shipping_customer_id`. Ambiguity is the usual reason a join comes back wrong.

The columns **name the relationship**; they do not spell out the `ON` clause. Naming one column of
a key selects that whole key, and the join still matches on all of its columns. Name more than one,
comma-separated, when a single column belongs to two different relationships:

```
cases | case_refs .case_id, .search_id
```

Take the columns from the join list that completions give you rather than guessing them —
completions spell out every column of a key, so what they offer is what the join will do. Names
are case-sensitive, and a schema that mixes conventions (`customer_id` on one table, `customerId`
on the next) defeats guessing about half the time.

Columns that match no relationship are not rejected. The join is built with no `ON` clause at all
and the query fails later with a syntax error that says nothing about the cause, so take the
completion rather than typing from memory.

### Keep unmatched rows

```
customers | orders :left
```

Customers with no orders are kept, with the order columns empty.

### Join a table to itself

```
categories as p | categories as c
```

Two copies of one table have to be told apart, so name both with `as`.

### Referring to the columns of a table you joined past

Once you join, the pipeline's current table is the last one, and an unqualified column is
looked for there. Earlier tables are still reachable — by alias, never by table name:

```
customers as c | orders as o .customer_id | select: c.email, o.total_amount
```

Naming them with `as` is the readable way, but not required: Pine assigns `c_0`, `o_1` and so
on when you do not, and those work as qualifiers too. See the `select` topic.

### Choose the direction

```
categories as p | categories as c :parent
```

By default Pine joins toward the table holding the foreign key (the child). `:parent` reverses
that, joining toward the table being referenced.

### Spell out the columns yourself

```
customers | orders .customer_id = .id
customers | orders .customer_id = .id, .region = .region
```

This ignores the schema's relationships entirely and joins on exactly the pairs given. Each pair
is `.<right table column> = .<left table column>`. Use it for a join no foreign key describes — or
to join on only part of a key on purpose.

### Finding the join you want

Ending an expression at `| ` and asking for completions lists every table the current one can
join to, best first. Joins backed by a real foreign key are marked separately from ones guessed
from column naming — a guessed join has no foreign key behind it and can simply be wrong, so
confirm it returns sensible rows before relying on it.
