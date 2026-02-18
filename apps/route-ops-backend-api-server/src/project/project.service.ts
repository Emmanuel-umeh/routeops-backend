import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EnumProjectStatus } from "./base/EnumProjectStatus";
import { ProjectServiceBase } from "./base/project.service.base";
import { CreateProjectDto, RoutePointDto } from "./dto/CreateProjectDto";
import { Project } from "./base/Project";
import {
  getString,
  parseDate,
  parseNumber,
  extractEiriRange,
  parseStatus,
} from "../util/filter.util";
import { Prisma, Project as PrismaProject } from "@prisma/client";

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
        status: EnumProjectStatus.PENDING,
        assignedUser: data.assignedUserId,
        createdBy: data.createdBy,
        createdFromWeb: data.createdFromWeb ?? false,
        videoUrl: data.videoUrl,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
        cityHall: data.cityHallId ? { connect: { id: data.cityHallId } } : undefined,
        routePoints: routePointIds.length > 0 ? { connect: routePointIds.map(id => ({ id })) } : undefined,
        hazards: data.hazardIds && data.hazardIds.length > 0 ? { connect: data.hazardIds.map(id => ({ id })) } : undefined,
        surveys: data.surveyIds && data.surveyIds.length > 0 ? { connect: data.surveyIds.map(id => ({ id })) } : undefined,
      },
    });

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

  private extractFilters(
    raw: Partial<Record<string, unknown>>
  ): ProjectFilters {
    const startDate = parseDate(getString(raw.startDate));
    const endDate = parseDate(getString(raw.endDate), true);

    const range = extractEiriRange(getString(raw.eiriRange));
    const eiriMin = parseNumber(raw.eiriMin) ?? range.min;
    const eiriMax = parseNumber(raw.eiriMax) ?? range.max;

    return {
      startDate,
      endDate,
      eiriMin,
      eiriMax,
      operator: getString(raw.operator) ?? getString(raw.operatorId),
      status: parseStatus(getString(raw.status)),
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

  /**
   * Delete project with cascade deletion of related records.
   * Additionally, remove its RoadRatingHistory entries and recalculate
   * RoadRating for all affected (entityId, roadId, segmentId) pairs so
   * road ratings reflect only remaining surveys after project deletion.
   */
  async deleteProject(args: Prisma.ProjectDeleteArgs): Promise<PrismaProject> {
    const projectId = typeof args.where.id === 'string' ? args.where.id : 
                      (args.where as any).id;

    return await this.prisma.$transaction(async (tx) => {
      // Load project to get entity (cityHallId) for rating recalculation
      const existing = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          cityHallId: true,
        },
      });

      const entityId = existing?.cityHallId ?? null;

      // Preload RoadRatingHistory rows so we know which ratings are affected
      const historyRows =
        entityId != null
          ? await tx.roadRatingHistory.findMany({
              where: {
                projectId,
                entityId,
              },
              select: {
                roadId: true,
                segmentId: true,
              },
            })
          : [];

      // Delete all related records using direct where clauses (more efficient than fetching IDs first)
      // Run independent operations in parallel where possible
      
      // 1. Delete remarks associated with surveys (using projectId through survey relation)
      // 2. Delete remarks associated with hazards (using projectId through hazard relation)
      // 3. Delete videoMetadata for this project
      // 4. Delete roadRatingHistory for this project
      // These can run in parallel as they don't depend on each other
      await Promise.all([
        // Delete remarks for surveys in this project
        tx.remark.deleteMany({
          where: {
            survey: {
              projectId: projectId,
            },
          },
        }),
        // Delete remarks for hazards in this project
        tx.remark.deleteMany({
          where: {
            hazard: {
              projectId: projectId,
            },
          },
        }),
        // Delete videoMetadata for this project
        tx.videoMetadata.deleteMany({
          where: { projectId },
        }),
        // Delete roadRatingHistory for this project
        tx.roadRatingHistory.deleteMany({
          where: { projectId },
        }),
      ]);

      // 5. Delete surveys (must be after remarks)
      // 6. Delete hazards (must be after remarks)
      // 7. Delete routePoints
      // These can run in parallel as they don't depend on each other
      await Promise.all([
        tx.survey.deleteMany({
          where: { projectId },
        }),
        tx.hazard.deleteMany({
          where: { projectId },
        }),
        tx.routePoint.deleteMany({
          where: { projectId },
        }),
      ]);

      // 8. Finally, delete the project
      const deleted = await tx.project.delete({
        ...args,
      });

      // If we have no entity or no history rows, nothing to recalculate
      if (!entityId || historyRows.length === 0) {
        return deleted;
      }

      // Recalculate ratings for each affected (roadId, segmentId)
      const affectedKeys = new Set<string>();
      for (const row of historyRows) {
        const key = `${row.roadId}__${row.segmentId ?? "null"}`;
        affectedKeys.add(key);
      }

      for (const key of affectedKeys) {
        const [roadId, segmentToken] = key.split("__");
        const segmentId = segmentToken === "null" ? null : segmentToken;

        const remainingHistory = await tx.roadRatingHistory.findMany({
          where: {
            entityId,
            roadId,
            segmentId,
          },
          select: {
            eiri: true,
          },
        });

        if (remainingHistory.length === 0) {
          // No more history for this segment: remove the current rating
          await tx.roadRating.deleteMany({
            where: {
              entityId,
              roadId,
              segmentId,
            },
          });
          continue;
        }

        const overallAvgEiri =
          remainingHistory.reduce((sum, r) => sum + r.eiri, 0) /
          remainingHistory.length;

        await tx.roadRating.updateMany({
          where: {
            entityId,
            roadId,
            segmentId,
          },
          data: {
            eiri: overallAvgEiri,
          },
        });
      }

      return deleted;
    }, {
      maxWait: 10000, // Maximum time to wait for a transaction slot (10 seconds)
      timeout: 30000, // Maximum time the transaction can run (30 seconds)
    });
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
