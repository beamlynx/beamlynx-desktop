# Where

Filters the results based on conditions.

**Operation(s):** `where:`, `w:`

## Examples

### Condition

```
customers | where: first_name = 'John'
```
translates to:
```sql
SELECT * FROM customers WHERE first_name = 'John'
```

Filter records where a column equals a specific value

### Multiple conditions

```
customers | where: first_name like 'John%' | where: last_name = 'Doe'
```
translates to:
```sql
SELECT * FROM customers WHERE first_name LIKE 'John%' AND last_name = 'Doe'
```

Apply multiple filter conditions with comma separation

### NULL

```
customers | where: created_at is null
```
translates to:
```sql
SELECT * FROM customers WHERE created_at IS NULL
```

Filter for records with NULL values in a column

### NOT NULL

```
customers | where: created_at is not null
```
translates to:
```sql
SELECT * FROM customers WHERE created_at IS NOT NULL
```

Filter for records with NOT NULL values in a column

### IN clause

```
categories | where: name in ('Electronics', 'Computers')
```
translates to:
```sql
SELECT * FROM categories WHERE name IN ('Electronics', 'Computers')
```

Filter for records where column value matches any in a list

### Column comparison

```
customers | where: created_at < updated_at
```
translates to:
```sql
SELECT * FROM customers WHERE created_at < updated_at
```

Compare values between different columns

### LIKE

```
customers | where: first_name like 'Jo%'
```
translates to:
```sql
SELECT * FROM customers WHERE first_name LIKE 'Jo%'
```

Filter for records using the LIKE operator

### ILIKE

```
customers | where: first_name ilike 'jo%'
```
translates to:
```sql
SELECT * FROM customers WHERE first_name ILIKE 'jo%'
```

Filter for records using the ILIKE operator
