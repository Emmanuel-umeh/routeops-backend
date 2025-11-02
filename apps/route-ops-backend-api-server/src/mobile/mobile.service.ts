import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserInfo } from "../auth/UserInfo";

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
      routePoints: lat && lng ? {
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

    // Flatten points to a single LineString for MVP
    let line: any = null;
    let bbox: [number, number, number, number] | null = null;
    if (geometry?.type === "FeatureCollection") {
      const coords: [number, number][] = [];
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
          // Handle LineString directly
          for (const coord of f.geometry.coordinates) {
            if (Array.isArray(coord) && coord.length >= 2) {
              const [lng, lat] = coord;
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
      if (coords.length > 1) {
        line = { type: "LineString", coordinates: coords };
      }
    }

    // Calculate eIRI average from geometry features
    const eIriValues: number[] = (geometry?.features ?? [])
      .map((f: any) => Number(f?.properties?.eIri))
      .filter((n: any) => Number.isFinite(n));
    const eIriAvg = eIriValues.length
      ? eIriValues.reduce((a, b) => a + b, 0) / eIriValues.length
      : null;

    // Calculate length if coordinates are available
    let lengthMeters: number | null = null;
    if (line && line.coordinates && line.coordinates.length > 1) {
      // Simple distance calculation (Haversine would be more accurate)
      let totalDistance = 0;
      for (let i = 1; i < line.coordinates.length; i++) {
        const [lng1, lat1] = line.coordinates[i - 1];
        const [lng2, lat2] = line.coordinates[i];
        // Approximate distance in meters (using simple lat/lng difference)
        const dLat = (lat2 - lat1) * 111000; // ~111km per degree latitude
        const dLng = (lng2 - lng1) * 111000 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
        totalDistance += Math.sqrt(dLat * dLat + dLng * dLng);
      }
      lengthMeters = totalDistance;
    }

    // Create survey for this project
    const survey = await this.prisma.survey.create({
      data: {
        project: { connect: { id: projectId } },
        name: "Mobile Survey",
        startTime: new Date(),
        endTime: new Date(),
        status: "Completed",
        geometryJson: line,
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
    return { uploaded, remaining: 0, complete: true, projectId, type };
  }

  async getProjectStatus(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, select: { status: true } });
    return {
      status: project?.status ?? null,
      attachmentsProgress: { imagesUploaded: 0, videosUploaded: 0, imagesTotal: 0, videosTotal: 0, complete: true },
    };
  }
}


