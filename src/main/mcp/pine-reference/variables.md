# Variables

A `$name` in an expression stands for a value you pass separately, in run_query's `variables` argument. The expression stays the same and only the value changes, so you can reuse one expression (a saved recipe, say) for different companies, tenants or dates. A value is always treated as a value: whatever it contains, it can't change what the expression does.

**Syntax:** `$name` wherever a value goes: after `=`, `!=`, `>`, `<`, `like`, `ilike` and their `not` forms, as the list after `in` or `not in`, and in `update!`. Names use letters, digits and underscores.

**Passing values:** run_query's `variables` maps each name, without the `$`, to its value: a string, a number or a boolean. A variable used with `in` takes a list.

## Examples

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

## Not yet

A variable can't stand for another expression's result. Run the first expression, then pass the values it returned as a list.
