import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

async function addHazardsToExistingProjects() {
  console.info("🚧 Adding random hazards to existing projects...");

  const client = new PrismaClient();

  try {
    // Get all existing projects
    const projects = await client.project.findMany({
      include: {
        routePoints: true,
        hazards: true,
      },
    });

    console.info(`Found ${projects.length} projects to process`);

    if (projects.length === 0) {
      console.info("No projects found in the database.");
      return;
    }

    const hazardTypes = [
      "Pothole", "Crack", "Debris", "Sign Damage", "Guardrail Damage", 
      "Road Marking Faded", "Drainage Issue", "Vegetation Overgrowth",
      "Street Light Out", "Sidewalk Damage", "Traffic Sign Missing",
      "Road Surface Deterioration", "Utility Cover Damage", "Tree Root Damage",
      "Water Damage", "Graffiti", "Litter Accumulation"
    ];
    
    const severityLevels = ["Low", "Medium", "High", "Critical"];
    const descriptions = [
      "Minor surface damage requiring attention",
      "Moderate damage affecting road usability", 
      "Significant damage requiring immediate repair",
      "Critical safety hazard requiring urgent attention",
      "Weather-related damage from recent storms",
      "Wear and tear from heavy traffic",
      "Structural damage requiring professional assessment",
      "Environmental damage from vegetation",
      "Vandalism-related damage",
      "Age-related deterioration"
    ];

    let totalHazardsCreated = 0;

    for (const project of projects) {
      console.info(`Processing project: ${project.name || 'Unnamed Project'} (${project.id})`);
      
      // Skip if project already has hazards
      if (project.hazards.length > 0) {
        console.info(`  ⏭️  Skipping - already has ${project.hazards.length} hazards`);
        continue;
      }

      // Generate 2-5 random hazards per project
      const numHazards = Math.floor(Math.random() * 4) + 2; // 2-5 hazards
      console.info(`  🎲 Generating ${numHazards} random hazards...`);
      
      for (let i = 0; i < numHazards; i++) {
        const hazardType = hazardTypes[Math.floor(Math.random() * hazardTypes.length)];
        const severity = severityLevels[Math.floor(Math.random() * severityLevels.length)];
        const description = descriptions[Math.floor(Math.random() * descriptions.length)];
        
        // If we have route points, randomly assign this hazard to one
        let routePointId: string | undefined;
        let latitude: number;
        let longitude: number;
        
        if (project.routePoints.length > 0) {
          const randomRoutePoint = project.routePoints[Math.floor(Math.random() * project.routePoints.length)];
          routePointId = randomRoutePoint.id;
          latitude = randomRoutePoint.latitude || (38.7223 + (Math.random() - 0.5) * 0.1);
          longitude = randomRoutePoint.longitude || (-9.1393 + (Math.random() - 0.5) * 0.1);
        } else {
          // Generate random coordinates around Lisbon
          latitude = 38.7223 + (Math.random() - 0.5) * 0.1; // ±0.05 degrees
          longitude = -9.1393 + (Math.random() - 0.5) * 0.1;
        }

        await client.hazard.create({
          data: {
            typeField: hazardType,
            severity: severity,
            description: `${hazardType}: ${description}`,
            latitude: latitude,
            longitude: longitude,
            createdBy: "system",
            project: { connect: { id: project.id } },
            routePoint: routePointId ? { connect: { id: routePointId } } : undefined,
          },
        });

        totalHazardsCreated++;
        console.info(`    ✅ Created hazard: ${hazardType} (${severity})`);
      }
    }

    console.info(`\n🎉 Successfully added ${totalHazardsCreated} hazards to existing projects!`);
    console.info(`📊 Summary:`);
    console.info(`   - Projects processed: ${projects.length}`);
    console.info(`   - Hazards created: ${totalHazardsCreated}`);
    console.info(`   - Average hazards per project: ${(totalHazardsCreated / projects.length).toFixed(1)}`);

  } catch (error) {
    console.error("❌ Error adding hazards to projects:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  addHazardsToExistingProjects().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { addHazardsToExistingProjects };
