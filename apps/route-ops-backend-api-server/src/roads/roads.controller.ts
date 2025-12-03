import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { RoadsService, NearestEdgeResponse } from "./roads.service";

@swagger.ApiTags("roads")
@Controller("roads")
export class RoadsController {
  constructor(private readonly roadsService: RoadsService) {}

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
}

