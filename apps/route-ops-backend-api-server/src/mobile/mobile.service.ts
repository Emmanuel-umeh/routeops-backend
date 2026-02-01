import { Injectable, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UserInfo } from "../auth/UserInfo";
import { EnumProjectStatus } from "../project/base/EnumProjectStatus";
import {StartProjectDto} from "./dto/StartProjectDto";
import { RoadsService } from "../roads/roads.service";
import * as turf from "@turf/turf";
import {
  splitEdgeIntoSegments,
  findSegmentsForPoint,
  SEGMENT_LENGTH_METERS,
} from "../util/edgeSegmentation.util";

@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roadsService: RoadsService
  ) {}

  async getMobileUser(user: UserInfo) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        roles: true,
        cityHallId: true,
        firstName: true,
        lastName: true,
        email:true
      },
    });
    return {
      id: dbUser?.id,
      username: dbUser?.username,
      roles: (dbUser?.roles as string[]) ?? [],
      entityId: dbUser?.cityHallId ?? null,
      features: [],
      firstName: dbUser?.firstName ?? null,
      lastName: dbUser?.lastName ?? null,
      email: dbUser?.email ?? null,
    };
  }

  async getEntity(id: string) {
    const entity = await this.prisma.cityHall.findUnique({
      where: { id },
      // Cast to any so we can select newly added fields without fighting generated types
      select: {
        id: true,
        name: true,
        description: true,
        allowVideo: true,
        allowImages: true,
        defaultLatitude: true,
        defaultLongitude: true,
        gisFileUrl: true,
        gisFileVersion: true,
      } as any,
    });

    if (!entity) {
      return null;
    }

    const e: any = entity;

    return {
      id: entity.id,
      name: entity.name ?? "",
      description: entity.description ?? "",
      gisFile: e.gisFileUrl
        ? {
            version: e.gisFileVersion ?? "1.0",
            url: e.gisFileUrl,
          }
        : null,
      defaultLocation: {
        latitude: e.defaultLatitude ?? 0,
        longitude: e.defaultLongitude ?? 0,
      },
      allowVideo: entity.allowVideo,
      allowImages: entity.allowImages,
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

  async startProject(body: StartProjectDto, user: UserInfo) {
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
    let startDate: Date | null = null;
    if (date) {
      const dateMs = Date.parse(date);
      if (!isNaN(dateMs)) {
        timestamp = Math.floor(dateMs / 1000); // Convert to seconds
        startDate = new Date(dateMs);
      }
    } else {
      timestamp = Math.floor(Date.now() / 1000); // Current time in seconds
      startDate = new Date();
    }

    const projectData: any = {
      name: body.name ?? "Mobile Project",
      status: "active",
      createdBy: user.id,
      description: remarks ?? null,
      startDate: startDate,
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

    // Parse start date if provided
    let startDate: Date | null = null;
    if (date) {
      const dateMs = Date.parse(date);
      if (!isNaN(dateMs)) {
        startDate = new Date(dateMs);
      }
    } else {
      startDate = new Date();
    }

    // Update project core fields
    const data: Prisma.ProjectUpdateInput = {
      status: EnumProjectStatus.ACTIVE,
      ...(startDate && { startDate }),
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
    const { projectId, numAttachments, geometry, anomalies, startDate, endDate } = body ?? {};

    if (!projectId) {
      throw new Error("projectId is required");
    }

    // Verify project exists and belongs to user
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, createdBy: true, status: true, cityHallId: true },
    });

    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Get user's entityId (cityHallId)
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { cityHallId: true },
    });
    const entityId = project.cityHallId ?? dbUser?.cityHallId ?? null;

    if (!entityId) {
      throw new Error("Cannot save road ratings: project and user have no entityId (cityHallId)");
    }

    // Extract coordinates and bbox directly from incoming geometry; store as-is
    // Also collect all distinct edgeIds seen in geometry properties for analytics
    let bbox: [number, number, number, number] | null = null;
    const coords: [number, number][] = [];
    const edgeIdSet = new Set<string>();
    if (geometry?.type === "FeatureCollection") {
      for (const f of geometry.features ?? []) {
        const featureEdgeId =
          (f as any)?.properties?.edgeId ??
          (f as any)?.properties?.edge_id ??
          (f as any)?.properties?.roadId ??
          (f as any)?.properties?.road_id;
        if (typeof featureEdgeId === "string" && featureEdgeId.trim().length > 0) {
          edgeIdSet.add(featureEdgeId);
        }

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

    // Parse start and end dates if provided (for offline sync support)
    // Mobile should send ISO 8601 format: "2026-01-07T15:52:21Z" (UTC) or "2026-01-07T15:52:21+01:00" (with colon)
    let surveyStartTime: Date = new Date();
    let surveyEndTime: Date = new Date();

    if (startDate) {
      const startDateMs = Date.parse(startDate);
      if (!isNaN(startDateMs)) {
        surveyStartTime = new Date(startDateMs);
      }
    }

    if (endDate) {
      const endDateMs = Date.parse(endDate);
      if (!isNaN(endDateMs)) {
        surveyEndTime = new Date(endDateMs);
      }
    }

    // Create survey for this project, including all distinct edgeIds traversed
    const traversedEdgeIds = Array.from(edgeIdSet);
    const survey = await this.prisma.survey.create({
      data: {
        project: { connect: { id: projectId } },
        name: "Mobile Survey",
        startTime: surveyStartTime,
        endTime: surveyEndTime,
        status: "Completed",
        geometryJson: geometry ?? null,
        bbox: bbox as any,
        eIriAvg: eIriAvg as any,
        lengthMeters: lengthMeters as any,
        edgeIds: traversedEdgeIds,
      } as any,
      select: { id: true },
    });

    // Create hazards for anomalies and count them per edgeId
    const anomaliesCountByEdgeId = new Map<string, number>();
    if (Array.isArray(anomalies)) {
      for (const a of anomalies) {
        const lat = Number(a?.lat);
        const lng = Number(a?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const anomalyEdgeId =
            (a as any)?.edgeId ??
            (a as any)?.edge_id ??
            (a as any)?.roadId ??
            (a as any)?.road_id ??
            null;
          
          if (anomalyEdgeId) {
            anomaliesCountByEdgeId.set(
              anomalyEdgeId,
              (anomaliesCountByEdgeId.get(anomalyEdgeId) || 0) + 1
            );
          }

          // Optional createdAt from frontend (e.g. when uploading hours/days later)
          const createdAtRaw =
            (a as any)?.createdAt ?? (a as any)?.created_at ?? null;
          const createdAt =
            createdAtRaw && typeof createdAtRaw === "string"
              ? new Date(createdAtRaw)
              : undefined;
          const useCreatedAt =
            createdAt !== undefined && !Number.isNaN(createdAt.getTime());

          await this.prisma.hazard.create({
            data: {
              project: { connect: { id: projectId } },
              latitude: lat,
              longitude: lng,
              name: a?.name ?? null,
              description: a?.remarks ?? null,
              severity: a?.severity ?? null,
              typeField: a?.type ?? null,
              createdBy: user.id,
              externalId: (a as any)?.mobileId ?? (a as any)?.id ?? undefined,
              edgeId: anomalyEdgeId,
              ...(useCreatedAt ? { createdAt } : {}),
            } as any,
          });
        }
      }
    }

    // Process road ratings with segmentation: save history and update current ratings
    // Group features by edgeId and collect eIri values with their coordinates
    const edgeIdRatings = new Map<string, Array<{ eIri: number; coord?: [number, number] }>>(); // roadId -> [{eIri, coord}]
    
    if (geometry?.type === "FeatureCollection") {
      for (const f of geometry.features ?? []) {
        const featureEdgeId =
          (f as any)?.properties?.edgeId ??
          (f as any)?.properties?.edge_id ??
          (f as any)?.properties?.roadId ??
          (f as any)?.properties?.road_id;
        const eIri = Number((f as any)?.properties?.eIri ?? (f as any)?.properties?.eiri);
        
        // Extract coordinate from feature geometry
        let coord: [number, number] | undefined;
        if (f?.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates)) {
          const [lng, lat] = f.geometry.coordinates;
          if (typeof lng === "number" && typeof lat === "number") {
            coord = [lng, lat];
          }
        }
        
        if (
          typeof featureEdgeId === "string" &&
          featureEdgeId.trim().length > 0 &&
          Number.isFinite(eIri) &&
          eIri >= 0
        ) {
          if (!edgeIdRatings.has(featureEdgeId)) {
            edgeIdRatings.set(featureEdgeId, []);
          }
          edgeIdRatings.get(featureEdgeId)!.push({ eIri, coord });
        }
      }
    }

    // Get edge geometries for segmentation
    const edgeIdsForSegmentation = Array.from(edgeIdRatings.keys());
    const edgeGeometries = edgeIdsForSegmentation.length > 0 
      ? await this.roadsService.getGeometriesByRoadIds(edgeIdsForSegmentation)
      : new Map<string, any>();

    // Process ratings with segmentation: group by segment instead of entire edge
    const segmentRatings = new Map<string, number[]>(); // segmentId -> [eIri values]
    const segmentToEdgeId = new Map<string, string>(); // segmentId -> edgeId
    
    for (const [edgeId, ratings] of edgeIdRatings.entries()) {
      const edgeGeometry = edgeGeometries.get(edgeId);
      
      if (!edgeGeometry) {
        // Fallback: if geometry not found, rate entire edge (backward compatibility)
        const avgEiri = ratings.reduce((sum, r) => sum + r.eIri, 0) / ratings.length;
        const segmentKey = `${edgeId}_null`; // null segmentId = entire edge
        if (!segmentRatings.has(segmentKey)) {
          segmentRatings.set(segmentKey, []);
          segmentToEdgeId.set(segmentKey, edgeId);
        }
        segmentRatings.get(segmentKey)!.push(avgEiri);
        continue;
      }

      // Split edge into segments
      let segments;
      try {
        const lineString = edgeGeometry.type === "LineString" 
          ? edgeGeometry 
          : edgeGeometry.type === "Feature" 
            ? edgeGeometry.geometry 
            : null;
        
        if (!lineString || !lineString.coordinates || lineString.coordinates.length < 2) {
          // Invalid geometry, fallback to entire edge
          const avgEiri = ratings.reduce((sum, r) => sum + r.eIri, 0) / ratings.length;
          const segmentKey = `${edgeId}_null`;
          if (!segmentRatings.has(segmentKey)) {
            segmentRatings.set(segmentKey, []);
            segmentToEdgeId.set(segmentKey, edgeId);
          }
          segmentRatings.get(segmentKey)!.push(avgEiri);
          continue;
        }

        segments = splitEdgeIntoSegments(edgeId, lineString);
      } catch (e) {
        // Error splitting, fallback to entire edge
        const avgEiri = ratings.reduce((sum, r) => sum + r.eIri, 0) / ratings.length;
        const segmentKey = `${edgeId}_null`;
        if (!segmentRatings.has(segmentKey)) {
          segmentRatings.set(segmentKey, []);
          segmentToEdgeId.set(segmentKey, edgeId);
        }
        segmentRatings.get(segmentKey)!.push(avgEiri);
        continue;
      }

      if (segments.length === 0) {
        // No segments, fallback to entire edge
        const avgEiri = ratings.reduce((sum, r) => sum + r.eIri, 0) / ratings.length;
        const segmentKey = `${edgeId}_null`;
        if (!segmentRatings.has(segmentKey)) {
          segmentRatings.set(segmentKey, []);
          segmentToEdgeId.set(segmentKey, edgeId);
        }
        segmentRatings.get(segmentKey)!.push(avgEiri);
        continue;
      }

      // Map each rating to its segment(s) based on coordinate
      const ratingsBySegment = new Map<number, number[]>(); // segmentIndex -> [eIri values]
      
      for (const rating of ratings) {
        if (rating.coord) {
          // Find which segment(s) this coordinate belongs to
          const segmentIndices = findSegmentsForPoint(rating.coord, segments, SEGMENT_LENGTH_METERS / 2);
          
          if (segmentIndices.length > 0) {
            // Add rating to matching segments
            for (const segIdx of segmentIndices) {
              if (!ratingsBySegment.has(segIdx)) {
                ratingsBySegment.set(segIdx, []);
              }
              ratingsBySegment.get(segIdx)!.push(rating.eIri);
            }
          } else {
            // No segment found, assign to nearest segment
            let nearestSegIdx = 0;
            let minDist = Infinity;
            for (let i = 0; i < segments.length; i++) {
              try {
                const point = turf.point(rating.coord);
                const nearest = turf.nearestPointOnLine(segments[i].geometry, point, { units: "meters" });
                const dist = nearest.properties?.dist ?? turf.distance(point, nearest, { units: "meters" });
                if (dist < minDist) {
                  minDist = dist;
                  nearestSegIdx = i;
                }
              } catch (e) {
                continue;
              }
            }
            if (!ratingsBySegment.has(nearestSegIdx)) {
              ratingsBySegment.set(nearestSegIdx, []);
            }
            ratingsBySegment.get(nearestSegIdx)!.push(rating.eIri);
          }
        } else {
          // No coordinate, distribute evenly across all segments (fallback)
          const avgEiri = rating.eIri;
          for (let i = 0; i < segments.length; i++) {
            if (!ratingsBySegment.has(i)) {
              ratingsBySegment.set(i, []);
            }
            ratingsBySegment.get(i)!.push(avgEiri);
          }
        }
      }

      // Aggregate ratings by segment
      for (const [segIdx, eIriValues] of ratingsBySegment.entries()) {
        const segment = segments[segIdx];
        if (!segment) continue;
        
        const segmentId = segment.segmentId;
        if (!segmentRatings.has(segmentId)) {
          segmentRatings.set(segmentId, []);
          segmentToEdgeId.set(segmentId, edgeId);
        }
        segmentRatings.get(segmentId)!.push(...eIriValues);
      }
    }

    // Save to RoadRatingHistory and update RoadRating for each segment
    for (const [segmentId, eIriValues] of segmentRatings.entries()) {
      const edgeId = segmentToEdgeId.get(segmentId) || segmentId.split("_seg_")[0];
      const avgEiri = eIriValues.reduce((a, b) => a + b, 0) / eIriValues.length;
      
      // Parse segmentId: if it ends with "_null", it's the entire edge (backward compatibility)
      const isEntireEdge = segmentId.endsWith("_null");
      const finalSegmentId = isEntireEdge ? null : segmentId;
      const finalRoadId = edgeId; // Always use original edgeId as roadId
      
      // Get anomalies count for this edgeId - only count hazards with imageUrl
      // Query the database to get accurate count of hazards with imageUrl
      const anomaliesCount = await this.prisma.hazard.count({
        where: {
          edgeId: edgeId,
          projectId: projectId,
          imageUrl: { not: null },
        },
      });
      
      // Save to history with segmentId (using 'as any' until migration is applied)
      await this.prisma.roadRatingHistory.create({
        data: {
          entityId,
          roadId: finalRoadId,
          segmentId: finalSegmentId,
          eiri: avgEiri,
          userId: user.id,
          surveyId: survey.id,
          projectId: projectId,
          anomaliesCount: anomaliesCount > 0 ? anomaliesCount : null,
        } as any,
      });

      // Update or create RoadRating (aggregate all ratings for this roadId+segmentId)
      // Get all historical ratings for this roadId+segmentId to calculate overall average
      const allRatings = await this.prisma.roadRatingHistory.findMany({
        where: {
          entityId,
          roadId: finalRoadId,
          segmentId: finalSegmentId,
        } as any,
        select: { eiri: true },
      });

      const overallAvgEiri =
        allRatings.length > 0
          ? allRatings.reduce((sum: number, r: { eiri: number }) => sum + r.eiri, 0) / allRatings.length
          : avgEiri;

      // Upsert RoadRating with segmentId (using 'as any' until migration is applied)
      await this.prisma.roadRating.upsert({
        where: {
          entityId_roadId_segmentId: {
            entityId,
            roadId: finalRoadId,
            segmentId: finalSegmentId,
          },
        } as any,
        create: {
          entityId,
          roadId: finalRoadId,
          segmentId: finalSegmentId,
          eiri: overallAvgEiri,
        } as any,
        update: {
          eiri: overallAvgEiri,
        },
      });
    }

    // Update project status to completed
    await this.prisma.project.update({ where: { id: projectId }, data: { status: "completed" } });

    return { success: true, surveyId: survey.id };
  }

  async uploadAttachments(body: any) {
    const { projectId, type, files, videoMetadata } = body ?? {};
    const uploaded = Array.isArray(files) ? files.length : 0;

    // If type is video, save the first video URL to the project
    if (type === "video" && Array.isArray(files) && files.length > 0) {
      // Update project with video URL
      await this.prisma.project.update({
        where: { id: projectId },
        data: { videoUrl: files[0] },
      });

      // Save video metadata if provided
      if (Array.isArray(videoMetadata) && videoMetadata.length > 0) {
        // Delete existing video metadata for this project (to allow updates)
        await this.prisma.videoMetadata.deleteMany({
          where: { projectId },
        });

        // Create new video metadata entries
        await this.prisma.videoMetadata.createMany({
          data: videoMetadata.map((meta: { videoTime: number; lat: number; lng: number }) => ({
            projectId,
            videoTime: meta.videoTime,
            lat: meta.lat,
            lng: meta.lng,
          })),
        });
      }
    }

    return { uploaded, remaining: 0, complete: true, projectId, type };
  }

  async updateAnomalyAttachments(externalId: string, files: string[]) {
    if (!externalId || !Array.isArray(files) || files.length === 0) {
      throw new Error("externalId and files array are required");
    }

    // Find hazard by externalId
    const hazard = await this.prisma.hazard.findFirst({
      where: { externalId },
    });

    if (!hazard) {
      throw new Error(`Hazard with externalId "${externalId}" not found`);
    }

    // Update imageUrl with the first file (or join multiple files if needed)
    const imageUrl = files[0];

    await this.prisma.hazard.update({
      where: { id: hazard.id },
      data: { imageUrl },
    });

    // Recalculate RoadRatingHistory.anomaliesCount for this project+edge so edge analytics shows correct count
    if (hazard.projectId && hazard.edgeId) {
      const count = await this.prisma.hazard.count({
        where: {
          projectId: hazard.projectId,
          edgeId: hazard.edgeId,
          imageUrl: { not: null },
        },
      });
      await this.prisma.roadRatingHistory.updateMany({
        where: {
          projectId: hazard.projectId,
          roadId: hazard.edgeId,
        },
        data: { anomaliesCount: count > 0 ? count : null },
      });
    }

    return {
      success: true,
      hazardId: hazard.id,
      externalId,
      imageUrl,
    };
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
        name: true,
        createdAt: true,
        scheduledDate: true,
        assignedUser: true,


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


