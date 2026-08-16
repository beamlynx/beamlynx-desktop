# Table

This is as simple as it gets! You want to get data from a table? Just write the table name.

## Examples

### Select all

```
customers
```
translates to:
```sql
SELECT * FROM customers
```

### Table in a schema

```
public.customers
```
translates to:
```sql
SELECT * FROM public.customers
```

### Table with alias

```
customers as c
```
translates to:
```sql
SELECT * FROM customers as c
```
