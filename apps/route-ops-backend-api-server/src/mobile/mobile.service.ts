import { Injectable, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UserInfo } from "../auth/UserInfo";
import { EnumProjectStatus } from "../project/base/EnumProjectStatus";

@Injectable()
export class MobileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMobileUser(user: UserInfo) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        roles: true,
        cityHallId: true,
      },
    });
    return {
      id: dbUser?.id,
      username: dbUser?.username,
      roles: (dbUser?.roles as string[]) ?? [],
      entityId: dbUser?.cityHallId ?? null,
      features: [],
    };
  }

  async getEntity(id: string) {
    const entity = await this.prisma.cityHall.findUnique({
      where: { id },
      select: { id: true, name: true, description: true },
    });
    return {
      id: entity?.id,
      name: entity?.name,
      description: entity?.description,
      supportedAreaVersion: null,
      features: [],
    };
  }

  async getSupportedArea(entityId: string | undefined, version: string) {
    // Placeholder: return empty GeoJSON FeatureCollection
    return {
      type: "FeatureCollection",
      features: [],
      entityId: entityId ?? null,
      version,
    };
  }

  async startProject(body: any, user: UserInfo) {
    const { lat, lng, date, remarks } = body ?? {};

    // If coordinates are provided, require both and validate numbers
    const latProvided = typeof lat !== "undefined";
    const lngProvided = typeof lng !== "undefined";
    if ((latProvided && !lngProvided) || (!latProvided && lngProvided)) {
      throw new BadRequestException("Both lat and lng must be provided together");
    }
    if (latProvided && lngProvided) {
      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        throw new BadRequestException("lat and lng must be valid numbers");
      }
    }

    // Get user with cityHallId
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { cityHallId: true },
    });

    // Convert date to timestamp (seconds, not milliseconds) for PostgreSQL INT4
    let timestamp: number | null = null;
    if (date) {
      const dateMs = Date.parse(date);
      if (!isNaN(dateMs)) {
        timestamp = Math.floor(dateMs / 1000); // Convert to seconds
      }
    } else {
      timestamp = Math.floor(Date.now() / 1000); // Current time in seconds
    }

    const projectData: any = {
      name: "Mobile Project",
      status: "active",
      createdBy: user.id,
      description: remarks ?? null,
      routePoints: latProvided && lngProvided ? {
        create: [{ latitude: lat, longitude: lng, timestamp }],
      } : undefined,
    };

    // Add cityHallId if user has one
    if (dbUser?.cityHallId) {
      projectData.cityHall = { connect: { id: dbUser.cityHallId } };
    }

    const project = await this.prisma.project.create({
      data: projectData,
      select: { id: true },
    });
    return { projectId: project.id };
  }

  async startExistingProject(projectId: string, body: any, user: UserInfo) {
    const { lat, lng, date, remarks } = body ?? {};

    // If coordinates are provided, require both and validate numbers
    const latProvided = typeof lat !== "undefined";
    const lngProvided = typeof lng !== "undefined";
    if ((latProvided && !lngProvided) || (!latProvided && lngProvided)) {
      throw new BadRequestException("Both lat and lng must be provided together");
    }
    if (latProvided && lngProvided) {
      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        throw new BadRequestException("lat and lng must be valid numbers");
      }
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        status: true,
        assignedUser: true,
        cityHallId: true,
      },
    });

    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Attach entity if missing
    const userRow = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { cityHallId: true },
    });

    // Update project core fields (strongly typed)
    const data: Prisma.ProjectUpdateInput = {
      status: EnumProjectStatus.ACTIVE,
    };
    if (typeof remarks === "string" && remarks.length > 0) {
      data.description = remarks;
    }
    if (!project.assignedUser) {
      data.assignedUser = user.id;
    }
    if (!project.cityHallId && userRow?.cityHallId) {
      data.cityHall = { connect: { id: userRow.cityHallId } };
    }
    await this.prisma.project.update({
      where: { id: projectId },
      data,
    });

    // Add starting route point if provided
    if (latProvided && lngProvided) {
      let timestamp: number | null = null;
      if (date) {
        const dateMs = Date.parse(date);
        if (!isNaN(dateMs)) {
          timestamp = Math.floor(dateMs / 1000);
        }
      } else {
        timestamp = Math.floor(Date.now() / 1000);
      }
      await this.prisma.routePoint.create({
        data: {
          project: { connect: { id: projectId } },
          latitude: lat,
          longitude: lng,
          timestamp,
        },
      });
    }

    return { projectId };
  }
  async endProject(body: any, user: UserInfo) {
    const { projectId, numAttachments, geometry, anomalies } = body ?? {};

    if (!projectId) {
      throw new Error("projectId is required");
    }

    // Verify project exists and belongs to user
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, createdBy: true, status: true },
    });

    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Extract coordinates and bbox directly from incoming geometry; store as-is
    let bbox: [number, number, number, number] | null = null;
    const coords: [number, number][] = [];
    if (geometry?.type === "FeatureCollection") {
      for (const f of geometry.features ?? []) {
        if (f?.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates)) {
          const [lng, lat] = f.geometry.coordinates;
          if (typeof lng === "number" && typeof lat === "number") {
            coords.push([lng, lat]);
            if (!bbox) bbox = [lng, lat, lng, lat];
            bbox = [
              Math.min(bbox[0], lng),
              Math.min(bbox[1], lat),
              Math.max(bbox[2], lng),
              Math.max(bbox[3], lat),
            ];
          }
        } else if (f?.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates)) {
          for (const c of f.geometry.coordinates) {
            if (Array.isArray(c) && c.length >= 2) {
              const [lng, lat] = c;
              if (typeof lng === "number" && typeof lat === "number") {
                coords.push([lng, lat]);
                if (!bbox) bbox = [lng, lat, lng, lat];
                bbox = [
                  Math.min(bbox[0], lng),
                  Math.min(bbox[1], lat),
                  Math.max(bbox[2], lng),
                  Math.max(bbox[3], lat),
                ];
              }
            }
          }
        }
      }
    } else if (geometry?.type === "LineString" && Array.isArray(geometry.coordinates)) {
      for (const c of geometry.coordinates) {
        if (Array.isArray(c) && c.length >= 2) {
          const [lng, lat] = c;
          if (typeof lng === "number" && typeof lat === "number") {
            coords.push([lng, lat]);
            if (!bbox) bbox = [lng, lat, lng, lat];
            bbox = [
              Math.min(bbox[0], lng),
              Math.min(bbox[1], lat),
              Math.max(bbox[2], lng),
              Math.max(bbox[3], lat),
            ];
          }
        }
      }
    }

    // Calculate eIRI average from geometry features or segments
    const eIriValues: number[] = (geometry?.features ?? [])
      .map((f: any) => Number(f?.properties?.eIri))
      .filter((n: any) => Number.isFinite(n));
    const eIriAvg = eIriValues.length
      ? eIriValues.reduce((a, b) => a + b, 0) / eIriValues.length
      : null;

    // Calculate length if coordinates are available
    let lengthMeters: number | null = null;
    if (coords.length > 1) {
      let total = 0;
      for (let i = 1; i < coords.length; i++) {
        const [lng1, lat1] = coords[i - 1];
        const [lng2, lat2] = coords[i];
        const dLat = (lat2 - lat1) * 111000;
        const dLng =
          (lng2 - lng1) * 111000 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
        total += Math.sqrt(dLat * dLat + dLng * dLng);
      }
      lengthMeters = total;
    }

    // Create survey for this project
    const survey = await this.prisma.survey.create({
      data: {
        project: { connect: { id: projectId } },
        name: "Mobile Survey",
        startTime: new Date(),
        endTime: new Date(),
        status: "Completed",
        geometryJson: geometry ?? null,
        bbox: bbox as any,
        eIriAvg: eIriAvg as any,
        lengthMeters: lengthMeters as any,
      },
      select: { id: true },
    });

    // Create hazards for anomalies
    if (Array.isArray(anomalies)) {
      for (const a of anomalies) {
        const lat = Number(a?.lat);
        const lng = Number(a?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          await this.prisma.hazard.create({
            data: {
              project: { connect: { id: projectId } },
              latitude: lat,
              longitude: lng,
              description: a?.remarks ?? null,
              severity: a?.severity ?? null,
              typeField: a?.type ?? null,
              createdBy: user.id,
            },
          });
        }
      }
    }

    // Update project status to completed
    await this.prisma.project.update({ where: { id: projectId }, data: { status: "completed" } });

    return { success: true, surveyId: survey.id };
  }

  async uploadAttachments(body: any) {
    const { projectId, type, files } = body ?? {};
    const uploaded = Array.isArray(files) ? files.length : 0;
    
    // If type is video, save the first video URL to the project
    if (type === "video" && Array.isArray(files) && files.length > 0) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { videoUrl: files[0] },
      });
    }
    
    return { uploaded, remaining: 0, complete: true, projectId, type };
  }

  async getProjectStatus(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, select: { status: true } });
    return {
      status: project?.status ?? null,
      attachmentsProgress: { imagesUploaded: 0, videosUploaded: 0, imagesTotal: 0, videosTotal: 0, complete: true },
    };
  }

  async getScheduledProjects(user: UserInfo) {
    // Scheduled definition (Option A): projects with status="pending" assigned to this user
    const projects = await this.prisma.project.findMany({
      where: {
        status:EnumProjectStatus.PENDING,
        assignedUser: user.id,
      },
      select: {
        id: true,
        description: true,
        createdAt: true,
        scheduledDate: true,


        routePoints: {
          take: 1,
          orderBy: [
            { timestamp: "asc"},
            { createdAt: "asc" },
          ],
          select: {
            latitude: true,
            longitude: true,
            timestamp: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      message: "Scheduled projects retrieved successfully",
      data: projects
    }
  }
}


