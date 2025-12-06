import { Controller, Get, Query, Post, Body, BadRequestException, UseGuards } from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { RoadsService, NearestEdgeResponse } from "./roads.service";
import { PrismaService } from "../prisma/prisma.service";
import { DefaultAuthGuard } from "../auth/defaultAuth.guard";
import { UserData } from "../auth/userData.decorator";
import { UserInfo } from "../auth/UserInfo";
import {
  getString,
  parseDate,
  parseNumber,
  extractEiriRange,
  parseStatus,
} from "../util/filter.util";
import { EnumProjectStatus } from "../project/base/EnumProjectStatus";
import * as turf from "@turf/turf";

@swagger.ApiTags("roads")
@Controller("roads")
export class RoadsController {
  constructor(
    private readonly roadsService: RoadsService,
    private readonly prisma: PrismaService
  ) {}

  @Get("nearest-edge")
  @swagger.ApiOperation({
    summary: "Find nearest road edge in GeoPackage to a click location",
    description:
      "Given a lat/lng and optional radius (meters), returns the nearest road edge (if any) from the GeoPackage.",
  })
  @swagger.ApiQuery({
    name: "lat",
    required: true,
    type: Number,
    description: "Latitude in WGS84",
    example: 38.703202,
  })
  @swagger.ApiQuery({
    name: "lng",
    required: true,
    type: Number,
    description: "Longitude in WGS84",
    example: -9.304298,
  })
  @swagger.ApiQuery({
    name: "radiusMeters",
    required: false,
    type: Number,
    description: "Search radius in meters (default 200)",
    example: 200,
  })
  @swagger.ApiOkResponse({
    description: "Nearest road edge to the given point. Returns edgeId and GeoJSON Feature for direct Google Maps consumption.",
    schema: {
      type: "object",
      properties: {
        edgeId: { 
          type: "string", 
          nullable: true,
          description: "The edge ID (osm_id) to use for analytics queries",
          example: "15143590"
        },
        json: {
          type: "object",
          nullable: true,
          description: "GeoJSON Feature that can be directly loaded into Google Maps",
          properties: {
            type: { type: "string", example: "Feature" },
            properties: {
              type: "object",
              properties: {
                edgeId: { type: "string", nullable: true },
                distanceMeters: { type: "number", nullable: true },
                roadName: { type: "string", nullable: true },
                projectId: { type: "string", nullable: true },
              },
            },
            geometry: {
              type: "object",
              properties: {
                type: { type: "string", example: "LineString" },
                coordinates: {
                  type: "array",
                  items: {
                    type: "array",
                    items: { type: "number" },
                  },
                },
              },
              nullable: true,
            },
          },
        },
      },
    },
  })
  async getNearestEdge(
    @Query("lat") latRaw: string,
    @Query("lng") lngRaw: string,
    @Query("radiusMeters") radiusRaw?: string
  ): Promise<NearestEdgeResponse> {
    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    const radius =
      typeof radiusRaw === "string" && radiusRaw.length > 0
        ? parseFloat(radiusRaw)
        : 200;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new BadRequestException("Query parameters 'lat' and 'lng' are required and must be numbers.");
    }

    const result = await this.roadsService.findNearestEdge(lat, lng, radius);

    if (!result || !result.edgeId) {
      return {
        edgeId: null,
        json: null,
      };
    }

    // Convert to GeoJSON Feature format
    const geoJsonFeature = this.roadsService.toGeoJsonFeature(result);
    
