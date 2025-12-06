# Frontend Integration Guide: Road Ratings System

## Overview

The backend now supports a new road rating system that replaces the previous survey line display. Instead of drawing lines from individual surveys, the frontend should now:

1. **Load all rated roads** for the user's entity on dashboard initialization
2. **Fetch geometries** for those rated roads from GeoPackage files
3. **Draw road lines** on the map colored by their EIRI ratings
4. **Maintain existing click flow** - clicking on roads still triggers nearest-edge search → analytics

## Architecture Changes

### Before
- Survey lines were drawn from `Survey.geometryJson` data
- Each survey had its own line on the map

### After
- **Road ratings** are aggregated per `roadId` (edgeId) per entity
- **One line per road** showing the current/averaged EIRI rating
- Lines are fetched from GeoPackage files (same source as nearest-edge search)

## API Endpoints

### 1. Get Road Ratings for Map (Recommended - Replaces /api/surveys/map)

**Endpoint:** `GET /api/roads/map`

**Authentication:** Required (Bearer token)

**Description:** Returns road ratings with geometries filtered by bbox, time window, eIRI range, operator, and status. This is the replacement for `/api/surveys/map` when displaying road ratings on the map.

**Query Parameters:**
- `bbox` (required): `minLng,minLat,maxLng,maxLat` - Bounding box for map viewport
- `months` (optional): Lookback window in months (default 6)
- `startDate` (optional): Start date filter (DD/MM/YYYY)
- `endDate` (optional): End date filter (DD/MM/YYYY)
- `eiriMin` (optional): Minimum eIRI value
- `eiriMax` (optional): Maximum eIRI value
- `eiriRange` (optional): eIRI range (e.g., '0-1.5')
- `operator` (optional): Filter by operator (project creator)
- `operatorId` (optional): Filter by operator ID (project creator)
- `status` (optional): Filter by project status

**Response:**
```json
[
  {
    "roadId": "15143590",
    "eiri": 2.5,
    "geometry": {
      "type": "LineString",
      "coordinates": [[-9.1393, 38.7223], [-9.1394, 38.7224], ...]
    },
    "color": "light_orange"
  }
]
```

**Usage:**
```typescript
// Replace your existing /api/surveys/map call with this
const response = await fetch(
  `/api/roads/map?bbox=${minLng},${minLat},${maxLng},${maxLat}&months=6`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
const roadRatings = await response.json();
// roadRatings = [{ roadId, eiri, geometry, color }, ...]

// Draw each road on the map
roadRatings.forEach(rating => {
  const path = rating.geometry.coordinates.map(coord => ({
    lat: coord[1],
    lng: coord[0]
  }));

  const polyline = new google.maps.Polyline({
    path: path,
    strokeColor: rating.color, // Already includes color based on EIRI
    strokeWeight: 4,
    strokeOpacity: 0.8,
    map: mapInstance
  });
});
```

### 2. Get Road Ratings for Entity (Alternative - For Tile Provider)

**Endpoint:** `GET /api/roads/ratings`

**Authentication:** Required (Bearer token)

**Description:** Returns all road ratings for the authenticated user's entity (cityHall).

**Response:**
```json
[
  {
    "roadId": "15143590",
    "eiri": 2.5
  },
  {
    "roadId": "15143591",
    "eiri": 3.2
  }
]
```

**Usage:**
```typescript
// Fetch on dashboard load
const response = await fetch('/api/roads/ratings', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const ratings = await response.json();
// ratings = [{ roadId: "15143590", eiri: 2.5 }, ...]
```

### 2. Get Geometries for Road IDs

**Endpoint:** `POST /api/roads/geometries`

**Authentication:** Required (Bearer token)

**Description:** Returns GeoJSON geometries for the specified roadIds from GeoPackage files.

**Request Body:**
```json
{
  "roadIds": ["15143590", "15143591", "15143592"]
}
```

**Response:**
```json
{
  "15143590": {
    "type": "LineString",
    "coordinates": [[-9.1393, 38.7223], [-9.1394, 38.7224], ...]
  },
  "15143591": {
    "type": "LineString",
    "coordinates": [[-9.1400, 38.7230], [-9.1401, 38.7231], ...]
  }
}
```

