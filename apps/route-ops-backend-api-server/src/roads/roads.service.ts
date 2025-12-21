import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { getEiriHexColor } from "../util/eiriColor.util";
import * as fs from "fs";
import * as path from "path";
// NOTE: When you install the GeoPackage library, adjust this import to match its docs.
// This is written assuming a GeoPackageAPI similar to @ngageoint/geopackage.
// If the actual API differs, only this import + open logic need to be updated.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const geopackageLib = require("@ngageoint/geopackage");
const { GeoPackageAPI, FeatureIndexManager, BoundingBox, ProjectionConstants, GeometryData } = geopackageLib;
import * as turf from "@turf/turf";

export interface NearestEdgeResult {
  edgeId: string | null;
  distanceMeters: number | null;
  roadName: string | null;
  projectId: string | null;
  geometry: any | null;
}

// GeoJSON Feature format for direct Google Maps consumption
export interface NearestEdgeGeoJsonFeature {
  type: "Feature";
  properties: {
    edgeId: string | null;
    distanceMeters: number | null;
    roadName: string | null;
    projectId: string | null;
  };
  geometry: {
    type: "LineString";
    coordinates: number[][];
  } | null;
}

// Response format for frontend: edgeId + GeoJSON Feature
export interface NearestEdgeResponse {
  edgeId: string | null;
  json: NearestEdgeGeoJsonFeature | null;
}

@Injectable()
export class RoadsService {
  private readonly logger = new Logger(RoadsService.name);
  private gpkgCache: Map<string, { gpkg: any; featureDao: any; featureIndexManager: any; tableName: string }> = new Map();
  // Cache for nearest edge queries (key: "lat_lng_radius", value: NearestEdgeResult)
  private nearestEdgeCache: Map<string, NearestEdgeResult | null> = new Map();
  // Longer cache on production (Render) to reduce database load
  private readonly CACHE_TTL_MS = process.env.NODE_ENV === 'production' 
    ? 15 * 60 * 1000  // 15 minutes on production
    : 5 * 60 * 1000;  // 5 minutes on development
  private cacheTimestamps: Map<string, number> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  // From your attribute list: fid, full_id, osm_id, osm_type, highway, name, ...
  // We'll treat osm_id as our stable edgeId, and name as the human-readable road name.
  private readonly edgeIdColumn = "osm_id";
  private readonly roadNameColumn = "name";

  private async getGeoPackageFiles(): Promise<string[]> {
    const mapFilesDir = path.join(process.cwd(), "map-files");
    
    if (!fs.existsSync(mapFilesDir)) {
      this.logger.error(`map-files directory not found at ${mapFilesDir}`);
      throw new Error(`map-files directory not found at ${mapFilesDir}`);
    }

    const files = fs.readdirSync(mapFilesDir);
    const gpkgFiles = files
      .filter((file) => file.toLowerCase().endsWith(".gpkg"))
      .map((file) => path.join(mapFilesDir, file));

    if (gpkgFiles.length === 0) {
      throw new Error("No .gpkg files found in map-files directory");
    }

    this.logger.log(`Found ${gpkgFiles.length} GeoPackage file(s): ${gpkgFiles.map(f => path.basename(f)).join(", ")}`);
    return gpkgFiles;
  }

  private async getFeatureDaoForFile(gpkgPath: string): Promise<{ featureDao: any; gpkg: any; featureIndexManager: any; tableName: string } | null> {
    // Check cache first
    if (this.gpkgCache.has(gpkgPath)) {
      const cached = this.gpkgCache.get(gpkgPath)!;
      this.logger.log(`Using cached entry for ${path.basename(gpkgPath)}, has FeatureIndexManager: ${!!cached.featureIndexManager}`);
      return cached;
    }

    if (!fs.existsSync(gpkgPath)) {
      this.logger.error(`GeoPackage not found at ${gpkgPath}`);
      throw new Error(`GeoPackage not found at ${gpkgPath}`);
    }

    this.logger.log(`Opening GeoPackage: ${path.basename(gpkgPath)}`);
    const gpkg = await GeoPackageAPI.open(gpkgPath);

    // Get all feature tables
    const featureTables = gpkg.getFeatureTables();
    if (!featureTables || featureTables.length === 0) {
      this.logger.warn(`No feature tables found in ${path.basename(gpkgPath)}`);
      return null;
    }

    // Auto-detect first feature table
    const tableToUse = featureTables[0];
    this.logger.log(`Using feature table '${tableToUse}' in ${path.basename(gpkgPath)}`);

    const featureDao = gpkg.getFeatureDao(tableToUse);
    if (!featureDao) {
      this.logger.warn(`Feature table '${tableToUse}' not found in ${path.basename(gpkgPath)}`);
      return null;
    }

    // Create FeatureIndexManager for spatial queries
    let featureIndexManager: any = null;
    try {
      if (FeatureIndexManager) {
        this.logger.log(`Creating FeatureIndexManager for ${path.basename(gpkgPath)}...`);
        featureIndexManager = new FeatureIndexManager(gpkg, featureDao);
        this.logger.log(`FeatureIndexManager created successfully`);
        
        // Ensure the index exists
        if (typeof featureIndexManager.index === "function") {
          this.logger.log(`Creating spatial index...`);
          featureIndexManager.index();
          this.logger.log(`Spatial index created`);
        } else {
          this.logger.warn(`FeatureIndexManager.index() method not available`);
        }
      } else {
        this.logger.warn(`FeatureIndexManager class not available in GeoPackage library`);
      }
    } catch (e: any) {
      this.logger.error(`Could not create FeatureIndexManager: ${e?.message || e}, stack: ${e?.stack}`);
    }

    // Cache the opened GeoPackage, featureDao, and featureIndexManager
    const cacheEntry = { gpkg, featureDao, featureIndexManager, tableName: tableToUse };
    this.gpkgCache.set(gpkgPath, cacheEntry);
    return cacheEntry;
  }

