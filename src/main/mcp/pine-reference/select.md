# Select

Select columns to return in the query result.

**Operation(s):** `select:`, `s:`

## Examples

### Select specific columns

```
customers | select: id, email
```
translates to:
```sql
SELECT id, email FROM customers
```

Choose only the columns you need in the result

### Select with alias

```
customers | s: id as customer_id
```
translates to:
```sql
SELECT id as customer_id FROM customers
```

Rename columns in the output using aliases

### Select with table qualification

```
customers as c | orders as o | s: c.email, o.total_amount
```
translates to:
```sql
SELECT c.id, o.total FROM customers as c JOIN orders as o ON c.id = o.customer_id
```

Specify which table each column comes from in joins