**Usage:**
```typescript
// Fetch geometries for all rated roads
const roadIds = ratings.map(r => r.roadId);
const response = await fetch('/api/roads/geometries', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ roadIds })
});
const geometries = await response.json();
// geometries = { "15143590": { type: "LineString", coordinates: [...] }, ... }
```

## Implementation Flow

### Step 1: Dashboard Initialization

**Option A: Use `/api/roads/map` (Recommended - Handles Filters & Bbox)**

When the user opens the dashboard or map viewport changes:

1. **Fetch road ratings for current map viewport** with filters
   ```typescript
   const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
   const ratings = await fetch(`/api/roads/map?bbox=${bbox}&months=6`, {
     headers: { 'Authorization': `Bearer ${token}` }
   }).then(r => r.json());
   // Returns: [{ roadId, eiri, geometry, color }]
   ```

2. **Draw roads directly** (geometries and colors are already included)
   ```typescript
   ratings.forEach(rating => {
     const path = rating.geometry.coordinates.map(coord => ({
       lat: coord[1], lng: coord[0]
     }));
     
     new google.maps.Polyline({
       path,
       strokeColor: rating.color,
       strokeWeight: 4,
       strokeOpacity: 0.8,
       map: mapInstance
     });
   });
   ```

**Option B: Use Separate Endpoints (For Tile Provider or Custom Logic)**

When the user opens the dashboard:

1. **Fetch road ratings** for their entity
   ```typescript
   const ratings = await fetchRoadRatings();
   // Returns: [{ roadId: string, eiri: number }]
   ```

2. **Extract roadIds** from ratings
   ```typescript
   const roadIds = ratings.map(r => r.roadId);
   ```

3. **Fetch geometries** for all roadIds (batch request)
   ```typescript
   const geometries = await fetchGeometries(roadIds);
   // Returns: { [roadId]: GeoJSON geometry }
   ```

4. **Create map features** combining ratings and geometries
   ```typescript
   const roadFeatures = ratings.map(rating => ({
     roadId: rating.roadId,
     eiri: rating.eiri,
     geometry: geometries[rating.roadId],
     color: getEiriColor(rating.eiri) // Your color mapping function
   })).filter(f => f.geometry); // Filter out roads without geometry
   ```

### Step 2: Draw Roads on Map

Draw each road as a line on the map using your mapping library (Google Maps, Leaflet, etc.):

```typescript
// Example for Google Maps
roadFeatures.forEach(feature => {
  const path = feature.geometry.coordinates.map(coord => ({
    lat: coord[1], // GeoJSON is [lng, lat]
    lng: coord[0]
  }));

  const polyline = new google.maps.Polyline({
    path: path,
    strokeColor: feature.color,
    strokeWeight: 4,
    strokeOpacity: 0.8,
    map: mapInstance
  });

  // Store reference for later (click handling, updates, etc.)
  roadLinesMap.set(feature.roadId, {
    polyline,
    eiri: feature.eiri,
    roadId: feature.roadId
  });
});
```

### Step 3: EIRI Color Coding

Implement your EIRI color scale. Example:

```typescript
function getEiriColor(eiri: number): string {
  // Adjust thresholds and colors based on your requirements
  if (eiri < 1.5) return '#00FF00'; // Green - Excellent
  if (eiri < 2.5) return '#90EE90'; // Light Green - Good
  if (eiri < 3.5) return '#FFFF00'; // Yellow - Fair
  if (eiri < 4.5) return '#FFA500'; // Orange - Poor
  return '#FF0000'; // Red - Very Poor
}
```

### Step 4: Handle Map Clicks (Existing Flow)

**Keep your existing click handling unchanged:**

1. User clicks on map → Call `GET /api/roads/nearest-edge?lat=...&lng=...`
2. Get `edgeId` and GeoJSON from response
3. Show analytics sidebar with `GET /api/surveys/edge-analytics/:edgeId`
4. Display survey/anomaly data

