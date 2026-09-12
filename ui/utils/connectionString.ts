export type ParsedConnectionString = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbType: 'postgres' | 'mysql';
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const SCHEMES: Record<string, { dbType: 'postgres' | 'mysql'; defaultPort: string }> = {
  'postgres:': { dbType: 'postgres', defaultPort: '5432' },
  'postgresql:': { dbType: 'postgres', defaultPort: '5432' },
  'mysql:': { dbType: 'mysql', defaultPort: '3306' },
};

/**
 * Parses a Postgres or MySQL connection string, e.g.
 * postgresql://user:password@host:5432/database
 * mysql://user:password@host:3306/database
 */
export function parseConnectionString(connectionString: string): ParsedConnectionString {
  let url: URL;
  try {
    url = new URL(connectionString.trim());
  } catch {
    throw new Error(
      'Invalid connection string. Expected format: postgresql://user:password@host:port/database ' +
        'or mysql://user:password@host:port/database'
    );
  }

  const scheme = SCHEMES[url.protocol];
  if (!scheme) {
    throw new Error('Only postgresql:// or mysql:// connection strings are supported.');
  }

  const dbName = url.pathname.replace(/^\//, '');
  if (!url.hostname || !url.username || !dbName) {
    throw new Error('Connection string must include a user, host, and database name.');
  }

  return {
    dbHost: url.hostname,
    dbPort: url.port || scheme.defaultPort,
    dbName: safeDecode(dbName),
    dbUser: safeDecode(url.username),
    dbPassword: safeDecode(url.password),
    dbType: scheme.dbType,
  };
}
