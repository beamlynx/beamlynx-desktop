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

const SCHEME_FOR_TYPE: Record<ParsedConnectionString['dbType'], string> = {
  postgres: 'postgresql',
  mysql: 'mysql',
};

/**
 * Builds a connection string from individual fields -- the inverse of
 * parseConnectionString, so the "Connection string" tab can show a live
 * equivalent of whatever's currently in the "Fields" tab. User, password,
 * and database name are percent-encoded (matches safeDecode above, so this
 * round-trips through parseConnectionString); host and port are not, since
 * neither can validly contain characters that would need it. The password
 * segment is omitted entirely when blank, rather than rendered as a bare
 * trailing colon (`user:@host`).
 */
export function buildConnectionString(fields: {
  dbType: ParsedConnectionString['dbType'];
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
}): string {
  const scheme = SCHEME_FOR_TYPE[fields.dbType];
  const auth = fields.dbUser
    ? `${encodeURIComponent(fields.dbUser)}${fields.dbPassword ? `:${encodeURIComponent(fields.dbPassword)}` : ''}@`
    : '';
  const port = fields.dbPort ? `:${fields.dbPort}` : '';
  return `${scheme}://${auth}${fields.dbHost}${port}/${encodeURIComponent(fields.dbName)}`;
}
