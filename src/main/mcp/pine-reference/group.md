# Group

Used to group the results of a query by a given column.

**Operation(s):** `group:`, `g:`

**Syntax:**
```
table_name | group: column_name => function
```

## Examples

### Basic grouping

```
categories as c | products .category_id | order_items .product_id | group: c.name => count
```
translates to:
```sql
SELECT c.name, COUNT(1) FROM categories as c JOIN products ON c.id = products.category_id JOIN order_items ON products.id = order_items.product_id GROUP BY c.name
```

Group products by category and count the number of order items for each category
