import type { DbType } from './dbType';

export type ParsedConnectionString = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbType: DbType;
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const SCHEMES: Record<string, { dbType: DbType; defaultPort: string }> = {
  'postgres:': { dbType: 'postgres', defaultPort: '5432' },
  'postgresql:': { dbType: 'postgres', defaultPort: '5432' },
  'mysql:': { dbType: 'mysql', defaultPort: '3306' },
  'sqlite:': { dbType: 'sqlite', defaultPort: '' },
};

/**
 * `sqlite:///Users/me/app.db` carries the file's absolute path. A Windows path
 * arrives as `sqlite:///C:/Users/me/app.db`, whose pathname has a slash before
 * the drive letter that isn't part of the path.
 */
function sqliteFilePath(pathname: string): string {
  const path = safeDecode(pathname);
  return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
}

/**
 * Parses a Postgres, MySQL or SQLite connection string, e.g.
 * postgresql://user:password@host:5432/database
 * mysql://user:password@host:3306/database
 * sqlite:///absolute/path/to/file.db
 */
export function parseConnectionString(connectionString: string): ParsedConnectionString {
  let url: URL;
  try {
    url = new URL(connectionString.trim());
  } catch {
    throw new Error(
      'Invalid connection string. Expected format: postgresql://user:password@host:port/database ' +
        'mysql://user:password@host:port/database or sqlite:///path/to/file.db'
    );
  }

  const scheme = SCHEMES[url.protocol];
  if (!scheme) {
    throw new Error('Only postgresql://, mysql:// or sqlite:// connection strings are supported.');
  }

  if (scheme.dbType === 'sqlite') {
    const dbName = sqliteFilePath(url.pathname);
    if (!dbName.replace(/^\//, '')) {
      throw new Error('Connection string must include the path of the database file.');
    }
    return { dbHost: '', dbPort: '', dbName, dbUser: '', dbPassword: '', dbType: 'sqlite' };
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

const SCHEME_FOR_TYPE: Record<DbType, string> = {
  postgres: 'postgresql',
  mysql: 'mysql',
  sqlite: 'sqlite',
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
  if (fields.dbType === 'sqlite') {
    // Percent-encode each segment (a space in a folder name), not the slashes.
    // `C:\Users\me\app.db` becomes `/C:/Users/me/app.db`.
    const path = fields.dbName.replace(/\\/g, '/').replace(/^(?!\/)/, '/');
    const segments = path
      .split('/')
      .map((segment, i) => (i === 1 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)));
    return `${scheme}://${segments.join('/')}`;
  }
  const auth = fields.dbUser
    ? `${encodeURIComponent(fields.dbUser)}${fields.dbPassword ? `:${encodeURIComponent(fields.dbPassword)}` : ''}@`
    : '';
  const port = fields.dbPort ? `:${fields.dbPort}` : '';
  return `${scheme}://${auth}${fields.dbHost}${port}/${encodeURIComponent(fields.dbName)}`;
}
