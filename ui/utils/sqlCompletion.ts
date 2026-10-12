import { MySQL, PostgreSQL, SQLConfig, SQLite } from '@codemirror/lang-sql';
import type { SqlSchemaResponse } from '../store/client';

const dialects = { postgres: PostgreSQL, mysql: MySQL, sqlite: SQLite };

/**
 * CodeMirror's SQL settings for a connection's schema (pine-lang's
 * /sql-schema). The dialect decides how a completed name is quoted: in
 * Postgres `tenantId` is inserted as "tenantId". Tables in the default
 * schema are offered without it. Without a schema, plain SQL and no
 * completion of names.
 */
export function sqlCompletionConfig(schema: SqlSchemaResponse | null): SQLConfig {
  if (!schema || schema.tables.length === 0) return {};
  const namespace: Record<string, Record<string, string[]>> = {};
  for (const { schema: name, table, columns } of schema.tables) {
    (namespace[name] ??= {})[table] = columns;
  }
  return {
    dialect: schema.dialect ? dialects[schema.dialect] : undefined,
    schema: namespace,
    defaultSchema: schema['default-schema'],
  };
}