**Note:** The road rating lines are for **visualization only**. Clicking on them should still trigger the nearest-edge search (which may or may not match the clicked road, depending on click precision).

## Performance Considerations

### Batch Geometry Requests

- **Don't** fetch geometries one-by-one for each roadId
- **Do** batch all roadIds into a single `POST /api/roads/geometries` request
- The endpoint is optimized to handle large batches efficiently

### Caching Strategy

Consider caching:
- **Road ratings** - Refresh when new surveys are completed
- **Geometries** - Cache indefinitely (roads don't change frequently)
- **Map lines** - Reuse existing polylines when updating ratings

### Lazy Loading (Optional)

For large datasets, consider:
- Load ratings for visible map bounds only
- Use tile-based loading if you implement a tile provider
- Paginate or chunk geometry requests if needed

## Error Handling

```typescript
try {
  const ratings = await fetchRoadRatings();
  if (!ratings || ratings.length === 0) {
    // No rated roads yet - show empty map or message
    return;
  }

  const roadIds = ratings.map(r => r.roadId);
  const geometries = await fetchGeometries(roadIds);

  // Filter out roads without geometries
  const validRoads = ratings.filter(r => geometries[r.roadId]);

  // Draw roads...
} catch (error) {
  console.error('Failed to load road ratings:', error);
  // Show error message to user
}
```

## Example: Complete Integration

```typescript
class RoadRatingsManager {
  private map: google.maps.Map;
  private roadLines: Map<string, any> = new Map();

  async loadRoadRatings() {
    try {
      // 1. Fetch ratings
      const ratings = await this.fetchRatings();
      if (ratings.length === 0) return;

      // 2. Fetch geometries
      const roadIds = ratings.map(r => r.roadId);
      const geometries = await this.fetchGeometries(roadIds);

      // 3. Draw on map
      ratings.forEach(rating => {
        const geometry = geometries[rating.roadId];
        if (!geometry) return;

        this.drawRoadLine(rating.roadId, geometry, rating.eiri);
      });
    } catch (error) {
      console.error('Failed to load road ratings:', error);
    }
  }

  private async fetchRatings() {
    const response = await fetch('/api/roads/ratings', {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch ratings');
    return response.json();
  }

  private async fetchGeometries(roadIds: string[]) {
    const response = await fetch('/api/roads/geometries', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ roadIds })
    });
    if (!response.ok) throw new Error('Failed to fetch geometries');
    return response.json();
  }

  private drawRoadLine(roadId: string, geometry: any, eiri: number) {
    const path = geometry.coordinates.map(([lng, lat]: number[]) => ({
      lat,
      lng
    }));

    const polyline = new google.maps.Polyline({
      path,
      strokeColor: this.getEiriColor(eiri),
      strokeWeight: 4,
      strokeOpacity: 0.8,
      map: this.map
    });

    this.roadLines.set(roadId, { polyline, eiri, roadId });
  }

  private getEiriColor(eiri: number): string {
    if (eiri < 1.5) return '#00FF00';
    if (eiri < 2.5) return '#90EE90';
    if (eiri < 3.5) return '#FFFF00';
    if (eiri < 4.5) return '#FFA500';
    return '#FF0000';
  }

  // Call this when map is initialized
  async initialize() {
    await this.loadRoadRatings();
  }
}
```

## Migration Checklist

- [ ] Remove old survey line drawing code
- [ ] Implement `GET /api/roads/ratings` call on dashboard load
- [ ] Implement `POST /api/roads/geometries` batch request
- [ ] Create road line drawing logic with EIRI color coding
- [ ] Test with empty ratings (no roads rated yet)
- [ ] Test with large number of rated roads
- [ ] Verify existing click → analytics flow still works
- [ ] Add error handling and loading states
- [ ] Consider caching strategy for performance

## Questions?

If you encounter issues or need clarification:
- Check API responses in browser DevTools
- Verify authentication token is included in headers
- Ensure `roadId` values match between ratings and geometries
- Contact backend team if geometries are missing for certain roadIds

