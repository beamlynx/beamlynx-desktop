# Order

Sorts the rows.

**Operation(s):** `order:`, `o:`

## Examples

### Sort by a column

```
customers | order: email
```

Descending unless stated otherwise. Write `asc` to sort ascending.

### Sort descending

```
customers | order: email desc
```

### Sort by several columns

```
customers | order: first_name asc, last_name desc
```

Earlier columns take priority; later ones break ties.

### Where NULLs go

```
company_structure_template | order: company_id asc nulls first, created_at asc
```

`nulls first` puts the rows with no `company_id` first, and `nulls last` puts them last. It goes after
`asc` or `desc`. Without it, each database puts NULLs where it does by default.

### With a limit

```
customers | order: created_at desc | limit: 10
```

The ten most recent. Sorting before limiting is what makes the cap meaningful.
