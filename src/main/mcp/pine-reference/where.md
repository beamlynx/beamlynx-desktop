# Where

Keeps only the rows matching a condition.

**Operation(s):** `where:`, `w:`

## Examples

### Match a value

```
customers | where: first_name = 'John'
```

String values are single-quoted. Numbers and booleans are not.

### Several conditions

```
customers | where: first_name like 'John%' | where: last_name = 'Doe'
```

Each `where:` narrows the result further, so chaining them combines with AND.

### Is null / is not null

```
customers | where: created_at is null
customers | where: created_at is not null
```

### One of several values

```
categories | where: name in ('Electronics', 'Computers')
```

### Compare two columns

```
customers | where: created_at < updated_at
```

An unquoted name on the right is read as a column, not a string.

### Pattern matching

```
customers | where: first_name like 'Jo%'
customers | where: first_name ilike 'jo%'
```

`%` matches any run of characters. `like` is case-sensitive, `ilike` is not.

### Negation

```
customers | where: not status = 'archived'
```
