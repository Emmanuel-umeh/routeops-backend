import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EnumProjectStatus } from "./base/EnumProjectStatus";
import { ProjectServiceBase } from "./base/project.service.base";
import { CreateProjectDto, RoutePointDto } from "./dto/CreateProjectDto";
import { Project } from "./base/Project";

@Injectable()
export class ProjectService extends ProjectServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  parseProjectFilters(
    query: Record<string, unknown>
  ): { standardQuery: Record<string, unknown>; filters: ProjectFilters } {
    const {
      startDate,
      endDate,
      eiriMin,
      eiriMax,
      eiriRange,
      operator,
      operatorId,
      status,
      ...standardQuery
    } = query;

    const filters = this.extractFilters({
      startDate,
      endDate,
      eiriMin,
      eiriMax,
      eiriRange,
      operator,
      operatorId,
      status,
    });

    return { standardQuery, filters };
  }

  applyProjectFilters(
    baseWhere: Record<string, any> | undefined,
    filters: ProjectFilters
  ): Record<string, any> | undefined {
    if (!filters || this.isEmptyFilter(filters)) {
      return baseWhere;
    }

    const where: Record<string, any> = baseWhere ? { ...baseWhere } : {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.operator) {
      where.createdBy = {
        ...(where.createdBy ?? {}),
        equals: filters.operator,
      };
    }

    const someFilters = this.buildSurveyFilters(
      (where.surveys as Record<string, any>)?.some,
      filters
    );

    if (someFilters) {
      where.surveys = {
        ...(where.surveys ?? {}),
        some: someFilters,
      };
    }

    return Object.keys(where).length > 0 ? where : undefined;
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

  private extractFilters(
    raw: Partial<Record<string, unknown>>
  ): ProjectFilters {
    const startDate = this.parseDate(this.getString(raw.startDate));
    const endDate = this.parseDate(this.getString(raw.endDate), true);

    const range = this.extractEiriRange(this.getString(raw.eiriRange));
    const eiriMin = this.parseNumber(raw.eiriMin) ?? range.min;
    const eiriMax = this.parseNumber(raw.eiriMax) ?? range.max;

    return {
      startDate,
      endDate,
      eiriMin,
      eiriMax,
      operator: this.getString(raw.operator) ?? this.getString(raw.operatorId),
      status: this.parseStatus(this.getString(raw.status)),
    };
  }

  private buildSurveyFilters(
    existing: Record<string, any> | undefined,
    filters: ProjectFilters
  ): Record<string, any> | undefined {
    const next: Record<string, any> = existing ? { ...existing } : {};
    let mutated = false;

    if (filters.startDate) {
      next.startTime = {
        ...(next.startTime ?? {}),
        gte: filters.startDate,
      };
      mutated = true;
    }

    if (filters.endDate) {
      next.startTime = {
        ...(next.startTime ?? {}),
        lte: filters.endDate,
      };
      mutated = true;
    }

    if (filters.eiriMin !== undefined || filters.eiriMax !== undefined) {
      next.eIriAvg = {
        ...(next.eIriAvg ?? {}),
        ...(filters.eiriMin !== undefined ? { gte: filters.eiriMin } : {}),
        ...(filters.eiriMax !== undefined ? { lte: filters.eiriMax } : {}),
      };
      mutated = true;
    }

    return mutated ? next : existing;
  }

  private getString(value: unknown): string | undefined {
    if (Array.isArray(value)) {
      return this.getString(value[0]);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  }

  private parseDate(value?: string, endOfDay = false): Date | undefined {
    if (!value) return undefined;
    const parts = value.split(/[\/\-]/);
    if (parts.length !== 3) return undefined;
    const [dayStr, monthStr, yearStr] = parts;
    const day = Number(dayStr);
    const month = Number(monthStr);
    const year = Number(yearStr);
    if (
      Number.isNaN(day) ||
      Number.isNaN(month) ||
      Number.isNaN(year) ||
      day < 1 ||
      day > 31 ||
      month < 1 ||
      month > 12
    ) {
      return undefined;
    }
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    if (endOfDay) {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  }

  private parseNumber(value: unknown): number | undefined {
    if (Array.isArray(value)) {
      return this.parseNumber(value[0]);
    }
    if (typeof value === "number") {
      return Number.isNaN(value) ? undefined : value;
    }
    if (typeof value === "string") {
      if (value.trim().length === 0) return undefined;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private extractEiriRange(
    range?: string
  ): { min?: number; max?: number } {
    if (!range) {
      return {};
    }
    const matches = range.match(/-?\d+(\.\d+)?/g);
    if (!matches || matches.length === 0) {
      return {};
    }
    const numbers = matches
      .map((m) => Number(m))
      .filter((n) => !Number.isNaN(n));
    if (numbers.length === 0) {
      return {};
    }
    if (numbers.length === 1) {
      return { min: numbers[0] };
    }
    return {
      min: Math.min(numbers[0], numbers[1]),
      max: Math.max(numbers[0], numbers[1]),
    };
  }

  private parseStatus(value?: string): EnumProjectStatus | undefined {
    if (!value) return undefined;
    const normalized = value.toLowerCase();
    return Object.values(EnumProjectStatus).find(
      (status) => status === normalized
    );
  }

  private isEmptyFilter(filters: ProjectFilters): boolean {
    return (
      !filters.startDate &&
      !filters.endDate &&
      filters.eiriMin === undefined &&
      filters.eiriMax === undefined &&
      !filters.operator &&
      !filters.status
    );
  }
}

export interface ProjectFilters {
  startDate?: Date;
  endDate?: Date;
  eiriMin?: number;
  eiriMax?: number;
  operator?: string;
  status?: EnumProjectStatus;
}
