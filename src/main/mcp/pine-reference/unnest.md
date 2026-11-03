# Unnest

One row for each element of a JSON array. Each row keeps the row it came from.

**Operation(s):** `unnest:`

**Syntax:**
```
table_name | unnest: json_column.path as name
table_name | unnest: json_column.path as name :left
```

The path leads to an array inside a JSON column, written as in the `json` topic. The name after
`as` reads the elements.

## Examples

### A row for each element

```
activity | unnest: data.changes as e | where: e.field = 'giin' | select: id, e.field, e.after
```

Each activity gives one row per change in its `data.changes` array. The `where:` keeps the
changes to `giin`.

### Read an element

| Written | Means |
|---|---|
| `e.field`, `e.after.value` | a key of the element |
| `e` | the element itself, for an array of strings or numbers |
| `e[0]` | an index into the element |

```
customer | unnest: data.tags as t | where: t = 'vip'
```

Keys compare, sort and show like any JSON key: see the `json` topic.

### Which columns come back

`unnest:` shows the element, in place of the table's columns. A `select:` says which columns to
show instead:

```
activity | unnest: data as e
activity | select: id | unnest: data as e
activity | unnest: data as e | select: e.field, e.after
```

The first gives `e`. The second gives `id` and `e`. The third gives `e.field` and `e.after`.

### Keep rows without an array: `:left`

```
company | unnest: options.officers as officer :left
```

A row whose value isn't an array has no elements, so it drops out. That includes a missing key,
`null`, an object and an empty array. `:left` keeps such a row once, with the element empty.
Without it, one `unnest:` of a value that is never an array empties the whole result.

### Arrays inside elements

```
customer | unnest: data.orders as o | unnest: o.items as i | select: id, o.number, i.sku
```

### Count or group the elements

```
activity | unnest: data.changes as e | group: e.field with count
```

### Join a table on the elements

```
company | unnest: data.officerIds as officer_id | officer
```

Name the elements after a table's id (`officer_id`, `officerId`) and a bare table joins on them.
Elements named after the table itself join on their own `id` key:

```
company | unnest: data.officers as officer | officer
```

A key of an element works the same way, once a `select:` names it:

```
company | unnest: data.staff as e | select: e.personId as person_id | person
```

### The pipe stays on the table

`unnest:` is an operation on the table the pipe is on, like `where:`. A bare column name is still
one of that table's columns, and a join after it starts from that table:

```
document | unnest: data.lines as l | where: status = 'open' | company .id = .company_id
```

## What to watch for

- **Two arrays multiply.** `| unnest: officers as o | unnest: companies as c` gives every officer
  next to every company of the same row: 3 and 4 make 12 rows. To see both lists, unnest one and
  select the other whole: `| unnest: officers as o | select: o.id, companies`.
- **A join on a key of an element is not supported yet,** except through a name given with `as`,
  as above.
- **To match rows that contain an element, without a row per element,** a join with `[*]` is
  often what you want instead. See the `join` topic.

## On a connection with a masking policy

An element and its keys are part of their column. When the column is masked, so are they, and a
key of an element can't be a `group:` key.
