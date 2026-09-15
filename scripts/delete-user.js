// Deletes one user by username. Safe by default: with no DATABASE_URL
// override it hits your LOCAL dev database (from .env). To delete from the
// real (production) database, set DATABASE_URL to the production connection
// string first — see the examples below.
//
// Usage:
//   node scripts/delete-user.js <username>
//
// Windows PowerShell, against production:
//   $env:DATABASE_URL = '<production connection string>'
//   node scripts/delete-user.js someUsername
//
// If it fails with a foreign key error, that user owns something the
// database won't silently delete for them (an Equipment Template, Wiring
// Diagram, or Project they created) — check it's really just test data,
// delete/reassign that first, then re-run this.

const { PrismaClient } = require("@prisma/client");

const username = process.argv[2];
if (!username) {
  console.error("Usage: node scripts/delete-user.js <username>");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const deleted = await prisma.user.delete({ where: { username } });
  console.log(`Deleted user "${username}" (id ${deleted.id})`);
}

main()
  .catch((e) => {
    console.error(`Failed to delete "${username}": ${e.message}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
