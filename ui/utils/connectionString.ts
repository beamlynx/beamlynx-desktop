export type ParsedConnectionString = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Parses a Postgres connection string, e.g.
 * postgresql://user:password@host:5432/database
 */
export function parseConnectionString(connectionString: string): ParsedConnectionString {
  let url: URL;
  try {
    url = new URL(connectionString.trim());
  } catch {
    throw new Error(
      'Invalid connection string. Expected format: postgresql://user:password@host:port/database'
    );
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Only postgresql:// connection strings are supported.');
  }

  const dbName = url.pathname.replace(/^\//, '');
  if (!url.hostname || !url.username || !dbName) {
    throw new Error('Connection string must include a user, host, and database name.');
  }

  return {
    dbHost: url.hostname,
    dbPort: url.port || '5432',
    dbName: safeDecode(dbName),
    dbUser: safeDecode(url.username),
    dbPassword: safeDecode(url.password),
  };
}
