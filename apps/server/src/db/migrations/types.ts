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
 * The migration handle uses unknown column values, independently of the current application schema.
 * This keeps old migrations usable after db/schema.ts changes without bypassing strict typing.
 */
export type MigrationDb = Kysely<Record<string, Record<string, unknown>>>;

export interface MigrationContext {
  db: MigrationDb;
  dialect: Dialect;
  t: ColumnTypes;
}

/** Adds MySQL table options (InnoDB, utf8mb4). SQLite needs nothing. */
export function tableEnd<T extends string, C extends string>(b: CreateTableBuilder<T, C>, dialect: Dialect): CreateTableBuilder<T, C> {
  return dialect === 'mysql' ? b.modifyEnd(sql`engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci`) : b;
}
