# Where

Keeps only the rows matching a condition.

**Operation(s):** `where:`, `w:`

## Examples

### Match a value

```
customers | where: first_name = 'John'
```

String values are single-quoted. Numbers and booleans are not.

### Either condition: `or`

```
customers | where: status = 'blocked' or status = 'active'
customers | where: first_name ilike '%ahmad%' or last_name ilike '%ahmad%'
```

`or` joins conditions inside one `where:`. A row is kept when any of them matches. The
conditions can be on different columns.

### Both conditions: another `where:`

```
customers | where: first_name like 'John%' | where: last_name = 'Doe'
```

Each `where:` step narrows what the one before it kept, so chained steps combine with AND.
There is no `and` keyword.

### No comma, no `and`

```
customers | where: first_name like 'John%', last_name = 'Doe'      -- parse error
customers | where: first_name like 'John%' and last_name = 'Doe'   -- parse error
```

Write `or` for either condition, or a second `where:` for both. `or` needs a space on each
side.

### Is null / is not null

```
customers | where: created_at is null
customers | where: created_at is not null
```

### One of several values

```
categories | where: name in ('Electronics', 'Computers')
categories | where: name not in ('Electronics', 'Computers')
```

### Compare two columns

```
customers | where: created_at < updated_at
```

An unquoted name on the right is read as a column, not a string.

### Comparison operators

```
customers | where: age > 30
customers | where: created_at < '2024-01-01'
```

`=`, `!=`, `<`, `>`, `is`, `is not`, `in`, `not in`, `like`, `not like`, `ilike`, `not ilike`.
There is no `>=` and no `<=` — widen the bound instead.

### Pattern matching

```
customers | where: first_name like 'Jo%'
customers | where: first_name ilike 'jo%'
customers | where: first_name ilike '%jo%'
```

`%` matches any run of characters. `like` is case-sensitive, `ilike` is not. There are no regex
operators — `~` and `~*` are not part of the language, and `ilike` with `%` on both sides is
what replaces them.

### Negation

```
customers | where: status != 'archived'
customers | where: name not like 'test%'
customers | where: status not in ('archived', 'deleted')
customers | where: deleted_at is not null
```

`not` only attaches to `like`, `ilike` and `in`. It is not a standalone prefix, so
`where: not status = 'archived'` does not parse — use `!=`.

### Cast the column before comparing

```
customers | where: id = '123e4567-e89b-12d3-a456-426614174000' ::uuid
customers | where: id = '42' ::text
```

The cast goes at the end of the condition and applies to the column, not the value. Only
`::text` and `::uuid` exist. Reach for this when a column's stored type does not match the
literal you are comparing it against.
