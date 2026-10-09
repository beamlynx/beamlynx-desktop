/**
 * The databases a connection can point at. `sqlite` is a local file: its
 * `dbName` is the file's absolute path, and it has no host, port, user or
 * password (those stay empty strings). Desktop app only -- pine-lang refuses
 * it unless beamlynx-desktop started the server.
 */
export type DbType = 'postgres' | 'mysql' | 'sqlite';
