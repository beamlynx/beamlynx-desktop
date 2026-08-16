# Join

Join tables without having to think of the foreign key relationships. Simply pipe tables together to create joins. However, if you want to specify the join column or other aspects of the join, you can pass the relevant arguments. See examples below:

Supported modifiers:
- `:left` - Performs a left outer join, keeping all records from the left table
- `:right` - Performs a right outer join, keeping all records from the right table
- `:parent` - Joins on the parent table (the one being referenced) instead of the child table (the one with the foreign key)

## Examples

### Join

```
customers | orders
```
translates to:
```sql
SELECT * FROM customers JOIN orders ON customers.id = orders.customer_id
```

Two tables based using the foreign key.

### Multi-table join

```
customers | orders | order_items
```
translates to:
```sql
SELECT * FROM customers JOIN orders ON customers.id = orders.customer_id JOIN order_items ON orders.id = order_items.order_id
```

Pipe multiple tables together for joining multiple tables

### Schema qualified join

```
customers | audit.order_status_changes
```
translates to:
```sql
SELECT * FROM customers JOIN audit.order_status_changes ON customers.id = audit.order_status_changes.customer_id
```

Use schema qualification when joining across different schemas

### Left join

```
customers | orders :left
```
translates to:
```sql
SELECT * FROM customers LEFT JOIN orders ON customers.id = orders.customer_id
```

Use the :left modifier to specify a left join

### Self join

```
categories as p | categories as c
```
translates to:
```sql
SELECT c.* FROM categories as p JOIN categories as c ON p.id = c.parent_id
```

Join a table with itself

### Self join with direction / Parent-child relationship

```
categories as p | categories as c :parent
```
translates to:
```sql
SELECT p.* FROM categories as c JOIN categories as p ON c.parent_id = p.id
```

By default, the child table is picked for the join i.e. the one that holds the foreing key. If you want to join on the parent table i.e. the one being referenced, then use the :parent modifier. Aliases are used for demonstration purposes.
