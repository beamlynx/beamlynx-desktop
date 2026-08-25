# Table

This is as simple as it gets. To get data from a table, write the table name.

## Examples

### Every column of a table

```
customers
```

### Qualify with a schema

```
public.customers
```

Use this when the same table name exists in more than one schema.

### Give the table an alias

```
customers as c
```

The alias becomes the name you use to qualify columns later, e.g. `c.email`.
