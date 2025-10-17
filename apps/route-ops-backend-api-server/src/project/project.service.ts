import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectServiceBase } from "./base/project.service.base";
import { CreateProjectDto, RoutePointDto } from "./dto/CreateProjectDto";
import { Project } from "./base/Project";

@Injectable()
export class ProjectService extends ProjectServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async createProjectWithRoutePoints(data: CreateProjectDto): Promise<Project> {
    // Create route points first if provided
    const routePointIds: string[] = [];
    if (data.routePoints && data.routePoints.length > 0) {
      for (const routePoint of data.routePoints) {
        const createdRoutePoint = await this.prisma.routePoint.create({
          data: {
            latitude: routePoint.latitude,
            longitude: routePoint.longitude,
            frameNumber: routePoint.frameNumber,
            timestamp: routePoint.timestamp,
          },
        });
        routePointIds.push(createdRoutePoint.id);
      }
    }

    // Create the project first
    const project = await this.prisma.project.create({
      data: {
        name: data.name || "Untitled Project",
        description: data.description,
        status: data.status || "active",
        assignedUser: data.assignedUserId,
        createdBy: data.createdBy,
        videoUrl: data.videoUrl,
        cityHall: data.cityHallId ? { connect: { id: data.cityHallId } } : undefined,
        routePoints: routePointIds.length > 0 ? { connect: routePointIds.map(id => ({ id })) } : undefined,
        hazards: data.hazardIds && data.hazardIds.length > 0 ? { connect: data.hazardIds.map(id => ({ id })) } : undefined,
        surveys: data.surveyIds && data.surveyIds.length > 0 ? { connect: data.surveyIds.map(id => ({ id })) } : undefined,
      },
    });

    // Auto-generate random hazards for the project
    await this.generateRandomHazardsForProject(project.id, routePointIds);

    // Fetch the project with all relations
    const projectWithRelations = await this.prisma.project.findUnique({
      where: { id: project.id },
      include: {
        cityHall: true,
        routePoints: true,
        hazards: true,
        surveys: true,
      },
    });

    return projectWithRelations as Project;
  }

  private async generateRandomHazardsForProject(projectId: string, routePointIds: string[]): Promise<void> {
    const hazardTypes = [
      "Pothole", "Crack", "Debris", "Sign Damage", "Guardrail Damage", 
      "Road Marking Faded", "Drainage Issue", "Vegetation Overgrowth",
      "Street Light Out", "Sidewalk Damage", "Traffic Sign Missing"
    ];
    
    const severityLevels = ["Low", "Medium", "High", "Critical"];
    const descriptions = [
      "Minor surface damage requiring attention",
      "Moderate damage affecting road usability", 
      "Significant damage requiring immediate repair",
      "Critical safety hazard requiring urgent attention",
      "Weather-related damage from recent storms",
      "Wear and tear from heavy traffic",
      "Structural damage requiring professional assessment"
    ];

    // Generate 2-5 random hazards per project
    const numHazards = Math.floor(Math.random() * 4) + 2; // 2-5 hazards
    
    for (let i = 0; i < numHazards; i++) {
      const hazardType = hazardTypes[Math.floor(Math.random() * hazardTypes.length)];
      const severity = severityLevels[Math.floor(Math.random() * severityLevels.length)];
      const description = descriptions[Math.floor(Math.random() * descriptions.length)];
      
      // If we have route points, randomly assign this hazard to one
      let routePointId: string | undefined;
      if (routePointIds.length > 0) {
        routePointId = routePointIds[Math.floor(Math.random() * routePointIds.length)];
      }

      // Generate random coordinates around Lisbon area (or use route point coordinates)
      let latitude: number;
      let longitude: number;
      
      if (routePointId) {
        // Get coordinates from the route point
        const routePoint = await this.prisma.routePoint.findUnique({
          where: { id: routePointId },
          select: { latitude: true, longitude: true }
        });
        latitude = routePoint?.latitude || (38.7223 + (Math.random() - 0.5) * 0.1);
        longitude = routePoint?.longitude || (-9.1393 + (Math.random() - 0.5) * 0.1);
      } else {
        // Generate random coordinates around Lisbon
        latitude = 38.7223 + (Math.random() - 0.5) * 0.1; // ±0.05 degrees
        longitude = -9.1393 + (Math.random() - 0.5) * 0.1;
      }

      await this.prisma.hazard.create({
        data: {
          typeField: hazardType,
          severity: severity,
          description: `${hazardType}: ${description}`,
          latitude: latitude,
          longitude: longitude,
          imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
          createdBy: "system",
          project: { connect: { id: projectId } },
          routePoint: routePointId ? { connect: { id: routePointId } } : undefined,
        },
      });
    }
  }
}
