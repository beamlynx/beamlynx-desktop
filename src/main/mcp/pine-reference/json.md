# JSON

A key inside a `json` or `jsonb` column, used like a column.

**Operation(s):** any that takes a column: `select:`, `where:`, `order:`, `group:`, `update!`

## Examples

### Pick out a value

```
customer | select: name, data.address.city
customer | select: data.plan as tier
```

Write the column, then each key after a dot. The result column is named after the path,
`data.address.city`, unless `as` names it. A nested object comes back as JSON text.

### Filter on a value

```
customer | where: data.address.country = 'SE'
customer | where: data.seats > 10
customer | where: data.active = true
```

The value decides how it compares: `10` compares as a number, `'SE'` as text, `true` as a
boolean. `>` and `<` only match values of the same kind, so `data.seats > 10` skips a row whose
`seats` is the text `'20'`, a boolean or an object.

### Missing keys

```
customer | where: data.cancelled_at is null
customer | where: data.cancelled_at is not null
```

`is null` matches a row without the key, and a row where it is `null`.

### Text matching and lists

```
customer | where: data.name ilike '%acme%'
customer | where: data.plan in ('pro', 'team')
```

### Sort and group

```
customer | order: data.signup.score desc | limit: 10
customer | group: data.plan with count
```

Sorting compares the values themselves, so numbers sort as numbers.

### Arrays, and keys that aren't plain names

```
customer | select: data.tags[0]
customer | select: data.'home address', data.'it''s'
```

`[0]` is the first element. Quote a key that has spaces or other characters, and write an
apostrophe inside it twice. A key with `-` needs no quotes: `data.first-name`.

### The type or length of a value

```
customer | select: id, jsonb_typeof(data.tags) as tags_type, data.tags => jsonb_array_length as tag_count
customer | where: jsonb_typeof(data) = 'array'
```

`jsonb_typeof` gives `object`, `array`, `string`, `number`, `boolean` or `null`, on every database.
`jsonb_array_length` counts an array's items. On Postgres it is an error for a value that isn't an
array, so check the type first when it may not be one:

```
customer | select: id, jsonb_array_length(if jsonb_typeof(data) = 'array' then data else data.nodes) as n
```

Inside these two, a key is read as JSON, not as text. Elsewhere it is text, so an `if` that gives a
JSON column in one branch and a key in another fails on Postgres. Put it inside one of these two.

### Change one value

```
customer | where: id = 7 | update! data.plan = 'pro', data.seats = 12
```

Only the value at that key changes; the rest of the JSON stays as it was. The value decides its
kind, as in `where:`: `'12'` is text, `12` a number, `true` a boolean, `null` a JSON null. A
missing key is added, but the object or array it goes into must already be there: a row where
it isn't is left unchanged and isn't counted as updated.

### Through a table's alias

```
customer as c | employee | where: c.data.plan = 'pro'
```

A name before the first dot is read as an alias when one exists, otherwise as a column of the
current table. So `data.plan` is the `plan` key of the current table's `data` column. If an alias
is also called `data`, the alias wins: write the table's own alias, `c.data.plan`, to reach the
column.

## What doesn't work

- **No `->` or `->>`.** Use dots.
- **No object or array as a value.** `update!` writes text, numbers, booleans and `null` into a
  key, not `{...}` or `[...]`.
- **A key or its whole column, not both.** `update! data = '{}', data.plan = 'pro'` is refused.
- **A key is compared with a value, not with another column.** `where: data.plan = other_column`
  is refused.
- **No `=> month` on a key.** Its value is text, not a date.
- **A path only goes into a JSON column.** `name.first` on a text column is an error.

## On a connection with a masking policy

A JSON column the policy masks masks every key inside it. Selecting a key returns `xxxxx`.
Filtering, sorting and joining on a key still work, with a value you supply. Grouping on one is
refused, since the group's key would return the value.
