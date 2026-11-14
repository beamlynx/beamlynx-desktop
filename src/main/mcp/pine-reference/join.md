# Join

Join tables by piping them together. You do not name the join columns — Pine resolves the
relationship between the two tables itself, and joins on every column that relationship uses.
Most use one column; a foreign key made of several uses all of them, in one join.

Supported modifiers:
- `:left` — keeps rows from the left table even where the right has no match
- `:right` — keeps rows from the right table even where the left has no match
- `:parent` — joins toward the referenced table instead of the one holding the foreign key
- `:child` — joins toward the table holding the foreign key. This is the default, so it is rarely
  needed

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

When nothing connects the two tables, or the columns match no relationship, the join is an error:
"No relation between `customers` and `orders`". Name a join column, or spell out the pair as
below.

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

A cast goes after the column it applies to, when the two types differ:

```
document as d | activity .resource_id = .id ::text
```

### Name the table on each side

```
attribute_values as av | company as c c.id = av.company_id | field_definition as fd fd.id = av.attributeId, fd.tenant_id = c.tenantId
```

Either side of a pair can be `alias.column`. Then one join can compare with any table before it,
not only the one just before: here `fd` joins to both `av` and `c`. A side without an alias keeps
its place's meaning: written first, the table being joined; written second, the table just before
it. So `.tenant_id = c.tenantId` is `fd`'s `tenant_id`. Each pair must have the table being joined
on one side. A comparison between two earlier tables goes in `where:`.

When you spell out the columns, naming every side is the clearest way to write it.

### Conditions on the join

```
customers as c | orders as o :left o.customer_id = c.id, o.status = 'paid'
customers as c | orders as o :left o.customer_id = c.id, o.deleted_at is null
```

A pair can compare a column with a string, a number, `true` or `false`, or test `is null` /
`is not null`. The condition stays on the join. On a `:left` join that matters: every customer is
kept, and only paid orders are attached. The same test in `where:` would drop the customers without
a paid order. On an inner join the two mean the same.

### Join on ids inside a JSON array: `[*]`

```
documents_package as dp | officer .id = .officers[*].id
```

Joins each package to every officer whose `id` is in the package's `officers` array. `[*]` means
any element. Keys before it lead to the array, and keys after it are read inside each element:
`.id = .data.staff[*].id`. For an array of plain ids, end the path at `[*]`: `.id = .officer_ids[*]`.

The path can be on either side:

```
officer | documents_package .officers[*].id = .id
```

A row joins once per match, not once per element. Values compare as JSON, so the number `5`
doesn't match the string `"5"`. A cast on the other side changes what is looked for:
`.id ::text = .data[*].id`. Only one `[*]` per path, and no index after it.

To get a row for each element instead, see the `unnest` topic.

### Join on a name you give with `as`

```
activity_resource | where: resourceableType = 'Company' | select: id, resourceableId as company_id | company
```

A name given with `as` tells Pine what a column holds. `company_id` (or `companyId`) leads to a
table called `company` or `companies`, so the bare `company` that follows joins `company.id` to
`resourceableId`. Use it when no foreign key says where a column points, as with a column that
holds ids of several tables.

The name can be on a column of `select:`, a key inside a JSON column (`select: data.ownerId as
employee_id | employee`), or the elements of `unnest:` (see that topic). It must be on the table the
join starts from. A bare table joins on the newest such name, even when a foreign key also connects
the two. Name a join column, `company .company_id`, to use the foreign key instead.

### Finding the join you want

Ending an expression at `| ` and asking for completions lists every table the current one can
join to, best first. Joins backed by a real foreign key are marked separately from ones guessed
from column naming — a guessed join has no foreign key behind it and can simply be wrong, so
confirm it returns sensible rows before relying on it.