  async findNearestEdge(
    lat: number,
    lng: number,
    radiusMeters: number
  ): Promise<NearestEdgeResult | null> {
    // Check cache first (round coordinates to ~10m precision for cache key)
    const cacheKey = `${Math.round(lat * 10000) / 10000}_${Math.round(lng * 10000) / 10000}_${radiusMeters}`;
    const cachedTimestamp = this.cacheTimestamps.get(cacheKey);
    if (cachedTimestamp && Date.now() - cachedTimestamp < this.CACHE_TTL_MS) {
      const cached = this.nearestEdgeCache.get(cacheKey);
      if (cached !== undefined) {
        this.logger.log(`Cache hit for nearest edge query: ${cacheKey}`);
        return cached;
      }
    }

    // Get all .gpkg files in map-files directory
    const gpkgFiles = await this.getGeoPackageFiles();

    // Approximate bbox in degrees around the click point
    // Cap radius to prevent overflow (max ~180 degrees = half the world)
    const maxRadiusMeters = 20000000; // ~20,000 km (half Earth's circumference)
    const effectiveRadius = Math.min(radiusMeters, maxRadiusMeters);
    
    const latRad = (lat * Math.PI) / 180;
    const deltaLat = effectiveRadius / 111320; // ~ meters per degree latitude
    const deltaLng = effectiveRadius / (111320 * Math.cos(latRad || 1e-6));
    
    // Cap deltas to prevent overflow (max 180 degrees)
    const maxDelta = 180;
    const cappedDeltaLat = Math.min(deltaLat, maxDelta);
    const cappedDeltaLng = Math.min(deltaLng, maxDelta);
    
    const minX = lng - cappedDeltaLng;
    const maxX = lng + cappedDeltaLng;
    const minY = lat - cappedDeltaLat;
    const maxY = lat + cappedDeltaLat;

    const clickPoint = turf.point([lng, lat]);

    // Query features from all GeoPackage files using FeatureIndexManager with bounding box
    let allFeatures: any[] = [];
    
    // Create bounding box for the search area
    const bbox = new BoundingBox(minX, minY, maxX, maxY);
    
    // Iterate over all .gpkg files
    for (const gpkgPath of gpkgFiles) {
      try {
        const daoEntry = await this.getFeatureDaoForFile(gpkgPath);
        if (!daoEntry) {
          this.logger.warn(`Skipping ${path.basename(gpkgPath)} - no feature DAO available`);
          continue;
        }
        const { featureDao, featureIndexManager, gpkg } = daoEntry;

        this.logger.log(`Querying features from ${path.basename(gpkgPath)} using bounding box...`);
        
        let fileFeatures: any[] = [];
        
        // Use FeatureIndexManager to query with bounding box (most efficient method)
        if (featureIndexManager) {
          this.logger.log(`FeatureIndexManager available for ${path.basename(gpkgPath)}, attempting spatial query...`);
          try {
            // Log available methods on FeatureIndexManager
            const fimMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(featureIndexManager))
              .filter(n => typeof featureIndexManager[n] === 'function' && n.includes('query'))
              .join(', ');
            this.logger.log(`FeatureIndexManager query methods: ${fimMethods}`);
            
            // Query with bounding box and WGS84 projection (EPSG:4326)
            const projection = ProjectionConstants ? ProjectionConstants.EPSG_4326 : null;
            this.logger.log(`Using projection: ${projection}, bbox: minX=${bbox.minX}, maxX=${bbox.maxX}, minY=${bbox.minY}, maxY=${bbox.maxY}`);
            
            let resultSet: any = null;
            if (projection && typeof featureIndexManager.queryWithBoundingBoxAndProjection === "function") {
              this.logger.log(`Calling queryWithBoundingBoxAndProjection...`);
              resultSet = featureIndexManager.queryWithBoundingBoxAndProjection(bbox, projection);
            } else if (typeof featureIndexManager.queryWithBoundingBox === "function") {
              this.logger.log(`Calling queryWithBoundingBox...`);
              resultSet = featureIndexManager.queryWithBoundingBox(bbox);
            } else {
              this.logger.warn(`No suitable query method found on FeatureIndexManager`);
            }
            
            this.logger.log(`ResultSet type: ${typeof resultSet}, isArray: ${Array.isArray(resultSet)}, has iterator: ${resultSet && typeof resultSet[Symbol.iterator] === 'function'}`);
            
            if (resultSet) {
              // Convert result set to array
              try {
                if (Array.isArray(resultSet)) {
                  fileFeatures = resultSet;
                } else if (resultSet && typeof resultSet[Symbol.iterator] === "function") {
                  fileFeatures = Array.from(resultSet);
                } else if (typeof resultSet.forEach === "function") {
                  resultSet.forEach((feature: any) => {
                    fileFeatures.push(feature);
                  });
                } else if (typeof resultSet.next === "function") {
                  // Iterator pattern
                  let next = resultSet.next();
                  while (!next.done) {
                    fileFeatures.push(next.value);
                    next = resultSet.next();
                  }
                } else {
                  this.logger.warn(`Unknown resultSet type, trying to use directly`);
                  fileFeatures = [resultSet];
                }
              } catch (e: any) {
                this.logger.warn(`Could not convert result set to array: ${e?.message || e}`);
              }
            } else {
              this.logger.warn(`FeatureIndexManager query returned null/undefined`);
            }
            
            this.logger.log(`Loaded ${fileFeatures.length} features from ${path.basename(gpkgPath)} using FeatureIndexManager`);
          } catch (e: any) {
            this.logger.error(`FeatureIndexManager query failed: ${e?.message || e}, stack: ${e?.stack}`);
            this.logger.warn(`Falling back to queryForAll`);
          }
        } else {
          this.logger.warn(`FeatureIndexManager not available for ${path.basename(gpkgPath)}`);
        }
        
        // Fallback to queryForAll if FeatureIndexManager didn't work
        if (fileFeatures.length === 0 && typeof (featureDao as any).queryForAll === "function") {
          this.logger.log(`Using queryForAll() fallback for ${path.basename(gpkgPath)}`);
          const results = (featureDao as any).queryForAll();
          fileFeatures = Array.isArray(results) ? results : [];
          if (!Array.isArray(results) && results) {
            try {
              fileFeatures = Array.from(results);
            } catch (e) {
              this.logger.warn(`Could not convert results to array: ${e}`);
            }
          }
        }
        else {
          // Try to get features using other methods
          this.logger.warn(`No standard query method found in ${path.basename(gpkgPath)}, trying alternative methods...`);
          
          // Try to iterate through features manually
          try {
            // Try count() method
            let count = 0;
            if (typeof (featureDao as any).count === "function") {
              count = (featureDao as any).count();
              this.logger.log(`Feature count in ${path.basename(gpkgPath)}: ${count}`);
            }
            
            // Try queryForId with different ID formats
            if (count > 0 && typeof (featureDao as any).queryForId === "function") {
              // Try first 100 IDs (or all if less)
              const maxIds = Math.min(100, count);
              for (let i = 1; i <= maxIds; i++) {
                try {
                  const feature = (featureDao as any).queryForId(i);
                  if (feature) {
                    fileFeatures.push(feature);
                  }
                } catch (e) {
                  // Skip if ID doesn't exist
                }
              }
              this.logger.log(`Loaded ${fileFeatures.length} features from ${path.basename(gpkgPath)} using queryForId (tried first ${maxIds} IDs)`);
            }
            
            // If still no features, try queryForChunk with pagination
            if (fileFeatures.length === 0 && typeof (featureDao as any).queryForChunk === "function") {
              try {
                let offset = 0;
                const chunkSize = 1000;
                let hasMore = true;
                
                while (hasMore && fileFeatures.length < 10000) { // Limit to 10k features per file
                  const chunk = (featureDao as any).queryForChunk(offset, chunkSize);
                  if (!chunk || chunk.length === 0) {
                    hasMore = false;
                  } else {
                    fileFeatures = fileFeatures.concat(chunk);
                    offset += chunkSize;
                    if (chunk.length < chunkSize) {
                      hasMore = false;
                    }
                  }
                }
                this.logger.log(`Loaded ${fileFeatures.length} features from ${path.basename(gpkgPath)} using queryForChunk pagination`);
              } catch (e) {
                this.logger.warn(`queryForChunk pagination failed: ${e}`);
              }
            }
          } catch (e) {
            this.logger.error(`Could not get features using alternative methods: ${e}`);
          }
          
          if (fileFeatures.length === 0) {
            this.logger.warn(`No features loaded from ${path.basename(gpkgPath)} - available methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(featureDao)).filter(n => typeof (featureDao as any)[n] === 'function').join(', ')}`);
            continue;
          }
        }

        this.logger.log(`Loaded ${fileFeatures.length} features from ${path.basename(gpkgPath)}`);
        
        // Log sample feature structure for debugging
        if (fileFeatures.length > 0) {
          const sample = fileFeatures[0];
          const keys = Object.keys(sample);
          this.logger.log(`Sample feature from ${path.basename(gpkgPath)}: ${keys.join(', ')}`);
          
          // Try to convert first feature to see structure
          if (typeof sample.toGeoJSON === "function") {
            try {
              const geoJson = sample.toGeoJSON();
              this.logger.log(`Sample feature toGeoJSON() result type: ${geoJson?.type}, has geometry: ${!!geoJson?.geometry}`);
            } catch (e) {
              this.logger.warn(`Could not convert sample feature to GeoJSON: ${e}`);
            }
          }
          
          // Check geom property structure
          if (sample.geom) {
            const geomKeys = Object.keys(sample.geom);
            this.logger.log(`Sample feature geom type: ${typeof sample.geom}, keys: ${geomKeys.join(', ')}`);
            this.logger.log(`Sample feature geom methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(sample.geom)).filter(n => typeof sample.geom[n] === 'function').join(', ')}`);
          }
          
          // Check if feature itself has geometry conversion methods
          const featureMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sample)).filter(n => typeof sample[n] === 'function' && (n.includes('geo') || n.includes('Geo') || n.includes('geometry') || n.includes('Geometry')));
          if (featureMethods.length > 0) {
            this.logger.log(`Sample feature geometry-related methods: ${featureMethods.join(', ')}`);
          }
        }
        