    return {
      edgeId: result.edgeId,
      json: geoJsonFeature,
    };
  }

  @Get("ratings")
  @UseGuards(DefaultAuthGuard)
  @swagger.ApiOperation({
    summary: "Get all road ratings for the user's entity",
    description: "Returns all road ratings (edgeId + eiri) for the authenticated user's entity. Used by tile provider to draw rated roads on the map.",
  })
  @swagger.ApiOkResponse({
    description: "Array of road ratings with roadId and eiri",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          roadId: { type: "string" },
          eiri: { type: "number" },
        },
      },
    },
  })
  async getRoadRatings(@UserData() userInfo?: UserInfo) {
    if (!userInfo?.id) {
      throw new BadRequestException("Authentication required");
    }

    // Get user's entityId (cityHallId)
    const user = await this.prisma.user.findUnique({
      where: { id: userInfo.id },
      select: { cityHallId: true },
    });

    if (!user?.cityHallId) {
      return [];
    }

    const ratings = await this.prisma.roadRating.findMany({
      where: { entityId: user.cityHallId },
      select: {
        roadId: true,
        eiri: true,
      },
    });

    if (ratings.length === 0) {
      return [];
    }

    const roadIds = ratings.map((r) => r.roadId);

    // Filter out roadIds that don't have at least 3 entries in RoadRatingHistory
    const historyCounts = await this.prisma.roadRatingHistory.groupBy({
      by: ["roadId"],
      where: {
        entityId: user.cityHallId,
        roadId: { in: roadIds },
      },
      _count: {
        roadId: true,
      },
    });

    const roadIdsWithMinEntries = new Set<string>();
    for (const count of historyCounts) {
      if (count._count.roadId >= 3) {
        roadIdsWithMinEntries.add(count.roadId);
      }
    }

    // Return only ratings for roadIds with at least 3 history entries
    return ratings.filter((r) => roadIdsWithMinEntries.has(r.roadId));
  }

  @Post("geometries")
  @UseGuards(DefaultAuthGuard)
  @swagger.ApiOperation({
    summary: "Get geometries for specific roadIds",
    description: "Returns GeoJSON geometries for the given roadIds (edgeIds) from GeoPackage files. Used by frontend to draw road lines on the map.",
  })
  @swagger.ApiBody({
    schema: {
      type: "object",
      properties: {
        roadIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of roadIds (edgeIds) to get geometries for",
        },
      },
      required: ["roadIds"],
    },
  })
  @swagger.ApiOkResponse({
    description: "Map of roadId -> GeoJSON geometry",
    schema: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          type: { type: "string", example: "LineString" },
          coordinates: {
            type: "array",
            items: {
              type: "array",
              items: { type: "number" },
            },
          },
        },
      },
    },
  })
  async getGeometries(@Body() body: { roadIds: string[] }) {
    const { roadIds } = body ?? {};
    
    if (!Array.isArray(roadIds) || roadIds.length === 0) {
      throw new BadRequestException("roadIds array is required and must not be empty");
    }

    const geometries = await this.roadsService.getGeometriesByRoadIds(roadIds);
    
    // Convert Map to plain object for JSON response
    const result: Record<string, any> = {};
    for (const [roadId, geometry] of geometries.entries()) {
      result[roadId] = geometry;
    }

    return result;
  }

  @Get("map")
  @UseGuards(DefaultAuthGuard)
  @swagger.ApiOperation({
    summary: "Get road ratings for map within bbox and filters",
    description: "Returns road ratings with geometries filtered by bbox, time window, eIRI range, operator, and status. Similar to /api/surveys/map but for road ratings.",
  })
  @swagger.ApiQuery({ name: "bbox", required: true, description: "minLng,minLat,maxLng,maxLat" })
  @swagger.ApiQuery({ name: "months", required: false, description: "Lookback window in months (default 6)" })
  @swagger.ApiQuery({ name: "startDate", required: false, description: "Start date filter (DD/MM/YYYY)" })
  @swagger.ApiQuery({ name: "endDate", required: false, description: "End date filter (DD/MM/YYYY)" })
  @swagger.ApiQuery({ name: "eiriMin", required: false, description: "Minimum eIRI value" })
  @swagger.ApiQuery({ name: "eiriMax", required: false, description: "Maximum eIRI value" })
  @swagger.ApiQuery({ name: "eiriRange", required: false, description: "eIRI range (e.g., '0-1.5')" })
  @swagger.ApiQuery({ name: "operator", required: false, description: "Filter by operator (project creator)" })
  @swagger.ApiQuery({ name: "operatorId", required: false, description: "Filter by operator ID (project creator)" })
  @swagger.ApiQuery({ name: "status", required: false, description: "Filter by project status" })
  @swagger.ApiOkResponse({ description: "Array of road ratings with geometries for map" })
  async getRoadRatingsForMap(
    @UserData() userInfo?: UserInfo,
    @Query("bbox") bbox?: string,
    @Query("months") months?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("eiriMin") eiriMin?: string,
    @Query("eiriMax") eiriMax?: string,
    @Query("eiriRange") eiriRange?: string,
    @Query("operator") operator?: string,
    @Query("operatorId") operatorId?: string,
    @Query("status") status?: string
  ) {
    if (!userInfo?.id) {
      throw new BadRequestException("Authentication required");
    }

    // Get user's entityId (cityHallId)
    const user = await this.prisma.user.findUnique({
      where: { id: userInfo.id },
      select: { cityHallId: true },
    });

    if (!user?.cityHallId) {
      return [];
    }

    const entityId = user.cityHallId;

    // Parse bbox
    const parts = (bbox ?? "").split(",").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return [];
    }
    const minLng = Math.min(parts[0], parts[2]);
    const maxLng = Math.max(parts[0], parts[2]);
    const minLat = Math.min(parts[1], parts[3]);
    const maxLat = Math.max(parts[1], parts[3]);

    // Parse all filters
    const parsedStartDate = parseDate(startDate);
    const parsedEndDate = parseDate(endDate, true);
    const range = extractEiriRange(eiriRange);
    const parsedEiriMin = parseNumber(eiriMin) ?? range.min;
    const parsedEiriMax = parseNumber(eiriMax) ?? range.max;
    const parsedOperator = getString(operator) ?? getString(operatorId);
    const parsedStatus = parseStatus(status);

    // Build where clause for RoadRating
    const ratingWhere: any = {
      entityId,
    };

    // eIRI filters
    if (parsedEiriMin !== undefined || parsedEiriMax !== undefined) {
      ratingWhere.eiri = {};
      if (parsedEiriMin !== undefined) {
        ratingWhere.eiri.gte = parsedEiriMin;
      }
      if (parsedEiriMax !== undefined) {
        ratingWhere.eiri.lte = parsedEiriMax;
      }
    }

    // Get all road ratings matching eIRI filter
    const allRatings = await this.prisma.roadRating.findMany({
      where: ratingWhere,
      select: {
        roadId: true,
        eiri: true,
      },
    });

    if (allRatings.length === 0) {
      return [];
    }

    const roadIds = allRatings.map((r) => r.roadId);
    const ratingByRoadId = new Map(allRatings.map((r) => [r.roadId, r.eiri]));

    // Filter out roadIds that don't have at least 3 entries in RoadRatingHistory
    // This removes ghost/erroneous road IDs that weren't actually surveyed
    const historyCounts = await this.prisma.roadRatingHistory.groupBy({
      by: ["roadId"],
      where: {
        entityId,
        roadId: { in: roadIds },
      },
      _count: {
        roadId: true,
      },
    });

    const roadIdsWithMinEntries = new Set<string>();
    for (const count of historyCounts) {
      if (count._count.roadId >= 3) {
        roadIdsWithMinEntries.add(count.roadId);
      }
    }

    // Filter roadIds to only include those with at least 3 history entries
    const validRoadIds = roadIds.filter((rid) => roadIdsWithMinEntries.has(rid));

    if (validRoadIds.length === 0) {
      console.log(`[RoadsController] No roadIds with at least 3 history entries. Total ratings: ${allRatings.length}, Valid: 0`);
      return [];
    }

    console.log(`[RoadsController] Filtered ${roadIds.length} roadIds to ${validRoadIds.length} with at least 3 history entries`);

    // Build where clause for RoadRatingHistory to filter by time, operator, and status
    const historyWhere: any = {
      entityId,
      roadId: { in: validRoadIds },
    };

    // Date filters
    if (parsedStartDate || parsedEndDate) {
      historyWhere.createdAt = {};
      if (parsedStartDate) {
        historyWhere.createdAt.gte = parsedStartDate;
      }
      if (parsedEndDate) {
        historyWhere.createdAt.lte = parsedEndDate;
      }
    } else {
      // Fallback to months lookback
      const lookbackMonths = Number.isFinite(Number(months)) ? Number(months) : 6;
      const since = new Date();
      since.setMonth(since.getMonth() - lookbackMonths);
      historyWhere.createdAt = { gte: since };
    }

    // Get history entries matching time filter
    const filteredHistory = await this.prisma.roadRatingHistory.findMany({
      where: historyWhere,
      select: {
        roadId: true,
        userId: true,
      },
    });

    // Start with all roadIds from history (matching time filter)
    const filteredRoadIds = new Set<string>();
    for (const h of filteredHistory) {
      filteredRoadIds.add(h.roadId);
    }

    // Only filter by surveys if operator or status filters are provided
    if (parsedOperator || parsedStatus) {
      // Build survey filter for operator and status
      const surveyWhere: any = {
        edgeIds: { hasSome: validRoadIds },
      };

      if (parsedStatus) {
        surveyWhere.project = {
          status: parsedStatus,
        };
      }

      if (parsedOperator) {
        surveyWhere.project = {
          ...surveyWhere.project,
          createdBy: parsedOperator,
        };
      }

      // Get surveys matching operator and status filters
      const surveys = await this.prisma.survey.findMany({
        where: surveyWhere,
        select: {
          edgeIds: true,
        },
      });

      // Collect roadIds from surveys matching operator/status filters
      const roadIdsFromSurveys = new Set<string>();
      for (const survey of surveys) {
        if (survey.edgeIds) {
          for (const rid of survey.edgeIds) {
            if (validRoadIds.includes(rid)) {
              roadIdsFromSurveys.add(rid);
            }
          }
        }
      }

      // Intersect: only keep roadIds that are in BOTH history AND surveys
      const intersection = new Set<string>();
      for (const roadId of filteredRoadIds) {
        if (roadIdsFromSurveys.has(roadId)) {
          intersection.add(roadId);
        }
      }
      // Replace filteredRoadIds with intersection
      filteredRoadIds.clear();
      for (const roadId of intersection) {
        filteredRoadIds.add(roadId);
      }
    }

    // If operator filter is set, we already filtered by userId in historyWhere
    // If status filter is set, we already filtered above
    // So filteredRoadIds now contains the roadIds that match all filters

    if (filteredRoadIds.size === 0) {
      console.log(`[RoadsController] No roadIds after filtering. Total ratings: ${allRatings.length}, History entries: ${filteredHistory.length}`);
      return [];
    }

    console.log(`[RoadsController] Found ${filteredRoadIds.size} roadIds after filtering. Getting geometries...`);

    // Get geometries for filtered roadIds
    const geometries = await this.roadsService.getGeometriesByRoadIds(Array.from(filteredRoadIds));

    console.log(`[RoadsController] Retrieved ${geometries.size} geometries for ${filteredRoadIds.size} roadIds`);

    if (geometries.size === 0) {
      console.log(`[RoadsController] No geometries found for roadIds: ${Array.from(filteredRoadIds).slice(0, 5).join(", ")}`);
      return [];
    }

    // Filter geometries by bbox
    const bboxPolygon = turf.bboxPolygon([minLng, minLat, maxLng, maxLat]);
    const results: Array<{
      roadId: string;
      eiri: number;
      geometry: any;
      color: string;
    }> = [];

    let bboxFilteredCount = 0;
    for (const [roadId, geometry] of geometries.entries()) {
      if (!filteredRoadIds.has(roadId)) continue;

      // Check if geometry overlaps with bbox
      try {
        if (!geometry || !geometry.coordinates || !Array.isArray(geometry.coordinates)) {
          console.log(`[RoadsController] Invalid geometry for roadId ${roadId}`);
          continue;
        }

        // Get first and last coordinates to check bbox quickly
        const coords = geometry.coordinates;
        if (coords.length === 0) continue;

        const firstCoord = coords[0];
        const lastCoord = coords[coords.length - 1];
        
        // Quick check: if any coordinate is in bbox, the line likely intersects
        let hasPointInBbox = false;
        for (const coord of coords) {
          if (Array.isArray(coord) && coord.length >= 2) {
            const [lng, lat] = coord;
            if (
              lng >= minLng && lng <= maxLng &&
              lat >= minLat && lat <= maxLat
            ) {
              hasPointInBbox = true;
              break;
            }
          }
        }

        if (!hasPointInBbox) {
          // Even if no point is in bbox, the line might cross it - use turf for accurate check
          const line = turf.lineString(geometry.coordinates);
          const intersects = turf.booleanIntersects(line, bboxPolygon);
          if (!intersects) {
            bboxFilteredCount++;
            if (bboxFilteredCount <= 3) {
              console.log(`[RoadsController] Road ${roadId} outside bbox. First coord: [${firstCoord[0]}, ${firstCoord[1]}], Bbox: [${minLng}, ${minLat}, ${maxLng}, ${maxLat}]`);
            }
            continue;
          }
        }

        results.push({
          roadId,
          eiri: ratingByRoadId.get(roadId) ?? 0,
          geometry,
          color: this.getEiriColor(ratingByRoadId.get(roadId) ?? 0),
        });
      } catch (e: any) {
        console.log(`[RoadsController] Error checking bbox for roadId ${roadId}: ${e?.message || e}`);
        continue;
      }
    }

    console.log(`[RoadsController] Returning ${results.length} roads (${bboxFilteredCount} filtered out by bbox)`);

    return results;
  }

  private getEiriColor(eiri: number): string {
    if (eiri < 1.5) return "green";
    if (eiri < 2.5) return "light_green";
    if (eiri < 3.5) return "light_orange";
    if (eiri < 4.5) return "orange";
    return "red";
  }
}

