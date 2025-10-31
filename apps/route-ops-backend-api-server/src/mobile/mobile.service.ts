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
    const project = await this.prisma.project.create({
      data: {
        name: "Mobile Project",
        status: "active", // Started
        createdBy: user.id,
        description: remarks ?? null,
        routePoints: {
          create: lat && lng ? [{ latitude: lat, longitude: lng, timestamp: Date.parse(date) || null }] : [],
        },
      },
      select: { id: true },
    });
    return { projectId: project.id };
  }

  async endProject(body: any, user: UserInfo) {
    const { projectId, numAttachments, geometry, anomalies } = body ?? {};

    // Flatten points to a single LineString for MVP
    let line: any = null;
    let bbox: [number, number, number, number] | null = null;
    if (geometry?.type === "FeatureCollection") {
      const coords: [number, number][] = [];
      for (const f of geometry.features ?? []) {
        const [lng, lat] = f?.geometry?.coordinates ?? [];
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
      if (coords.length > 1) {
        line = { type: "LineString", coordinates: coords };
      }
    }

    const eIriValues: number[] = (geometry?.features ?? [])
      .map((f: any) => Number(f?.properties?.eIri))
      .filter((n: any) => Number.isFinite(n));
    const eIriAvg = eIriValues.length
      ? eIriValues.reduce((a, b) => a + b, 0) / eIriValues.length
      : null;

    // Create or update a survey for this project
    const survey = await this.prisma.survey.create({
      data: {
        project: { connect: { id: projectId } },
        startTime: new Date(),
        endTime: new Date(),
        status: "Completed",
        geometryJson: line,
        bbox: bbox as any,
        eIriAvg: eIriAvg as any,
      },
      select: { id: true },
    });

    // Create hazards for anomalies
    if (Array.isArray(anomalies)) {
      for (const a of anomalies) {
        const lat = Number(a?.lat);
        const lng = Number(a?.lng);
        await this.prisma.hazard.create({
          data: {
            project: { connect: { id: projectId } },
            latitude: Number.isFinite(lat) ? lat : null,
            longitude: Number.isFinite(lng) ? lng : null,
            description: a?.remarks ?? null,
            severity: a?.severity ?? null,
            createdBy: user.id,
          },
        });
      }
    }

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


