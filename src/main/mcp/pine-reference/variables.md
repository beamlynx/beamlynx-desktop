# Variables

A `$name` in an expression stands for a value set separately: in a values block of its own above the query, or in run_query's `variables` argument. The query stays the same and only the value changes, so one query (a saved recipe, say) works for different companies, tenants or dates. A value is always treated as a value: whatever it contains, it can't change what the query does.

**Syntax:** `$name` wherever a value goes: after `=`, `!=`, `>`, `<`, `like`, `ilike` and their `not` forms, as the list after `in` or `not in`, and in `update!`. Names use letters, digits and underscores.

**Values blocks:** a block of only `$name = value` lines, separated from the query by a blank line, sets values for the query. A value is written like a literal (`'text'`, a number, `true`) or as a list in brackets (`('a', 'b')`). A query in the same block as values is an error: put a blank line between them.

**Passing values:** run_query's `variables` maps each name, without the `$`, to its value: a string, a number or a boolean, or a list for `in`. A value passed this way overrides one written in a values block.

## Examples

### Values written above the query

```
$company_name = 'Acme'
$statuses = ('failed', 'stuck')

company | where: name = $company_name | tenant .company_id | request .tenant_id | where: status in $statuses
```

Finds Acme's failed and stuck requests. To run it for another company, change the line, or pass `variables: {"company_name": "Globex"}`, which overrides the line.

### One value

```
company | where: name = $company_name
```

With `variables: {"company_name": "Acme"}`, this finds the company named Acme, exactly as if `'Acme'` were written in the expression.

### A list, for in

```
request | where: tenant_id in $tenant_ids | where: status = 'failed'
```

With `variables: {"tenant_ids": [17, 23]}`, this finds the failed requests of those two tenants.

### Several values

```
request | where: status = $status | where: created_at > $since
```

With `variables: {"status": "failed", "since": "2026-09-01"}`. A value is read the way its column needs it: `"2026-09-01"` is a date for a date column.

### With a named result

```
company | where: name = $company_name |= acme

acme | employee .company_id
```

A variable can be used in any block, including one that defines a named result (see the `named-results` topic).

## What can go wrong

- **A value is missing.** Running stops before anything reaches the database and names each `$name` without a value. Pass it in `variables`.
- **A list where one value goes**, or one value after `in`: the error says which. Use `in $name` for a list.
- **An empty list** isn't allowed after `in`.
- **`null`** isn't a value. To match nulls, write `is null` in the expression.
- **After `is`**, a variable isn't allowed: `is` only takes `null`.

## Another query's result

A variable is always a value, never a query. To use one query's result in another, make it a named result that selects one column, and use it after `in` (see the `named-results` topic):

```
company | where: name = $company_name | tenant .company_id | s: id |= acme_tenants

request | where: tenant_id in acme_tenants
```
