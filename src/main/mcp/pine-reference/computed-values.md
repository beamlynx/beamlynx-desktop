# Computed values

A value that isn't just a column: a fallback when a column is empty, a flag that says whether a
row is in some set, a label chosen by a condition.

**Where:** in `select:` (named with `as`), after `with` in `group:` (see the `group` topic), and on
the right of a comparison in `where:` and `update!`.

**Syntax:**
```
table_name | select: column, <value> as name
```

A value is any of these, and they nest:

| Kind | Example |
|---|---|
| A column, with an optional cast | `a.id`, `a.id ::text` |
| A literal | `'att:'`, `42`, `true`, `null`, `'2024-01-01'` |
| A variable | `$prefix` |
| A function | `coalesce(a, b)`, `concat('att:', a.id)`, `now()`, `month(created_at)` |
| A function, applied with the arrow | `created_at => month`, `title => coalesce('untitled')` |
| A condition, as true or false | `type = 'sharepoint'`, `deleted_at is null`, `id in (1, 2)`, `id in edited` |
| A choice | `if x is null then 'none' else x` |

- `coalesce(a, b, ...)` gives the first argument that isn't null.
- `concat(a, b, ...)` joins the arguments as text. It is null when any argument is null.
- `now()` is the current date and time.
- `if <condition> then <value> else <value>`. The `else` is optional; without it the value is
  null when the condition isn't true. Chain branches with `else if`.

These are the only functions. There is no arithmetic (`+`, `-`) and no date intervals.

## The arrow

`x => f` is `f(x)`, and `x => f(a, b)` is `f(x, a, b)`: the value on the left is the first
argument. Both forms mean the same. The arrow appends a step to a value you already have:

```
created_at => month                       month(created_at)
title => coalesce('untitled')             coalesce(title, 'untitled')
title => coalesce('x') => concat('!')     concat(coalesce(title, 'x'), '!')
```

Use the arrow for a function of one value, and the call for anything else: `coalesce(a, b)` keeps
the arguments in order, and `any(type = 'x')` keeps a condition whole. A condition before an arrow
needs parentheses: `(type = 'x') => any`.

The date functions are `minute`, `hour`, `day`, `week`, `month` and `year`. Each gives the date as
text, cut to that unit: `created_at => month` is `'2024-05'`.

## Examples

### A fallback for an empty column

```
attachment as a | select: a.id, coalesce(a.name, concat('att:', a.id)) as label
```

`label` is the name, or `att:` and the id when there is no name.

### A flag

```
document as d | select: d.id, d.deleted_at is null as live, d.id in edited as was_edited
```

A condition in `select:` is a true or false column. `edited` here is a named result from an
earlier block (see the `named-results` topic).

### A label chosen by a condition

```
order | select: id, if status = 'paid' then 'done' else if status = 'new' then 'waiting' else 'other' as stage
```

### Use the name in a later step

```
document | select: id, company_id, coalesce(reference_id, concat('doc:', id)) as key | order: created_at desc | limit: 1 per company_id, key
```

A later `where:`, `order:`, `group:` or `limit: ... per` can use a computed name like a column. A
condition's name is compared with `true` or `false`: `where: live = true`.

### Now

```
session | where: expires_at < now()
```

### A cast in a join

```
document as d | activity .resource_id = .id ::text
```

The cast belongs to the column it follows, here `d.id`. Casts are `::text` and `::uuid`.
