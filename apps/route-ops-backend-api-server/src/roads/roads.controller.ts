import { Controller, Get, Query, Post, Body, BadRequestException, UseGuards, Req, Param, Res } from "@nestjs/common";
import { Response } from "express";
import { getEiriColorName } from "../util/eiriColor.util";
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
import {
  computeLogicalSurveyTotals,
  type EdgeAnalyticsHistoryEntry,
  type EdgeAnalyticsProjectLookup,
  type EdgeAnalyticsSurveyLookup,
} from "../util/edgeAnalytics.util";
import { EnumProjectStatus } from "../project/base/EnumProjectStatus";
import * as turf from "@turf/turf";
import { Request } from "express";

@swagger.ApiTags("roads")
@Controller("roads")
export class RoadsController {
  constructor(
    private readonly roadsService: RoadsService,
    private readonly prisma: PrismaService
  ) {}

  @Get("nearest-edge")
  @swagger.ApiOperation({
    summary: "Find nearest road edge to a click location (uses PostGIS if available, falls back to GPKG)",
    description:
      "Given a lat/lng and optional radius (meters), returns the nearest road edge (if any). Uses PostGIS for faster queries.",
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
    @Query("radiusMeters") radiusRaw?: string,
    @UserData() userInfo?: UserInfo
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

    // Get user's city hall ID if available
    let cityHallId: string | null = null;
    if (userInfo?.id) {
      const user = await this.prisma.user.findUnique({
        where: { id: userInfo.id },
        select: { cityHallId: true },
      });
      cityHallId = user?.cityHallId ?? null;
    }

    // Try PostGIS first, fallback to GPKG
    const result = await this.roadsService.findNearestEdgePostgis(lat, lng, radius, cityHallId) ||
                   await this.roadsService.findNearestEdge(lat, lng, radius);

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

  @Get("all")
  @UseGuards(DefaultAuthGuard)
  @swagger.ApiOperation({
    summary: "Get all roads for the user's entity as GeoJSON (for initial map load)",
    description: "Returns all roads with ratings as GeoJSON FeatureCollection. Use this on initial load instead of bbox-based calls. Roads stay rendered as user pans the map. Supports the same filters as the bbox endpoint.",
  })
  @swagger.ApiQuery({ name: "months", required: false, description: "Lookback window in months (default 6)" })
  @swagger.ApiQuery({ name: "startDate", required: false, description: "Start date filter (DD/MM/YYYY)" })
  @swagger.ApiQuery({ name: "endDate", required: false, description: "End date filter (DD/MM/YYYY)" })
  @swagger.ApiQuery({ name: "eiriMin", required: false, description: "Minimum eIRI value" })
  @swagger.ApiQuery({ name: "eiriMax", required: false, description: "Maximum eIRI value" })
  @swagger.ApiQuery({ name: "eiriRange", required: false, description: "eIRI range (e.g., '0-1.5')" })
  @swagger.ApiQuery({ name: "operator", required: false, description: "Filter by operator (project creator)" })
  @swagger.ApiQuery({ name: "operatorId", required: false, description: "Filter by operator ID (project creator)" })
  @swagger.ApiQuery({ name: "status", required: false, description: "Filter by project status" })
  @swagger.ApiOkResponse({
    description: "GeoJSON FeatureCollection with all roads and ratings",
    schema: {
      type: "object",
      properties: {
        type: { type: "string", example: "FeatureCollection" },
        features: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", example: "Feature" },
              properties: {
                type: "object",
                properties: {
                  edge_id: { type: "string" },
                  name: { type: "string", nullable: true },
                  highway: { type: "string", nullable: true },
                  eiri: { type: "number" },
                  color: { type: "string" },
                },
              },
              geometry: {
                type: "object",
                properties: {
                  type: { type: "string", example: "LineString" },
                  coordinates: { type: "array", items: { type: "array", items: { type: "number" } } },
                },
              },
            },
          },
        },
      },
    },
  })
  async getAllRoads(
    @UserData() userInfo?: UserInfo,
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
      return {
        type: "FeatureCollection",
        features: [],
      };
    }

    // Parse all filters (same as bbox endpoint)
    const parsedStartDate = parseDate(startDate);
    const parsedEndDate = parseDate(endDate, true);
    const range = extractEiriRange(eiriRange);
    const parsedEiriMin = parseNumber(eiriMin) ?? range.min;
    const parsedEiriMax = parseNumber(eiriMax) ?? range.max;
    const parsedOperator = getString(operator) ?? getString(operatorId);
    const parsedStatus = parseStatus(status);

    const geoJson = await this.roadsService.getAllRoadsAsGeoJson(
      user.cityHallId,
      {
        months: months ? Number(months) : undefined,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        eiriMin: parsedEiriMin,
        eiriMax: parsedEiriMax,
        operator: parsedOperator,
        status: parsedStatus as string | undefined,
      }
    );
    return geoJson || { type: "FeatureCollection", features: [] };
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
    // Note: If an edge has multiple segments, this map will contain one entry per segment.
    // Currently, we use the last segment's rating. Future enhancement: aggregate or show worst segment.
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

  @Get("map-click-data")
  @UseGuards(DefaultAuthGuard)
  @swagger.ApiOperation({
    summary: "Get combined map click data (nearest edge + analytics) in one call",
    description:
      "Combines nearest-edge and edge-analytics endpoints into a single call for better performance. Returns nearest edge data and analytics if edge is found.",
  })
  @swagger.ApiQuery({
    name: "lat",
    required: true,
    type: Number,
    description: "Latitude in WGS84",
    example: 37.2472509168706,
  })
  @swagger.ApiQuery({
    name: "lng",
    required: true,
    type: Number,
    description: "Longitude in WGS84",
    example: 42.43722332467271,
  })
  @swagger.ApiQuery({
    name: "radiusMeters",
    required: false,
    type: Number,
    description: "Search radius in meters (default 200)",
    example: 200,
  })
  @swagger.ApiQuery({
    name: "from",
    required: false,
    type: String,
    description: "Start date for analytics (ISO string)",
    example: "2025-12-09T23:49:48.376Z",
  })
  @swagger.ApiQuery({
    name: "to",
    required: false,
    type: String,
    description: "End date for analytics (ISO string)",
    example: "2025-12-15T23:49:48.376Z",
  })
  @swagger.ApiOkResponse({
    description: "Combined response with nearest edge and analytics",
    schema: {
      type: "object",
      properties: {
        nearestEdge: {
          type: "object",
          nullable: true,
          properties: {
            edgeId: { type: "string", nullable: true },
            json: { type: "object", nullable: true },
          },
        },
        analytics: {
          type: "object",
          nullable: true,
          description: "Edge analytics (only present if edgeId was found)",
        },
      },
    },
  })
  async getMapClickData(
    @Query("lat") latRaw: string,
    @Query("lng") lngRaw: string,
    @Query("radiusMeters") radiusRaw?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @UserData() userInfo?: UserInfo,
    @Req() req?: Request
  ) {
    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    const radius =
      typeof radiusRaw === "string" && radiusRaw.length > 0
        ? parseFloat(radiusRaw)
        : 200;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new BadRequestException("Query parameters 'lat' and 'lng' are required and must be numbers.");
    }

    // Get user's city hall ID if available
    let cityHallId: string | null = null;
    if (userInfo?.id) {
      const user = await this.prisma.user.findUnique({
        where: { id: userInfo.id },
        select: { cityHallId: true },
      });
      cityHallId = user?.cityHallId ?? null;
    }

    // Step 1: Find nearest edge (try PostGIS first, fallback to GPKG)
    const nearestEdgeResult = await this.roadsService.findNearestEdgePostgis(lat, lng, radius, cityHallId) ||
                               await this.roadsService.findNearestEdge(lat, lng, radius);
    
    let nearestEdgeResponse: NearestEdgeResponse | null = null;
    if (nearestEdgeResult && nearestEdgeResult.edgeId) {
      const geoJsonFeature = this.roadsService.toGeoJsonFeature(nearestEdgeResult);
      nearestEdgeResponse = {
        edgeId: nearestEdgeResult.edgeId,
        json: geoJsonFeature,
      };
    }

    // Step 2: If edge found, get analytics
    let analytics: any = null;
    if (nearestEdgeResult?.edgeId) {
      analytics = await this.getEdgeAnalytics(
        nearestEdgeResult.edgeId,
        from,
        to,
        userInfo,
        req
      );
    }

    return {
      nearestEdge: nearestEdgeResponse,
      analytics,
    };
  }

  @Get("tiles/roads/:z/:x/:y.pbf")
  @UseGuards(DefaultAuthGuard)
  @swagger.ApiOperation({
    summary: "Get vector tile (MVT) for roads",
    description: "Returns Mapbox Vector Tile (MVT) format for roads. Filtered by user's city hall if not admin.",
  })
  @swagger.ApiParam({ name: "z", type: Number, description: "Zoom level" })
  @swagger.ApiParam({ name: "x", type: Number, description: "Tile X coordinate" })
  @swagger.ApiParam({ name: "y", type: Number, description: "Tile Y coordinate" })
  async getRoadTile(
    @Param("z") zRaw: string,
    @Param("x") xRaw: string,
    @Param("y") yRaw: string,
    @UserData() userInfo?: UserInfo,
    @Res() res?: Response
  ) {
    const z = parseInt(zRaw, 10);
    const x = parseInt(xRaw, 10);
    const y = parseInt(yRaw, 10);

    if (Number.isNaN(z) || Number.isNaN(x) || Number.isNaN(y)) {
      throw new BadRequestException("Invalid tile coordinates");
    }

    // Get user's city hall ID if available (non-admins only see their city hall)
    let cityHallId: string | null = null;
    if (userInfo?.id && !userInfo.roles?.includes("admin")) {
      const user = await this.prisma.user.findUnique({
        where: { id: userInfo.id },
        select: { cityHallId: true },
      });
      cityHallId = user?.cityHallId ?? null;
    }

    const tile = await this.roadsService.getVectorTile(z, x, y, cityHallId);

    if (!tile || !res) {
      // Return empty tile (204 No Content)
      if (res) {
        return res.status(204).send();
      }
      return null;
    }

    // Return MVT binary
    res.setHeader("Content-Type", "application/x-protobuf");
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    return res.send(tile);
  }

  /**
   * Helper method to get edge analytics (extracted from survey controller logic)
   * This allows us to reuse the analytics logic without duplicating code
   */
  private async getEdgeAnalytics(
    edgeId: string,
    from?: string,
    to?: string,
    userInfo?: UserInfo,
    req?: Request
  ): Promise<any> {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if ((from && Number.isNaN(fromDate!.getTime())) || (to && Number.isNaN(toDate!.getTime()))) {
      throw new BadRequestException("Invalid from/to date");
    }

    const authUser = userInfo ? { id: userInfo.id, roles: userInfo.roles } : undefined;

    // Base filters
    const surveyWhereBase: any = {
      edgeIds: { has: edgeId },
    };
    const hazardWhereBase: any = {
      edgeId,
    };

    // Date filters
    if (fromDate || toDate) {
      surveyWhereBase.startTime = {};
      hazardWhereBase.createdAt = {};
      if (fromDate) {
        surveyWhereBase.startTime.gte = fromDate;
        hazardWhereBase.createdAt.gte = fromDate;
      }
      if (toDate) {
        surveyWhereBase.startTime.lte = toDate;
        hazardWhereBase.createdAt.lte = toDate;
      }
    }

    // Entity scoping for non-admins
    let scopedCityHallId: string | null = null;
    if (authUser?.id && !authUser.roles?.includes("admin")) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: authUser.id },
        select: { cityHallId: true },
      });
      if (dbUser?.cityHallId) {
        scopedCityHallId = dbUser.cityHallId;
        surveyWhereBase.project = {
          ...(surveyWhereBase.project || {}),
          cityHallId: dbUser.cityHallId,
        };
        hazardWhereBase.project = {
          ...(hazardWhereBase.project || {}),
          cityHallId: dbUser.cityHallId,
        };
      }
    }

    // Build where clause for RoadRatingHistory
    const historyWhere: any = {
      roadId: edgeId,
    };

    if (scopedCityHallId) {
      historyWhere.entityId = scopedCityHallId;
    }

    if (fromDate || toDate) {
      historyWhere.createdAt = {};
      if (fromDate) {
        historyWhere.createdAt.gte = fromDate;
      }
      if (toDate) {
        historyWhere.createdAt.lte = toDate;
      }
    }

    // Get RoadRatingHistory entries
    const transactionResult = await this.prisma.$transaction([
      this.prisma.roadRatingHistory.findMany({
        where: historyWhere,
        select: {
          id: true,
          roadId: true,
          eiri: true,
          userId: true,
          surveyId: true,
          projectId: true,
          anomaliesCount: true,
          createdAt: true,
        } as any,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.roadRatingHistory.aggregate({
        where: historyWhere,
        _avg: { eiri: true },
      }),
    ]);
    const historyEntries = transactionResult[0] as any[];
    const avgResult = transactionResult[1];

    // Get unique projectIds and surveyIds
    const projectIdsFromHistory = Array.from(
      new Set((historyEntries as any[]).map((h: any) => h.projectId).filter((id: any): id is string => id !== null))
    );
    const surveyIdsFromHistory = Array.from(
      new Set((historyEntries as any[]).map((h: any) => h.surveyId).filter((id: any): id is string => id !== null))
    );

    // Fetch projects and surveys in parallel
    const [projects, surveys] = await Promise.all([
      projectIdsFromHistory.length > 0
        ? this.prisma.project.findMany({
            where: { id: { in: projectIdsFromHistory } },
            select: {
              id: true,
              name: true,
              createdBy: true,
              description: true,
              cityHallId: true,
            },
          })
        : Promise.resolve([]),
      surveyIdsFromHistory.length > 0
        ? this.prisma.survey.findMany({
            where: {
              id: { in: surveyIdsFromHistory },
            },
            select: {
              id: true,
              name: true,
              status: true,
              startTime: true,
              endTime: true,
              eIriAvg: true,
              projectId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // Create lookup maps
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const surveyById = new Map(surveys.map((s) => [s.id, s]));

    // Calculate totals
    const validHistoryEntries = (historyEntries as any[]).filter(
      (h: any) => h.surveyId && surveyById.has(h.surveyId)
    );
    const averageEiri = avgResult._avg.eiri ?? null;

    // Get unique users (project creators)
    const uniqueCreatorIds = new Set(
      projects.map((p) => p.createdBy).filter((id): id is string => id !== null && id !== undefined)
    );
    const uniqueUsers = uniqueCreatorIds.size;

    const creatorIds = Array.from(uniqueCreatorIds);
    const creators =
      creatorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          })
        : [];

    const creatorNameById = new Map<string, string>();
    for (const u of creators) {
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      creatorNameById.set(u.id, fullName || u.username || u.id);
    }

    // Get projectIds for anomaly queries
    const projectIds = Array.from(
      new Set(validHistoryEntries.map((h: any) => h.projectId).filter((id: any): id is string => id !== null))
    );

    // Count hazards with imageUrl per project (same logic as GET /projects/:id/hazards - no edgeId filter)
    const anomalyCountByProjectId = new Map<string, number>();
    if (projectIds.length > 0) {
      const hazardWhereCount: any = {
        projectId: { in: projectIds },
        imageUrl: { not: null },
      };
      if (scopedCityHallId) {
        hazardWhereCount.project = { cityHallId: scopedCityHallId };
      }
      const counts = await this.prisma.hazard.groupBy({
        by: ["projectId"],
        where: hazardWhereCount,
        _count: { id: true },
      });
      counts.forEach((c) => {
        if (c.projectId != null) {
          anomalyCountByProjectId.set(c.projectId, c._count.id);
        }
      });
    }

    // Total anomalies: sum each project's count once (same as project hazards endpoint)
    const uniqueProjectIdsInHistory = Array.from(
      new Set(validHistoryEntries.map((h: any) => h.projectId).filter((id: any): id is string => id !== null))
    );
    const totalAnomalies = uniqueProjectIdsInHistory.reduce(
      (sum: number, pid: string) => sum + (anomalyCountByProjectId.get(pid) ?? 0),
      0
    );

    const { totalSurveys, recentSurveys: recentSurveysWithCreator } = computeLogicalSurveyTotals({
      historyEntries: validHistoryEntries as EdgeAnalyticsHistoryEntry[],
      surveyById: surveyById as Map<string, EdgeAnalyticsSurveyLookup>,
      projectById: projectById as Map<string, EdgeAnalyticsProjectLookup>,
      creatorNameById,
      anomalyCountByProjectId,
      take: 20,
    });

    // Get recent anomalies: same logic as count and GET /projects/:id/hazards (by project + imageUrl only, no edgeId)
    const hazardWhere: any = {
      projectId: projectIds.length > 0 ? { in: projectIds } : { in: [] },
      imageUrl: { not: null }, // Only include hazards with imageUrl
    };

    if (fromDate || toDate) {
      hazardWhere.createdAt = {};
      if (fromDate) {
        hazardWhere.createdAt.gte = fromDate;
      }
      if (toDate) {
        hazardWhere.createdAt.lte = toDate;
      }
    }

    if (scopedCityHallId) {
      hazardWhere.project = {
        cityHallId: scopedCityHallId,
      };
    }

    const recentAnomaliesRaw = await this.prisma.hazard.findMany({
      where: hazardWhere,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        project: {
          select: {
            name: true,
          },
        },
      },
    });

    const recentAnomaliesWithNames = recentAnomaliesRaw.map((anomaly: any, index: number) => {
      const { project, ...anomalyWithoutProject } = anomaly;
      return {
        ...anomalyWithoutProject,
        projectName: project?.name ?? null,
        anomalyName: anomaly.name ?? null,
        index: index + 1,
      };
    });

    // Calculate daily EIRI data
    const dailyEiriData = this.calculateDailyEiriDataFromHistory(
      validHistoryEntries,
      fromDate,
      toDate
    );

    return {
      edgeId,
      from: fromDate ?? null,
      to: toDate ?? null,
      totalSurveys,
      totalAnomalies,
      uniqueUsers,
      averageEiri,
      recentSurveys: recentSurveysWithCreator,
      recentAnomalies: recentAnomaliesWithNames,
      dailyEiriData,
    };
  }

  /**
   * Calculate daily EIRI data from history entries
   */
  private calculateDailyEiriDataFromHistory(
    historyEntries: any[],
    fromDate: Date | undefined,
    toDate: Date | undefined
  ): Array<{
    date: string;
    day: string;
    dayNumber: number;
    month: string;
    value: number | null;
  }> {
    const endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999);

    let startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    if (fromDate) {
      const fromDateNormalized = new Date(fromDate);
      fromDateNormalized.setHours(0, 0, 0, 0);
      if (fromDateNormalized > startDate) {
        startDate = fromDateNormalized;
      }
    }

    const eiriByDate = new Map<string, number[]>();
    for (const h of historyEntries) {
      if (!h.createdAt) continue;
      const date = new Date(h.createdAt);
      if (date < startDate || date > endDate) continue;
      
      const dateKey = date.toISOString().split("T")[0];
      if (!eiriByDate.has(dateKey)) {
        eiriByDate.set(dateKey, []);
      }
      eiriByDate.get(dateKey)!.push(h.eiri);
    }

    const dailyData: Array<{
      date: string;
      day: string;
      dayNumber: number;
      month: string;
      value: number | null;
    }> = [];

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      
      const dateKey = currentDate.toISOString().split("T")[0];
      const dayOfWeek = currentDate.getDay();
      const dayNumber = currentDate.getDate();
      const monthIndex = currentDate.getMonth();

      let value: number | null = null;
      const dayEiris = eiriByDate.get(dateKey);
      if (dayEiris && dayEiris.length > 0) {
        const sum = dayEiris.reduce((a: number, b: number) => a + b, 0);
        value = Math.round((sum / dayEiris.length) * 100) / 100;
      }

      dailyData.push({
        date: dateKey,
        day: dayNames[dayOfWeek],
        dayNumber,
        month: monthNames[monthIndex],
        value,
      });
    }

    return dailyData;
  }

  private getEiriColor(eiri: number): string {
    return getEiriColorName(eiri);
  }
}

