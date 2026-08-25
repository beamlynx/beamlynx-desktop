# Order

Sorts the rows.

**Operation(s):** `order:`, `o:`

## Examples

### Sort by a column

```
customers | order: email
```

Ascending unless stated otherwise.

### Sort descending

```
customers | order: email desc
```

### Sort by several columns

```
customers | order: first_name asc, last_name desc
```

Earlier columns take priority; later ones break ties.

### With a limit

```
customers | order: created_at desc | limit: 10
```

The ten most recent. Sorting before limiting is what makes the cap meaningful.
