import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixMigrationState() {
  console.log("Fixing migration state...\n");

  try {
    // Check all migrations
    const allMigrations = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      applied_steps_count: number;
      started_at: Date;
    }>>`
      SELECT migration_name, finished_at, applied_steps_count, started_at
      FROM "_prisma_migrations"
      ORDER BY started_at DESC;
    `;

    console.log("All migrations:");
    allMigrations.forEach(m => {
      console.log(`  - ${m.migration_name}`);
      console.log(`    Finished: ${m.finished_at ? "Yes" : "No"}`);
      console.log(`    Applied steps: ${m.applied_steps_count}`);
      console.log(`    Started: ${m.started_at}`);
      console.log("");
    });

    // Check for failed migrations
    const failedMigrations = allMigrations.filter(m => !m.finished_at);
    if (failedMigrations.length > 0) {
      console.log("Failed migrations found:");
      failedMigrations.forEach(m => {
        console.log(`  - ${m.migration_name}`);
      });
    } else {
      console.log("No failed migrations found.");
    }

    await prisma.$disconnect();
  } catch (error: any) {
    console.error("Error:", error.message);
    throw error;
  }
}

fixMigrationState().catch(console.error);