        allFeatures = allFeatures.concat(fileFeatures);
      } catch (error: any) {
        this.logger.error(`Error loading features from ${path.basename(gpkgPath)}: ${error}`);
        // Continue with other files even if one fails
        continue;
      }
    }

    this.logger.log(`Total features loaded from all GeoPackages: ${allFeatures.length}`);

    if (allFeatures.length === 0) {
      this.logger.warn("No features loaded from any GeoPackage file!");
      return null;
    }

    // Log bbox for debugging
    this.logger.log(`Search bbox: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}`);
    this.logger.log(`Click point: lat=${lat}, lng=${lng}, radiusMeters=${radiusMeters}`);

    // Filter by bbox in memory (features from FeatureIndexManager should already be filtered)
    // But we still need to extract geometry and filter by exact distance
    
    let filteredCount = 0;
    let geometryExtractionFailures = 0;
    let sampleGeomInspected = false;
    
    const features = allFeatures.filter((f: any) => {
        // Extract geometry - handle different formats
        let geom: any = null;
        
        // The geom property is a Buffer (binary geometry blob from GeoPackage)
        // We need to parse it using GeoPackage's GeometryData utilities
        if (!geom && f.geom) {
          try {
            // Check if it's already GeoJSON (shouldn't be, but just in case)
            if (f.geom.type && f.geom.coordinates) {
              geom = f.geom;
            } else if (Buffer.isBuffer(f.geom) || (f.geom instanceof Uint8Array) || (typeof f.geom.readUInt8 === 'function')) {
              // It's a binary buffer - parse it using GeoPackageAPI.parseGeometryData
              try {
                // Use GeoPackageAPI.parseGeometryData to parse the binary geometry
                if (typeof GeoPackageAPI.parseGeometryData === "function") {
                  const geometryData = GeoPackageAPI.parseGeometryData(f.geom);
                  
                  if (geometryData) {
                    // Convert to GeoJSON
                    if (typeof geometryData.toGeoJSON === "function") {
                      const geoJson = geometryData.toGeoJSON();
                      geom = geoJson?.geometry || geoJson;
                    } else if (typeof geometryData.getGeometry === "function") {
                      const geometryObj = geometryData.getGeometry();
                      if (geometryObj) {
                        if (typeof geometryObj.toGeoJSON === "function") {
                          const geoJson = geometryObj.toGeoJSON();
                          geom = geoJson?.geometry || geoJson;
                        } else if (geometryObj.coordinates) {
                          geom = geometryObj;
                        }
                      }
                    }
                  }
                } else if (GeometryData) {
                  // Fallback: try using GeometryData constructor directly
                  try {
                    const geometryData = new GeometryData(f.geom);
                    if (typeof geometryData.toGeoJSON === "function") {
                      const geoJson = geometryData.toGeoJSON();
                      geom = geoJson?.geometry || geoJson;
                    }
                  } catch (e) {
                    // Ignore
                  }
                }
                
                if (!geom && !sampleGeomInspected) {
                  this.logger.warn(`Could not parse geometry buffer - parseGeometryData available: ${typeof GeoPackageAPI.parseGeometryData === 'function'}, GeometryData available: ${!!GeometryData}`);
                  sampleGeomInspected = true;
                }
              } catch (parseError: any) {
                if (!sampleGeomInspected) {
                  this.logger.warn(`Failed to parse geometry buffer: ${parseError?.message || parseError}`);
                  sampleGeomInspected = true;
                }
              }
            }
          } catch (e) {
            // Ignore
          }
        }
        
        // Try toGeoJSON on the feature itself (fallback)
        if (!geom && typeof f.toGeoJSON === "function") {
          try {
            const geoJson = f.toGeoJSON();
            if (geoJson && geoJson.geometry) {
              geom = geoJson.geometry;
            } else if (geoJson && geoJson.coordinates) {
              // Already a geometry object
              geom = geoJson;
            } else if (geoJson && geoJson.type === "Feature") {
              geom = geoJson.geometry;
            }
          } catch (e) {
            // Ignore
          }
        }
        
        // Fallback to other properties
        if (!geom && f.geometry) {
          geom = f.geometry;
        } else if (!geom && f.type === "Feature" && f.geometry) {
          geom = f.geometry;
        }

        if (!geom) {
          geometryExtractionFailures++;
          return false;
        }

        // Handle different geometry formats
        if (typeof geom === "string") {
          // Might be WKT, try to parse
          try {
            // For now, skip WKT strings
            geometryExtractionFailures++;
            return false;
          } catch (e) {
            geometryExtractionFailures++;
            return false;
          }
        }

        // Check if geom has coordinates directly or nested
        if (!geom.coordinates) {
          // Try to get coordinates from nested structure
          if (geom.geometry && geom.geometry.coordinates) {
            geom = geom.geometry;
          } else {
            geometryExtractionFailures++;
            return false;
          }
        }
        
        if (!geom.coordinates) {
          geometryExtractionFailures++;
          return false;
        }

        // Store the extracted geometry on the feature for later use
        (f as any)._extractedGeometry = geom;

        // Extract all coordinates from LineString or MultiLineString
        let coords: number[] = [];
        if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
          coords = geom.coordinates.flat();
        } else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
          coords = geom.coordinates.flat(2);
        } else {
          return false;
        }

        // Extract lngs and lats (coordinates are [lng, lat, ...] pairs)
        const lngs: number[] = [];
        const lats: number[] = [];
        for (let i = 0; i < coords.length; i += 2) {
          if (typeof coords[i] === "number" && typeof coords[i + 1] === "number") {
            lngs.push(coords[i]);
            lats.push(coords[i + 1]);
          }
        }

        if (lngs.length === 0 || lats.length === 0) return false;

        const featureMinLng = Math.min(...lngs);
        const featureMaxLng = Math.max(...lngs);
        const featureMinLat = Math.min(...lats);
        const featureMaxLat = Math.max(...lats);

        // Check if feature bbox overlaps with search bbox
        const inBbox = (
          featureMinLng <= maxX &&
          featureMaxLng >= minX &&
          featureMinLat <= maxY &&
          featureMaxLat >= minY
        );
        
        if (inBbox) {
          filteredCount++;
        }
        
        return inBbox;
      });

    this.logger.log(`Filtered ${filteredCount} features in bbox (${geometryExtractionFailures} geometry extraction failures)`);
    this.logger.log(`Found ${features.length} candidate features in bbox`);

    if (features.length === 0) {
      this.logger.warn("No features found after filtering");
      return null;
    }

    // Check if first feature has _extractedGeometry
    if (features.length > 0) {
      const firstFeature = features[0] as any;
      this.logger.log(`First feature has _extractedGeometry: ${!!firstFeature._extractedGeometry}, type: ${firstFeature._extractedGeometry?.type}`);
    }

    // Limit features to process (performance optimization)
    const MAX_FEATURES_TO_PROCESS = 200;
    const featuresToProcess = features.slice(0, MAX_FEATURES_TO_PROCESS);
    if (features.length > MAX_FEATURES_TO_PROCESS) {
      this.logger.log(`Limiting feature processing to ${MAX_FEATURES_TO_PROCESS} of ${features.length} features`);
    }

    // Sort features by approximate distance (using bbox center) before exact calculation
    // clickPoint is already defined earlier in the function
    featuresToProcess.sort((a: any, b: any) => {
      const geomA = (a as any)._extractedGeometry;
      const geomB = (b as any)._extractedGeometry;
      if (!geomA || !geomB) return 0;
      
      // Calculate approximate distance using bbox center
      const getBboxCenter = (geom: any) => {
        if (geom.type === "LineString" && geom.coordinates?.length > 0) {
          const midIdx = Math.floor(geom.coordinates.length / 2);
          return turf.point(geom.coordinates[midIdx]);
        }
        return null;
      };
      
      const centerA = getBboxCenter(geomA);
      const centerB = getBboxCenter(geomB);
      if (!centerA || !centerB) return 0;
      
      const distA = turf.distance(clickPoint, centerA, { units: "meters" });
      const distB = turf.distance(clickPoint, centerB, { units: "meters" });
      return distA - distB;
    });

    let bestFeature: any = null;
    let bestDistance = Infinity;
    let processedCount = 0;
    let distanceCalculationFailures = 0;
    const EARLY_EXIT_DISTANCE = 5; // Exit early if we find a match within 5 meters

    for (const row of featuresToProcess) {
      // Features should have geometry extracted and stored in _extractedGeometry during filtering
      let geom: any = (row as any)._extractedGeometry;
      let feature: any = row;

      // If geometry wasn't pre-extracted (shouldn't happen), try to extract it now
      if (!geom) {
        // Log first few missing geometries for debugging
        if (processedCount < 3) {
          this.logger.warn(`Feature missing _extractedGeometry (feature ${processedCount}), attempting to extract now...`);
        }
        // Try quick extraction - but this is a fallback
        if (row.geom && typeof GeoPackageAPI.parseGeometryData === "function") {
          try {
            const geometryData = GeoPackageAPI.parseGeometryData(row.geom);
            if (geometryData && typeof geometryData.toGeoJSON === "function") {
              const geoJson = geometryData.toGeoJSON();
              geom = geoJson?.geometry || geoJson;
            }
          } catch (e) {
            // Skip this feature
            continue;
          }
        } else {
          continue;
        }
      }
      
      processedCount++;
      
      // Log first few to verify geometry structure
      if (processedCount <= 3) {
        this.logger.log(`Processing feature ${processedCount}, geom type: ${geom?.type}, has coordinates: ${!!geom?.coordinates}`);
      }

      let line: any = null;
      if (geom.type === "LineString") {
        line = geom;
      } else if (geom.type === "MultiLineString") {
        const fc = turf.flatten(geom);
        if (fc.features.length > 0) {
          line = fc.features[0].geometry;
        }
      }

      if (!line) continue;

      let snapped: any;
      try {
        snapped = (turf as any).nearestPointOnLine(line, clickPoint, {
          units: "meters",
        });
      } catch (e: any) {
        distanceCalculationFailures++;
        if (distanceCalculationFailures <= 3) {
          this.logger.warn(`Failed to compute nearestPointOnLine: ${e?.message || e}`);
        }
        continue;
      }

      const dist =
        (snapped.properties && snapped.properties.dist) ??
        (turf as any).distance(clickPoint, snapped, { units: "meters" });

      if (
        typeof dist === "number" &&
        !isNaN(dist) &&
        dist < bestDistance &&
        dist <= radiusMeters
      ) {
        bestDistance = dist;
        bestFeature = feature;
        // Ensure the best feature has the extracted geometry (should already be set, but just in case)
        if (!(bestFeature as any)._extractedGeometry && geom) {
          (bestFeature as any)._extractedGeometry = geom;
        }
        
        // Early exit if we found a very close match (performance optimization)
        if (bestDistance < EARLY_EXIT_DISTANCE) {
          this.logger.log(`Early exit: found very close match at ${bestDistance}m`);
          break;
        }
      }
    }
    
    this.logger.log(`Processed ${processedCount} features, found nearest at ${bestDistance}m (${distanceCalculationFailures} distance calculation failures)`);

    if (!bestFeature) {
      return null;
    }

    // Extract properties - handle different formats
    let props: any = {};
    if (bestFeature.properties) {
      props = bestFeature.properties;
    } else if (bestFeature.type === "Feature" && bestFeature.properties) {
      props = bestFeature.properties;
    } else {
      // Properties might be directly on the row object
      props = { ...bestFeature };
      // Remove geometry-related fields
      delete props.geometry;
      delete props.geom;
      delete props.type;
    }

    // Also check if properties are methods that need to be called
    if (typeof (bestFeature as any).getValue === "function") {
      try {
        const osmId = (bestFeature as any).getValue("osm_id");
        if (osmId !== undefined) props.osm_id = osmId;
        const name = (bestFeature as any).getValue("name");
        if (name !== undefined) props.name = name;
      } catch (e) {
        // Ignore if getValue fails
      }
    }

    const edgeId =
      props[this.edgeIdColumn] ??
      props["osm_id"] ??
      props["full_id"] ??
      String(props["fid"] ?? null); // fallback to fid if available

    const roadName =
      props[this.roadNameColumn] ??
      props["name"] ??
      props["highway"] ??
      null;

    // Extract geometry - use the pre-extracted GeoJSON geometry from _extractedGeometry
    // This was already converted during the filtering phase
    let geometry: any = (bestFeature as any)._extractedGeometry;
    
    this.logger.log(`Best feature _extractedGeometry: ${!!geometry}, type: ${geometry?.type}, isBuffer: ${Buffer.isBuffer(geometry)}`);
    
    // Fallback if _extractedGeometry wasn't set or is a Buffer (shouldn't happen)
    if (!geometry || Buffer.isBuffer(geometry) || geometry.type === "Buffer") {
      this.logger.warn("Best feature missing valid _extractedGeometry, attempting conversion from geom Buffer...");
      
      // Try to extract from bestFeature.geom directly (it's a Buffer)
      if (bestFeature.geom && typeof GeoPackageAPI.parseGeometryData === "function") {
        try {
          const geometryData = GeoPackageAPI.parseGeometryData(bestFeature.geom);
          if (geometryData && typeof geometryData.toGeoJSON === "function") {
            const geoJson = geometryData.toGeoJSON();
            geometry = geoJson?.geometry || geoJson;
            this.logger.log(`Converted geometry from Buffer, new type: ${geometry?.type}`);
          }
        } catch (e: any) {
          this.logger.warn(`Failed to convert final geometry to GeoJSON: ${e?.message || e}`);
          geometry = null;
        }
      } else {
        geometry = null;
      }
    }
    
    // Final validation - ensure it's proper GeoJSON (not a Buffer)
    if (geometry) {
      if (Buffer.isBuffer(geometry) || geometry.type === "Buffer") {
        this.logger.warn("Geometry is still a Buffer after conversion attempt, setting to null");
        geometry = null;
      } else if (!geometry.type || !geometry.coordinates) {
        this.logger.warn(`Geometry missing required fields: type=${geometry?.type}, hasCoords=${!!geometry?.coordinates}`);
        geometry = null;
      } else {
        this.logger.log(`Geometry is valid GeoJSON: type=${geometry.type}, coordsLength=${Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 'N/A'}`);
      }
    }

    // Ensure geometry is properly converted to GeoJSON LineString
    let finalGeometry: any = null;
    
    if (geometry && geometry.type && geometry.coordinates && !Buffer.isBuffer(geometry) && geometry.type !== "Buffer") {
      // Already valid GeoJSON
      finalGeometry = geometry;
    } else if (bestFeature.geom && typeof GeoPackageAPI.parseGeometryData === "function") {
      // Try to convert from Buffer one more time
      try {
        const geometryData = GeoPackageAPI.parseGeometryData(bestFeature.geom);
        if (geometryData && typeof geometryData.toGeoJSON === "function") {
          const geoJson = geometryData.toGeoJSON();
          finalGeometry = geoJson?.geometry || geoJson;
        }
      } catch (e: any) {
        this.logger.warn(`Final geometry conversion failed: ${e?.message || e}`);
      }
    }

    // Return both formats: original format for backward compatibility
    // and GeoJSON Feature for direct Google Maps consumption
    const result: NearestEdgeResult = {
      edgeId: edgeId ?? null,
      distanceMeters:
        typeof bestDistance === "number" && !isNaN(bestDistance) ? bestDistance : null,
      roadName,
      projectId: null,
      geometry: finalGeometry, // LineString GeoJSON for map display
    };

    // Cache the result
    this.nearestEdgeCache.set(cacheKey, result);
    this.cacheTimestamps.set(cacheKey, Date.now());
    
    // Clean up old cache entries (keep cache size reasonable)
    if (this.nearestEdgeCache.size > 1000) {
      const now = Date.now();
      for (const [key, timestamp] of this.cacheTimestamps.entries()) {
        if (now - timestamp > this.CACHE_TTL_MS) {
          this.nearestEdgeCache.delete(key);
          this.cacheTimestamps.delete(key);
        }
      }
    }

    return result;
  }

  /**
   * Convert NearestEdgeResult to GeoJSON Feature format for Google Maps
   */
  toGeoJsonFeature(result: NearestEdgeResult): NearestEdgeGeoJsonFeature | null {
    if (!result.geometry || !result.edgeId) {
      return null;
    }

    return {
      type: "Feature",
      properties: {
        edgeId: result.edgeId,
        distanceMeters: result.distanceMeters,
        roadName: result.roadName,
        projectId: result.projectId,
      },
      geometry: result.geometry as {
        type: "LineString";
        coordinates: number[][];
      },
    };
  }

  /**
   * Get geometries for specific roadIds (edgeIds) from GeoPackage files
   * Returns a map of roadId -> GeoJSON geometry
   */
  async getGeometriesByRoadIds(roadIds: string[]): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    if (!roadIds || roadIds.length === 0) {
      return result;
    }

    const gpkgFiles = await this.getGeoPackageFiles();
    const roadIdSet = new Set(roadIds.map(id => String(id)));

    for (const gpkgPath of gpkgFiles) {
      const cacheEntry = await this.getFeatureDaoForFile(gpkgPath);
      if (!cacheEntry) continue;

      const { featureDao, tableName } = cacheEntry;

      try {
        // Query all features and filter by roadId
        const allFeatures = await featureDao.queryForAll();
        this.logger.log(`Checking ${allFeatures.length} features in ${path.basename(gpkgPath)} for ${roadIds.length} roadIds`);

        for (const f of allFeatures) {
          // Extract edgeId from feature
          let featureEdgeId: string | null = null;
          if (typeof (f as any).getValue === "function") {
            try {
              featureEdgeId = String((f as any).getValue(this.edgeIdColumn) ?? (f as any).getValue("osm_id") ?? (f as any).getValue("full_id") ?? "");
            } catch (e) {
              // Ignore
            }
          } else {
            featureEdgeId = String((f as any)[this.edgeIdColumn] ?? (f as any).osm_id ?? (f as any).full_id ?? "");
          }

          if (!featureEdgeId || !roadIdSet.has(featureEdgeId)) {
            continue;
          }

          // Extract geometry
          let geom: any = null;
          const geomProp = (f as any).geom ?? (f as any).geometry;
          
          if (geomProp && geomProp.type && geomProp.coordinates) {
            geom = geomProp;
          } else if (Buffer.isBuffer(geomProp) || (geomProp instanceof Uint8Array)) {
            try {
              if (typeof GeoPackageAPI.parseGeometryData === "function") {
                const geometryData = GeoPackageAPI.parseGeometryData(geomProp);
                if (geometryData) {
                  if (typeof geometryData.toGeoJSON === "function") {
                    const geoJson = geometryData.toGeoJSON();
                    geom = geoJson?.geometry || geoJson;
                  } else if (typeof geometryData.getGeometry === "function") {
                    const geometryObj = geometryData.getGeometry();
                    if (geometryObj && typeof geometryObj.toGeoJSON === "function") {
                      const geoJson = geometryObj.toGeoJSON();
                      geom = geoJson?.geometry || geoJson;
                    }
                  }
                }
              } else if (GeometryData) {
                try {
                  const geometryData = new GeometryData(geomProp);
                  if (typeof geometryData.toGeoJSON === "function") {
                    const geoJson = geometryData.toGeoJSON();
                    geom = geoJson?.geometry || geoJson;
                  }
                } catch (e) {
                  // Ignore
                }
              }
            } catch (e) {
              // Ignore geometry extraction errors
            }
          }

          if (geom && (geom.type === "LineString" || geom.type === "MultiLineString")) {
            // Convert MultiLineString to LineString if needed
            if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
              geom = {
                type: "LineString",
                coordinates: geom.coordinates[0],
              };
            }
            result.set(featureEdgeId, geom);
            roadIdSet.delete(featureEdgeId); // Remove from set to avoid duplicate searches
            if (roadIdSet.size === 0) break; // All roadIds found
          }
        }
      } catch (error: any) {
        this.logger.warn(`Error querying ${path.basename(gpkgPath)}: ${error?.message || error}`);
      }
    }

    return result;
  }

  /**
   * Find nearest edge using PostGIS (faster than GPKG file reading)
   */
  async findNearestEdgePostgis(
    lat: number,
    lng: number,
    radiusMeters: number,
    cityHallId?: string | null
  ): Promise<NearestEdgeResult | null> {
    // Check cache first
    const cacheKey = `${Math.round(lat * 10000) / 10000}_${Math.round(lng * 10000) / 10000}_${radiusMeters}_${cityHallId || 'all'}`;
    const cachedTimestamp = this.cacheTimestamps.get(cacheKey);
    if (cachedTimestamp && Date.now() - cachedTimestamp < this.CACHE_TTL_MS) {
      const cached = this.nearestEdgeCache.get(cacheKey);
      if (cached !== undefined) {
        this.logger.log(`Cache hit for PostGIS nearest edge query: ${cacheKey}`);
        return cached;
      }
    }

    try {
      // Optimized PostGIS query for Render (uses spatial index efficiently)
      // Using ST_DWithin with geography for accurate distance, but limiting results early
      let sql = `
        SELECT 
          edge_id,
          name,
          highway,
          ST_AsGeoJSON(geom)::jsonb as geometry,
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) as distance_meters
        FROM "Road"
        WHERE ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      `;

      const params: any[] = [lng, lat, radiusMeters];

      // Add city hall filter if provided (uses index)
      if (cityHallId) {
        sql += ` AND city_hall_id = $4`;
        params.push(cityHallId);
      }

      // Order and limit early to reduce processing
      // Use index scan hint for better performance on Render
      sql += ` 
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT 1;
      `;

      // Set query timeout for Render (30 seconds max)
      const result = await Promise.race([
        this.prisma.$queryRawUnsafe<Array<{
          edge_id: string;
          name: string | null;
          highway: string | null;
          geometry: any;
          distance_meters: number;
        }>>(sql, ...params),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 30000)
        )
      ]) as Array<{
        edge_id: string;
        name: string | null;
        highway: string | null;
        geometry: any;
        distance_meters: number;
      }>;

      if (!result || result.length === 0) {
        // Cache null result
        this.nearestEdgeCache.set(cacheKey, null);
        this.cacheTimestamps.set(cacheKey, Date.now());
        return null;
      }

      const row = result[0];
      const geometry = row.geometry;

      const nearestEdge: NearestEdgeResult = {
        edgeId: row.edge_id ?? null,
        distanceMeters: row.distance_meters ?? null,
        roadName: row.name ?? row.highway ?? null,
        projectId: null,
        geometry: geometry || null,
      };

      // Cache the result
      this.nearestEdgeCache.set(cacheKey, nearestEdge);
      this.cacheTimestamps.set(cacheKey, Date.now());

      return nearestEdge;
    } catch (error: any) {
      this.logger.error(`PostGIS query failed: ${error?.message || error}`);
      // Fallback to GPKG method if PostGIS fails
      this.logger.warn("Falling back to GPKG method");
      return this.findNearestEdge(lat, lng, radiusMeters);
    }
  }

  /**
   * Generate vector tile (MVT) for roads using PostGIS
   * Returns binary MVT (Mapbox Vector Tile) format
   * Optimized for Render with query timeout and simplified geometry
   * Includes road ratings (eIRI) for styling
   */
  async getVectorTile(
    z: number,
    x: number,
    y: number,
    cityHallId?: string | null
  ): Promise<Buffer | null> {
    try {
      // Calculate tile bounding box
      const n = Math.pow(2, z);
      const lon_deg = (x / n) * 360.0 - 180.0;
      const lat_rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
      const lat_deg = (lat_rad * 180.0) / Math.PI;

      const lon_deg_next = ((x + 1) / n) * 360.0 - 180.0;
      const lat_rad_next = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
      const lat_deg_next = (lat_rad_next * 180.0) / Math.PI;

      // Optimized MVT query for Render - simplified geometry at low zoom levels
      const simplifyTolerance = z < 10 ? 0.0001 : 0.00001; // More simplification at low zoom
      
      // Include ratings in tiles by joining with RoadRating table
      let sql = `
        SELECT ST_AsMVT(q, 'roads', 4096, 'geom') as mvt
        FROM (
          SELECT 
            r.edge_id,
            r.name,
            r.highway,
            COALESCE(rr.eiri, 0) as eiri,
            ST_AsMVTGeom(
              CASE 
                WHEN ${z} < 10 THEN ST_Simplify(r.geom, ${simplifyTolerance})
                ELSE r.geom
              END,
              ST_MakeEnvelope($1, $2, $3, $4, 4326),
              4096,
              256,
              true
            ) as geom
          FROM "Road" r
          LEFT JOIN "RoadRating" rr ON r.edge_id = rr."roadId" AND r.city_hall_id = rr."entityId"
          WHERE r.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      `;

      const params: any[] = [lon_deg, lat_deg_next, lon_deg_next, lat_deg];

      // Add city hall filter if provided (uses index)
      if (cityHallId) {
        sql += ` AND r.city_hall_id = $5`;
        params.push(cityHallId);
      }

      sql += `) as q WHERE q.geom IS NOT NULL;`;

      // Add timeout for Render (15 seconds for tiles)
      const result = await Promise.race([
        this.prisma.$queryRawUnsafe<Array<{ mvt: Buffer }>>(sql, ...params),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tile generation timeout')), 15000)
        )
      ]) as Array<{ mvt: Buffer }>;

      if (!result || result.length === 0 || !result[0]?.mvt) {
        return null;
      }

      return Buffer.from(result[0].mvt);
    } catch (error: any) {
      this.logger.error(`Vector tile generation failed: ${error?.message || error}`);
      return null;
    }
  }

  /**
   * Get all roads for an entity as GeoJSON FeatureCollection
   * Optimized for initial load - returns all roads with ratings in one call
   * This replaces the need for bbox-based API calls
   * 
   * Note: Uses raw SQL for PostGIS ST_AsGeoJSON function (not available in Prisma)
   */
  async getAllRoadsAsGeoJson(
    cityHallId: string,
    filters?: {
      months?: number;
      startDate?: Date;
      endDate?: Date;
      eiriMin?: number;
      eiriMax?: number;
      operator?: string;
      status?: string;
    }
  ): Promise<{
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: {
        edge_id: string;
        name: string | null;
        highway: string | null;
        eiri: number;
        color: string;
      };
      geometry: {
        type: "LineString";
        coordinates: number[][];
      };
    }>;
  } | null> {
    try {
      // If no filters provided, return all roads with ratings (no defaults applied)
      if (!filters || Object.keys(filters).length === 0) {
        const roads = await this.prisma.$queryRawUnsafe<Array<{
          edge_id: string;
          name: string | null;
          highway: string | null;
          eiri: number;
          geom: any; // GeoJSON from ST_AsGeoJSON
        }>>(
          `SELECT 
            r.edge_id, 
            r.name, 
            r.highway, 
            COALESCE(rr.eiri, 0) as eiri,
            ST_AsGeoJSON(r.geom)::jsonb as geom 
          FROM "Road" r
          INNER JOIN "RoadRating" rr ON r.edge_id = rr."roadId" AND r.city_hall_id = rr."entityId"
          WHERE r.city_hall_id = $1 
          ORDER BY r.edge_id`,
          cityHallId
        );

        if (!roads || roads.length === 0) {
          return {
            type: "FeatureCollection",
            features: [],
          };
        }

        // Convert to GeoJSON FeatureCollection
        const features = roads
          .filter((road) => road.geom && road.geom.coordinates)
          .map((road) => {
            const eiri = road.eiri || 0;
            const color = getEiriHexColor(eiri);

            return {
              type: "Feature" as const,
              properties: {
                edge_id: road.edge_id,
                name: road.name,
                highway: road.highway,
                eiri: eiri,
                color: color,
              },
              geometry: road.geom as {
                type: "LineString";
                coordinates: number[][];
              },
            };
          });

        return {
          type: "FeatureCollection",
          features,
        };
      }

      // Apply filters (same logic as bbox endpoint, but only when filters are provided)
      const ratingWhere: any = {
        entityId: cityHallId,
      };

      // eIRI filters
      if (filters.eiriMin !== undefined || filters.eiriMax !== undefined) {
        ratingWhere.eiri = {};
        if (filters.eiriMin !== undefined) {
          ratingWhere.eiri.gte = filters.eiriMin;
        }
        if (filters.eiriMax !== undefined) {
          ratingWhere.eiri.lte = filters.eiriMax;
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
        return {
          type: "FeatureCollection",
          features: [],
        };
      }

      const roadIds = allRatings.map((r) => r.roadId);
      const ratingByRoadId = new Map(allRatings.map((r) => [r.roadId, r.eiri]));

      // Filter out roadIds that don't have at least 3 entries in RoadRatingHistory
      const historyCounts = await this.prisma.roadRatingHistory.groupBy({
        by: ["roadId"],
        where: {
          entityId: cityHallId,
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

      const validRoadIds = roadIds.filter((rid) => roadIdsWithMinEntries.has(rid));

      if (validRoadIds.length === 0) {
        return {
          type: "FeatureCollection",
          features: [],
        };
      }

      // Build where clause for RoadRatingHistory to filter by time (only if time filters provided)
      const historyWhere: any = {
        entityId: cityHallId,
        roadId: { in: validRoadIds },
      };

      // Date filters - only apply if provided
      if (filters.startDate || filters.endDate) {
        historyWhere.createdAt = {};
        if (filters.startDate) {
          historyWhere.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
          historyWhere.createdAt.lte = filters.endDate;
        }
      } else if (filters.months !== undefined) {
        // Only apply months lookback if explicitly provided
        const lookbackMonths = Number.isFinite(filters.months) ? filters.months : 6;
        const since = new Date();
        since.setMonth(since.getMonth() - lookbackMonths);
        historyWhere.createdAt = { gte: since };
      }

      // Get history entries (filtered by time if time filters provided, otherwise all)
      const filteredHistory = await this.prisma.roadRatingHistory.findMany({
        where: historyWhere,
        select: {
          roadId: true,
          userId: true,
        },
      });

      // Start with all roadIds from history (matching time filter if provided, otherwise all)
      const filteredRoadIds = new Set<string>();
      for (const h of filteredHistory) {
        filteredRoadIds.add(h.roadId);
      }

      // If no time filters provided, use all validRoadIds instead of filtering by history
      if (!filters.startDate && !filters.endDate && filters.months === undefined) {
        filteredRoadIds.clear();
        for (const roadId of validRoadIds) {
          filteredRoadIds.add(roadId);
        }
      }

      // Only filter by surveys if operator or status filters are provided
      if (filters.operator || filters.status) {
        const surveyWhere: any = {
          edgeIds: { hasSome: validRoadIds },
        };

        if (filters.status) {
          surveyWhere.project = {
            status: filters.status,
          };
        }

        if (filters.operator) {
          surveyWhere.project = {
            ...surveyWhere.project,
            createdBy: filters.operator,
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
        filteredRoadIds.clear();
        for (const roadId of intersection) {
          filteredRoadIds.add(roadId);
        }
      }

      if (filteredRoadIds.size === 0) {
        return {
          type: "FeatureCollection",
          features: [],
        };
      }

      // Get roads with geometries for filtered roadIds
      const roadIdsArray = Array.from(filteredRoadIds);
      const placeholders = roadIdsArray.map((_, i) => `$${i + 2}`).join(",");

      const roads = await this.prisma.$queryRawUnsafe<Array<{
        edge_id: string;
        name: string | null;
        highway: string | null;
        eiri: number;
        geom: any; // GeoJSON from ST_AsGeoJSON
      }>>(
        `SELECT 
          r.edge_id, 
          r.name, 
          r.highway, 
          COALESCE(rr.eiri, 0) as eiri,
          ST_AsGeoJSON(r.geom)::jsonb as geom 
        FROM "Road" r
        INNER JOIN "RoadRating" rr ON r.edge_id = rr."roadId" AND r.city_hall_id = rr."entityId"
        WHERE r.city_hall_id = $1 AND r.edge_id IN (${placeholders})
        ORDER BY r.edge_id`,
        cityHallId,
        ...roadIdsArray
      );

      if (!roads || roads.length === 0) {
        return {
          type: "FeatureCollection",
          features: [],
        };
      }

      // Convert to GeoJSON FeatureCollection
      const features = roads
        .filter((road) => road.geom && road.geom.coordinates)
        .map((road) => {
          const eiri = road.eiri || 0;
          const color = getEiriHexColor(eiri);

          return {
            type: "Feature" as const,
            properties: {
              edge_id: road.edge_id,
              name: road.name,
              highway: road.highway,
              eiri: eiri,
              color: color,
            },
            geometry: road.geom as {
              type: "LineString";
              coordinates: number[][];
            },
          };
        });

      return {
        type: "FeatureCollection",
        features,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get all roads as GeoJSON: ${error?.message || error}`);
      return null;
    }
  }
}


