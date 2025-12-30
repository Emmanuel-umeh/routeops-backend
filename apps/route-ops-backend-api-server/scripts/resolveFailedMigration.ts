import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkDatabaseState() {
  console.log("Checking database state...\n");

  try {
    // Check if RoadRatingHistory table exists
    const roadRatingHistoryExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'RoadRatingHistory'
      );
    `;

    // Check if RoadRating table exists
    const roadRatingExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'RoadRating'
      );
    `;

    console.log(`RoadRatingHistory table exists: ${roadRatingHistoryExists[0]?.exists || false}`);
    console.log(`RoadRating table exists: ${roadRatingExists[0]?.exists || false}\n`);

    if (roadRatingHistoryExists[0]?.exists) {
      // Check columns
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'RoadRatingHistory'
        ORDER BY ordinal_position;
      `;
      console.log("RoadRatingHistory columns:", columns.map(c => c.column_name).join(", "));
    }

    if (roadRatingExists[0]?.exists) {
      // Check columns
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'RoadRating'
        ORDER BY ordinal_position;
      `;
      console.log("RoadRating columns:", columns.map(c => c.column_name).join(", "));
    }

    // Check migration status
    const migrations = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      applied_steps_count: number;
    }>>`
      SELECT migration_name, finished_at, applied_steps_count
      FROM "_prisma_migrations"
      WHERE migration_name = '20251206141324_add_road_ratings'
      ORDER BY started_at DESC
      LIMIT 1;
    `;

    if (migrations.length > 0) {
      console.log("\nMigration status:");
      console.log(`  Name: ${migrations[0].migration_name}`);
      console.log(`  Finished: ${migrations[0].finished_at ? "Yes" : "No"}`);
      console.log(`  Applied steps: ${migrations[0].applied_steps_count}`);
    }

    return {
      roadRatingHistoryExists: roadRatingHistoryExists[0]?.exists || false,
      roadRatingExists: roadRatingExists[0]?.exists || false,
    };
  } catch (error: any) {
    console.error("Error checking database:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseState().catch(console.error);

