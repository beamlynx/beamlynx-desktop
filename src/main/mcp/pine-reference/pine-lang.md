# Introducing Pine-lang

Beamlynx uses pine-lang which is an intuitive query language that
        transpiles to SQL. Pine-lang uses a pipe-based syntax inspired by Unix
        pipes, making queries readable and composable. As you write queries, you
        see a real-time visualization of table relationships.

**Syntax:**
```
table_1 | table_2 | operation_1: args | operation_2: args
```
