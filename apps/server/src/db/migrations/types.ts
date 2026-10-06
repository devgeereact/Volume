import { sql, type ColumnDataType, type CreateTableBuilder, type Expression, type Kysely } from 'kysely';

export type Dialect = 'sqlite' | 'mysql';

/** Column types chosen per dialect so one migration runs on SQLite and MySQL. */
export interface ColumnTypes {
  id: ColumnDataType;
  short: ColumnDataType; // up to 64 chars: enums, keys, hashes
  str: ColumnDataType; // up to 255 chars, indexable in MySQL
  text: ColumnDataType | Expression<unknown>; // long text (MEDIUMTEXT in MySQL, up to 16 MB)
  json: ColumnDataType | Expression<unknown>;
  blob: ColumnDataType | Expression<unknown>;
  ms: ColumnDataType;
  int: ColumnDataType;
  real: ColumnDataType;
  bool: ColumnDataType;
}

export function columnTypes(dialect: Dialect): ColumnTypes {
  if (dialect === 'mysql') {
    return {
      id: 'varchar(26)',
      short: 'varchar(64)',
      str: 'varchar(255)',
      text: sql`mediumtext`,
      json: sql`mediumtext`,
      blob: sql`mediumblob`,
      ms: 'bigint',
      int: 'integer',
      real: 'double precision',
      bool: 'integer',
    };
  }
  return {
    id: 'text',
    short: 'text',
    str: 'text',
    text: 'text',
    json: 'text',
    blob: 'blob',
    ms: 'integer',
    int: 'integer',
    real: 'real',
    bool: 'integer',
  };
}

/**
 * The database handle a migration gets. Kysely's migration guide types it as Kysely<any> on purpose:
 * a migration must keep working after the schema in db/schema.ts moves on, so it cannot use that type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Kysely's documented migration type, see above
export type MigrationDb = Kysely<any>;

export interface MigrationContext {
  db: MigrationDb;
  dialect: Dialect;
  t: ColumnTypes;
}

/** Adds MySQL table options (InnoDB, utf8mb4). SQLite needs nothing. */
export function tableEnd<T extends string, C extends string>(b: CreateTableBuilder<T, C>, dialect: Dialect): CreateTableBuilder<T, C> {
  return dialect === 'mysql' ? b.modifyEnd(sql`engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`) : b;
}
