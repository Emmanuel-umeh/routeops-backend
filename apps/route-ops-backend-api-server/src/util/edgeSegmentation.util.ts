import * as turf from "@turf/turf";

/**
 * Configuration for edge segmentation
 */
export const SEGMENT_LENGTH_METERS = 50; // Split edges into 50m segments

/**
 * Calculate distance between two coordinates in meters
 */
function distanceMeters(coord1: [number, number], coord2: [number, number]): number {
  const point1 = turf.point(coord1);
  const point2 = turf.point(coord2);
  return turf.distance(point1, point2, { units: "meters" });
}

/**
 * Split a LineString geometry into segments of approximately SEGMENT_LENGTH_METERS
 * Returns an array of segments, each with its index and geometry
 */
export interface EdgeSegment {
  segmentIndex: number;
  segmentId: string; // Format: {edgeId}_seg_{index}
  geometry: any; // GeoJSON Feature<LineString> - using any since Turf types aren't exported
  startDistance: number; // Distance from start of edge in meters
  endDistance: number; // Distance from start of edge in meters
}

export function splitEdgeIntoSegments(
  edgeId: string,
  geometry: any // GeoJSON LineString or Feature<LineString> - using any since Turf types aren't exported
): EdgeSegment[] {
  const lineString = geometry.type === "Feature" ? geometry.geometry : geometry;
  
  if (!lineString.coordinates || lineString.coordinates.length < 2) {
    return [];
  }

  const segments: EdgeSegment[] = [];
  const coords = lineString.coordinates as [number, number][];
  
  // Calculate cumulative distances along the line
  const cumulativeDistances: number[] = [0];
  let totalDistance = 0;
  
  for (let i = 1; i < coords.length; i++) {
    const dist = distanceMeters(coords[i - 1], coords[i]);
    totalDistance += dist;
    cumulativeDistances.push(totalDistance);
  }

  if (totalDistance === 0) {
    // Edge has zero length, return single segment
    return [{
      segmentIndex: 0,
      segmentId: `${edgeId}_seg_0`,
      geometry: turf.lineString([coords[0], coords[coords.length - 1]]),
      startDistance: 0,
      endDistance: 0,
    }];
  }

  // Split into segments
  let currentSegmentIndex = 0;
  let currentSegmentStart = 0;
  let currentSegmentCoords: [number, number][] = [coords[0]];

  for (let i = 1; i < coords.length; i++) {
    const distFromStart = cumulativeDistances[i];
    const distInSegment = distFromStart - currentSegmentStart;

    // If we've reached or exceeded segment length, finalize current segment
    if (distInSegment >= SEGMENT_LENGTH_METERS) {
      // Add the point that completes this segment
      currentSegmentCoords.push(coords[i]);
      
      // Create segment
      if (currentSegmentCoords.length >= 2) {
        segments.push({
          segmentIndex: currentSegmentIndex,
          segmentId: `${edgeId}_seg_${currentSegmentIndex}`,
          geometry: turf.lineString(currentSegmentCoords),
          startDistance: currentSegmentStart,
          endDistance: distFromStart,
        });
      }

      // Start new segment
      currentSegmentIndex++;
      currentSegmentStart = distFromStart;
      currentSegmentCoords = [coords[i]];
    } else {
      currentSegmentCoords.push(coords[i]);
    }
  }

  // Add final segment if it has any length
  if (currentSegmentCoords.length >= 2 && currentSegmentStart < totalDistance) {
    segments.push({
      segmentIndex: currentSegmentIndex,
      segmentId: `${edgeId}_seg_${currentSegmentIndex}`,
      geometry: turf.lineString(currentSegmentCoords),
      startDistance: currentSegmentStart,
      endDistance: totalDistance,
    });
  }

  return segments;
}

/**
 * Find which segment(s) a GPS point belongs to
 * Returns array of segment indices that the point is closest to (within tolerance)
 */
export function findSegmentsForPoint(
  point: [number, number],
  segments: EdgeSegment[],
  toleranceMeters: number = 10
): number[] {
  const pointFeature = turf.point(point);
  const matchingSegments: number[] = [];

  for (const segment of segments) {
    try {
      const nearest = turf.nearestPointOnLine(segment.geometry, pointFeature, { units: "meters" });
      const distance = nearest.properties?.dist ?? turf.distance(pointFeature, nearest, { units: "meters" });
      
      if (distance <= toleranceMeters) {
        matchingSegments.push(segment.segmentIndex);
      }
    } catch (e) {
      // Skip if calculation fails
      continue;
    }
  }

  return matchingSegments;
}

/**
 * Map GPS coordinates to edge segments
 * Returns a map: edgeId -> Set of segment indices that were traversed
 */
export function mapCoordinatesToSegments(
  coordinates: [number, number][],
  edgeGeometries: Map<string, any>, // edgeId -> LineString geometry
  toleranceMeters: number = 10
): Map<string, Set<number>> {
  const edgeToSegments = new Map<string, Set<number>>();

  // Pre-compute segments for all edges
  const edgeSegmentsCache = new Map<string, EdgeSegment[]>();
  for (const [edgeId, geometry] of edgeGeometries.entries()) {
    try {
      const lineString = geometry.type === "LineString" 
        ? geometry 
        : geometry.type === "Feature" 
          ? geometry.geometry 
          : null;
      
      if (lineString) {
        const segments = splitEdgeIntoSegments(edgeId, lineString);
        edgeSegmentsCache.set(edgeId, segments);
      }
    } catch (e) {
      // Skip if geometry is invalid
      continue;
    }
  }

  // Map each GPS point to segments
  for (const coord of coordinates) {
    // Try to find which edge this point belongs to
    for (const [edgeId, segments] of edgeSegmentsCache.entries()) {
      const matchingIndices = findSegmentsForPoint(coord, segments, toleranceMeters);
      
      if (matchingIndices.length > 0) {
        if (!edgeToSegments.has(edgeId)) {
          edgeToSegments.set(edgeId, new Set());
        }
        for (const idx of matchingIndices) {
          edgeToSegments.get(edgeId)!.add(idx);
        }
      }
    }
  }

  return edgeToSegments;
}

/**
 * Extract segmentId from a combined roadId_segmentId format
 * Returns { edgeId, segmentIndex } or null if not a segment
 */
export function parseSegmentId(segmentId: string): { edgeId: string; segmentIndex: number } | null {
  const match = segmentId.match(/^(.+)_seg_(\d+)$/);
  if (match) {
    return {
      edgeId: match[1],
      segmentIndex: parseInt(match[2], 10),
    };
  }
  return null;
}

/**
 * Check if a roadId is a segment ID (contains _seg_)
 */
export function isSegmentId(roadId: string): boolean {
  return roadId.includes("_seg_");
}

