import { PrismaClient } from '@prisma/client';

/** Full-text search (§2). Prisma has no syntax for FTS5 virtual tables, and putting the
 *  raw SQL in a migration makes `prisma migrate dev` see permanent drift — it wants to
 *  drop the fts shadow tables on every run. So the index is rebuilt here instead, and
 *  both `db:migrate` and `db:seed` call it.
 *
 *  Drop-and-rebuild rather than incremental: it is idempotent, it takes well under a
 *  second on a campus this size, and a half-applied run can't leave a stale index. */

const prisma = new PrismaClient();

interface FtsColumn {
  /** Column on the source table; also the column name inside the fts table. */
  name: string;
  /** Nullable columns get COALESCE — fts5 refuses NULLs. */
  nullable?: boolean;
}

interface FtsTable {
  name: string;
  source: string;
  columns: FtsColumn[];
}

const TABLES: FtsTable[] = [
  {
    name: 'course_fts',
    source: 'Course',
    columns: [{ name: 'code' }, { name: 'title' }, { name: 'description', nullable: true }],
  },
  {
    name: 'club_fts',
    source: 'Club',
    columns: [{ name: 'name' }, { name: 'description' }, { name: 'category' }],
  },
  {
    name: 'resource_fts',
    source: 'Resource',
    columns: [{ name: 'title' }, { name: 'description', nullable: true }, { name: 'type' }],
  },
  {
    name: 'qapost_fts',
    source: 'QAPost',
    columns: [{ name: 'title' }, { name: 'body' }],
  },
];

/** `description` → `COALESCE(description, '')`, and with a prefix → `COALESCE(new.description, '')`. */
function read(col: FtsColumn, prefix = ''): string {
  const ref = `${prefix}${col.name}`;
  return col.nullable ? `COALESCE(${ref}, '')` : ref;
}

export async function rebuildFts(client: PrismaClient = prisma) {
  for (const table of TABLES) {
    const names = table.columns.map((c) => c.name).join(', ');
    const backfill = table.columns.map((c) => read(c)).join(', ');
    const fromNew = table.columns.map((c) => read(c, 'new.')).join(', ');

    // Triggers first — dropping the table out from under a live trigger errors.
    for (const suffix of ['ai', 'ad', 'au']) {
      await client.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${table.name}_${suffix}`);
    }
    await client.$executeRawUnsafe(`DROP TABLE IF EXISTS ${table.name}`);

    await client.$executeRawUnsafe(
      `CREATE VIRTUAL TABLE ${table.name} USING fts5(
         id UNINDEXED, ${names}, tokenize = 'porter unicode61'
       )`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO ${table.name} (id, ${names})
       SELECT id, ${backfill} FROM "${table.source}"`,
    );

    // Keep the index live, so search reflects edits without another rebuild.
    await client.$executeRawUnsafe(
      `CREATE TRIGGER ${table.name}_ai AFTER INSERT ON "${table.source}" BEGIN
         INSERT INTO ${table.name} (id, ${names}) VALUES (new.id, ${fromNew});
       END`,
    );
    await client.$executeRawUnsafe(
      `CREATE TRIGGER ${table.name}_ad AFTER DELETE ON "${table.source}" BEGIN
         DELETE FROM ${table.name} WHERE id = old.id;
       END`,
    );
    await client.$executeRawUnsafe(
      `CREATE TRIGGER ${table.name}_au AFTER UPDATE ON "${table.source}" BEGIN
         DELETE FROM ${table.name} WHERE id = old.id;
         INSERT INTO ${table.name} (id, ${names}) VALUES (new.id, ${fromNew});
       END`,
    );
  }
}

// Run directly via `npm run db:fts`, as well as being imported by the seed.
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('prisma/fts.ts');
if (invokedDirectly) {
  rebuildFts()
    .then(() => console.log(`  Search index rebuilt: ${TABLES.map((t) => t.name).join(', ')}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
