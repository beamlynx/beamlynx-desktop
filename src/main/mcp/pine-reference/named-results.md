# Named results

Not to be confused with `$name` variables, which are values passed with run_query: see the `variables` topic.

Name an intermediate result and use it as a table in later expressions. Named results let you build up queries in readable steps, and let one expression reuse the result of another.

**Operation(s):** `|= name`

**Syntax:**
```
<expression> |= <name> [| more operations...]
```

## Examples

### Name a result and reuse it

```
company | where: active = true |= active_companies

active_companies | employee
```

Assign the filtered company result to active_companies, then use it as a table in the next expression.

### Mid-pipeline assign

```
company |= all_companies | where: active = true
```

Place |= anywhere in the pipe chain. The snapshot is taken at that point — all_companies is the full unfiltered company set, while the current expression still returns only active companies.

### Reference named result columns

```
company |= c | employee | s: id, c.id
```

After |= c, use c as a column qualifier in the same expression. c.id refers to the company table's id column.

### Chain multiple steps

```
company | where: active = true |= active_companies

active_companies | l: 10 |= small_active

small_active
```

Each expression builds on the previous. Separate expressions with a blank line.

### Only explicitly selected id columns stay joinable

```
company | select: id, name |= x

x | employee
```

Once a named result is used, its underlying tables are no longer visible — only its own output columns are. A table stays a valid join source through the named result only if its id was explicitly selected. select: name alone (no id) would make x unjoinable to anything.

### Automatic checkpoints after group: or limit:

```
company | limit: 10 | employee
```

group: and limit: produce a final, bounded result. Piping into another table after one of them automatically takes an unnamed checkpoint first, so the join applies on top of the limited or grouped result instead of corrupting it. Name that checkpoint yourself with |= placed right after the group:/limit: step.

### Combine multiple aggregates per row

```
customers as c | orders .customer_id | group: c.id, c.email | select: id, count as order_count | order: count desc |= x

customers as c | audit.order_status_changes .customer_id | group: c.id, c.email | select: id, count as status_change_count |= y

customers | select: email | x | select: order_count | y | select: status_change_count
```

x and y each aggregate a different related table down to one row per customer, exposing just their own count column. The final expression starts from customers again and joins both named results in, producing one row per customer with email, order_count, and status_change_count side by side — without repeating the customers join in each branch.

### Use a one-column named result after in

```
company | where: name = 'Acme' | employee .company_id | s: id |= acme_emps

employee | where: id in acme_emps
```

`id in acme_emps` matches the ids acme_emps returns, however many. The named result must select exactly one column (here `s: id`); selecting every column or several is an error that names them. `not in` works too. After `=`, a bare name means a column, so use `in`.
