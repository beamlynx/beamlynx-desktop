# Order

Sort the results by one or more columns.

**Operation(s):** `order:`, `o:`

## Examples

### Basic ordering

```
customers | order: email
```
translates to:
```sql
SELECT * FROM customers ORDER BY email
```

Sort results by a single column in ascending order

### Descending order

```
customers | order: email desc
```
translates to:
```sql
SELECT * FROM customers ORDER BY email DESC
```

Sort results in descending order using the desc keyword

### Multiple columns

```
customers | order: first_name asc, last_name desc
```
translates to:
```sql
SELECT * FROM customers ORDER BY first_name ASC, last_name DESC
```

Sort by multiple columns with different sort directions
