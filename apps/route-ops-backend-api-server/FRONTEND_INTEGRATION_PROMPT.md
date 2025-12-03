# Frontend Integration: Road Edge Selection & Analytics Flow

## Overview
This document describes how to integrate the road edge selection and analytics flow into your Google Maps frontend. 

## Complete User Flow

### Step 1: Normal Map View → Analytics Mode
1. User clicks **anywhere on the map** (when NOT in focus mode or analytics mode - just normal map view)
2. System calls `/api/roads/nearest-edge` endpoint
3. **If edge found**:
   - Draw GeoJSON road segment on map
   - Enter **analytics mode**
   - Call `/api/surveys/edge-analytics/:edgeId` endpoint
   - Show analytics in **sidebar** (not modal)
4. **If no edge found**:
   - Show message in sidebar: **"This road isn't supported"**
   - Stay in normal mode

### Step 2: Analytics Mode → Focus Mode
5. In analytics mode sidebar:
   - User can toggle checkboxes to exclude surveys/anomalies from calculations
   - User clicks on a **survey name** → Enters **focus mode** for that survey
   - User clicks on an **anomaly name** → Enters **focus mode** + opens hazard remark modal

### Step 3: Existing Flow (Preserved)
6. **Existing functionality must continue to work**:
   - Clicking on a survey line on the map → Focus mode (unchanged)
   - All existing focus mode features work as before
   - This new flow is **additive**, not a replacement

---

## API Endpoint

### GET `/api/roads/nearest-edge`

**Purpose**: Find the nearest road edge to a click location on the map.

**Query Parameters**:
- `lat` (required): Latitude in WGS84 (number)
- `lng` (required): Longitude in WGS84 (number)
- `radiusMeters` (optional): Search radius in meters (default: 200)

**Response Format**:
```json
{
  "edgeId": "15143590",
  "json": {
    "type": "Feature",
    "properties": {
      "edgeId": "15143590",
      "distanceMeters": 5.114490797749058,
      "roadName": "Avenida Marginal",
      "projectId": null
    },
    "geometry": {
      "type": "LineString",
      "coordinates": [[-9.3567886, 38.6863635], [-9.356636, 38.6863394], ...]
    }
  }
}
```

**When no edge found**:
```json
{
  "edgeId": null,
  "json": null
}
```

---

## Integration Steps

### 1. Handle Map Click Event (Normal Mode Only)

**Important**: This should only trigger when the user is in **normal map view** (NOT in focus mode or analytics mode).

```typescript
// Example: In your Google Maps component
// Track current mode state
const [currentMode, setCurrentMode] = useState<'normal' | 'analytics' | 'focus'>('normal');

const handleMapClick = async (event: google.maps.MapMouseEvent) => {
  // Only handle clicks when in normal mode
  if (currentMode !== 'normal') {
    return; // Let existing handlers deal with focus/analytics mode clicks
  }
  
  if (!event.latLng) return;
  
  const lat = event.latLng.lat();
  const lng = event.latLng.lng();
  
  try {
    // Call the nearest-edge endpoint
    const response = await fetch(
      `/api/roads/nearest-edge?lat=${lat}&lng=${lng}&radiusMeters=200`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    if (!data.edgeId || !data.json) {
      // No road edge found within radius
      // Show message in sidebar
      showSidebarMessage('This road isn\'t supported');
      return;
    }
    
    // Extract edgeId for analytics
    const edgeId = data.edgeId;
    
    // Extract GeoJSON Feature for map display
    const geoJsonFeature = data.json;
    
    // 1. Display the road segment on map
    displayRoadSegment(geoJsonFeature);
    
    // 2. Enter analytics mode
    setCurrentMode('analytics');
    
    // 3. Fetch and display analytics in sidebar
    await fetchAndDisplayAnalytics(edgeId);
    
  } catch (error) {
    console.error('Error finding nearest road edge:', error);
    showSidebarMessage('Failed to load road data');
  }
};
```

### 2. Display Road Segment on Google Maps

Use Google Maps Data Layer to display the GeoJSON Feature:

```typescript
const displayRoadSegment = (geoJsonFeature: GeoJSON.Feature) => {
  // Clear any existing road segments
  map.data.forEach((feature) => {
    if (feature.getProperty('isRoadSegment')) {
      map.data.remove(feature);
    }
  });
  
  // Add the new road segment
  map.data.addGeoJson(geoJsonFeature);
  
  // Style the road segment
  map.data.setStyle({
    strokeColor: '#FF0000', // Red line
    strokeWeight: 4,
    strokeOpacity: 0.8
  });
  
  // Set a property to identify this as a road segment
  map.data.forEach((feature) => {
    feature.setProperty('isRoadSegment', true);
  });
  
  // Optionally, fit bounds to the road segment
  const bounds = new google.maps.LatLngBounds();
  const coordinates = (geoJsonFeature.geometry as GeoJSON.LineString).coordinates;
  coordinates.forEach(([lng, lat]) => {
    bounds.extend(new google.maps.LatLng(lat, lng));
  });
  map.fitBounds(bounds);
};
```

### 3. Fetch Road Analytics and Display in Sidebar

Use the `edgeId` to fetch analytics from the existing endpoint and display in the sidebar:

```typescript
const fetchAndDisplayAnalytics = async (edgeId: string) => {
  try {
    // Call the analytics endpoint
    const response = await fetch(
      `/api/surveys/edge-analytics/${edgeId}?from=2024-01-01&to=2024-12-31`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const analytics = await response.json();
    
    // analytics contains:
    // - totalSurveys
    // - totalAnomalies
    // - uniqueUsers
    // - averageEiri
    // - recentSurveys (array) - each has: id, projectId, startTime, etc.
    // - recentAnomalies (array) - each has: id, hazardId, projectId, etc.
    
    // Display analytics in sidebar (analytics mode)
    showAnalyticsInSidebar(analytics, edgeId);
    
  } catch (error) {
    console.error('Error fetching analytics:', error);
    showSidebarMessage('Failed to load analytics');
  }
};

const showAnalyticsInSidebar = (analytics: any, edgeId: string) => {
  // Update sidebar to show:
  // - Analytics summary (totalSurveys, totalAnomalies, uniqueUsers, averageEiri)
  // - List of recent surveys (each with checkbox and clickable name)
  // - List of recent anomalies (each with checkbox and clickable name)
  
  // When survey name is clicked → enter focus mode for that survey
  // When anomaly name is clicked → enter focus mode and open hazard remark modal
};
```

### 4. Handle Survey/Anomaly Selection in Analytics Modal

When users deselect surveys or anomalies in the analytics modal, recalculate analytics:

```typescript
const handleExcludeItems = async (
  edgeId: string,
  excludeSurveyIds: string[],
  excludeAnomalyIds: string[]
) => {
  const params = new URLSearchParams({
    from: '2024-01-01',
    to: '2024-12-31',
    ...(excludeSurveyIds.length > 0 && { 
      excludeSurveyIds: excludeSurveyIds.join(',') 
    }),
    ...(excludeAnomalyIds.length > 0 && { 
      excludeAnomalyIds: excludeAnomalyIds.join(',') 
    })
  });
  
  const response = await fetch(
    `/api/surveys/edge-analytics/${edgeId}?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const updatedAnalytics = await response.json();
  
  // Update the analytics display (but keep all surveys/anomalies in the lists)
  updateAnalyticsDisplay(updatedAnalytics);
};
```

### 5. Handle Survey/Anomaly Click Events in Analytics Mode

When a user clicks on a survey or anomaly **name** (not the checkbox) in the analytics sidebar:

```typescript
const handleSurveyNameClick = (surveyId: string, projectId: string) => {
  // Enter focus mode for this survey
  setCurrentMode('focus');
  
  // Open project detail in focus mode (existing functionality)
  openProjectDetailModal(projectId, { focusMode: true });
  
  // This should work the same way as clicking on a survey line on the map
  // The existing focus mode flow should handle this
};

const handleAnomalyNameClick = (anomalyId: string, hazardId: string, projectId: string) => {
  // Enter focus mode
  setCurrentMode('focus');
  
  // Open project detail in focus mode
  openProjectDetailModal(projectId, { focusMode: true });
  
  // Also open hazard remark modal
  openHazardRemarkModal(hazardId, { focusMode: true });
};
```

**Important**: The existing flow where users click on a survey line on the map to enter focus mode should **continue to work as before**. This new flow is additive and should not break existing functionality.

---

## Complete Flow Example

```typescript
// Complete integration example
class RoadAnalyticsMapHandler {
  private map: google.maps.Map;
  private currentEdgeId: string | null = null;
  private currentMode: 'normal' | 'analytics' | 'focus' = 'normal';
  
  constructor(map: google.maps.Map) {
    this.map = map;
    this.setupMapClickHandler();
  }
  
  private setupMapClickHandler() {
    this.map.addListener('click', async (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      
      // Only handle clicks in normal mode
      // Existing handlers should deal with focus/analytics mode clicks
      if (this.currentMode === 'normal') {
        await this.handleMapClick(event.latLng);
      }
    });
  }
  
  private async handleMapClick(latLng: google.maps.LatLng) {
    const lat = latLng.lat();
    const lng = latLng.lng();
    
    try {
      // 1. Find nearest road edge
      const edgeResponse = await fetch(
        `/api/roads/nearest-edge?lat=${lat}&lng=${lng}&radiusMeters=200`,
        {
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const edgeData = await edgeResponse.json();
      
      if (!edgeData.edgeId || !edgeData.json) {
        // No road found - show message in sidebar
        this.showSidebarMessage('This road isn\'t supported');
        return;
      }
      
      // 2. Store edgeId for analytics
      this.currentEdgeId = edgeData.edgeId;
      
      // 3. Display road segment on map
      this.displayRoadSegment(edgeData.json);
      
      // 4. Enter analytics mode
      this.currentMode = 'analytics';
      
      // 5. Fetch and display analytics in sidebar
      await this.fetchAnalytics(edgeData.edgeId);
      
    } catch (error) {
      console.error('Error:', error);
      this.showSidebarMessage('Failed to load road data');
    }
  }
  
  private displayRoadSegment(geoJsonFeature: GeoJSON.Feature) {
    // Clear previous road segment
    this.map.data.forEach((feature) => {
      if (feature.getProperty('isRoadSegment')) {
        this.map.data.remove(feature);
      }
    });
    
    // Add new road segment
    this.map.data.addGeoJson(geoJsonFeature);
    
    // Style it
    this.map.data.setStyle({
      strokeColor: '#FF0000',
      strokeWeight: 4,
      strokeOpacity: 0.8
    });
    
    // Mark as road segment
    this.map.data.forEach((feature) => {
      feature.setProperty('isRoadSegment', true);
    });
  }
  
  private async fetchAnalytics(edgeId: string) {
    try {
      const response = await fetch(
        `/api/surveys/edge-analytics/${edgeId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const analytics = await response.json();
      
      // Display analytics in sidebar
      this.showAnalyticsInSidebar(analytics, edgeId);
      
    } catch (error) {
      console.error('Error fetching analytics:', error);
      this.showSidebarMessage('Failed to load analytics');
    }
  }
  
  private showAnalyticsInSidebar(analytics: any, edgeId: string) {
    // Update sidebar to show analytics mode:
    // - Analytics summary (totalSurveys, totalAnomalies, uniqueUsers, averageEiri)
    // - List of recent surveys (each with checkbox and clickable name)
    // - List of recent anomalies (each with checkbox and clickable name)
    
    // When checkbox is toggled, recalculate analytics:
    // this.recalculateAnalytics(edgeId, excludeSurveyIds, excludeAnomalyIds);
    
    // When survey name is clicked:
    // this.handleSurveyNameClick(survey.projectId);
    
    // When anomaly name is clicked:
    // this.handleAnomalyNameClick(anomaly.hazardId, anomaly.projectId);
  }
  
  private handleSurveyNameClick(projectId: string) {
    // Enter focus mode
    this.currentMode = 'focus';
    
    // Open project detail in focus mode (existing functionality)
    // This should work the same as clicking on a survey line on the map
    this.openProjectDetailModal(projectId, { focusMode: true });
  }
  
  private handleAnomalyNameClick(hazardId: string, projectId: string) {
    // Enter focus mode
    this.currentMode = 'focus';
    
    // Open project detail in focus mode
    this.openProjectDetailModal(projectId, { focusMode: true });
    
    // Also open hazard remark modal
    this.openHazardRemarkModal(hazardId, { focusMode: true });
  }
  
  private getToken(): string {
    // Your token retrieval logic
    return localStorage.getItem('authToken') || '';
  }
  
  private showSidebarMessage(message: string) {
    // Update sidebar to show message
    // e.g., "This road isn't supported"
  }
  
  // Existing methods for project/hazard modals (should already exist)
  private openProjectDetailModal(projectId: string, options: { focusMode: boolean }) {
    // Your existing implementation
  }
  
  private openHazardRemarkModal(hazardId: string, options: { focusMode: boolean }) {
    // Your existing implementation
  }
}
```

---

## Key Points

1. **Mode Management**: 
   - **Normal mode**: Map clicks trigger road edge search → analytics mode
   - **Analytics mode**: Shows analytics in sidebar, clicking survey/anomaly names → focus mode
   - **Focus mode**: Existing functionality (clicking survey lines on map, etc.)

2. **Response Structure**: The endpoint returns `{ edgeId, json }` where:
   - `edgeId`: Use this for analytics queries
   - `json`: GeoJSON Feature that can be directly loaded into Google Maps using `map.data.addGeoJson()`

3. **Error Handling**: 
   - If `edgeId` is null → Show "This road isn't supported" in sidebar
   - Always check if `edgeId` and `json` are not null before proceeding

4. **Map Display**: Use Google Maps Data Layer (`map.data`) to display the GeoJSON Feature. This automatically handles LineString rendering.

5. **Analytics Integration**: Use the `edgeId` with the existing `/api/surveys/edge-analytics/:edgeId` endpoint.

6. **User Interactions in Analytics Mode**:
   - **Checkbox toggle**: Recalculate analytics with exclusions (surveys/anomalies remain in list)
   - **Survey name click**: Enter focus mode for that survey (same as clicking survey line on map)
   - **Anomaly name click**: Enter focus mode and open hazard remark modal

7. **Existing Flow Preservation**: 
   - Clicking on survey lines on the map to enter focus mode should **continue to work as before**
   - This new flow is additive and should not break existing functionality

8. **Styling**: Customize the road segment appearance using `map.data.setStyle()`.

---

## Testing

Test the integration with:
- **Normal mode clicks**: Different click locations (urban, rural, near roads, far from roads)
- **No road found**: Click in areas without roads → Should show "This road isn't supported" in sidebar
- **Analytics mode**: Verify analytics display correctly in sidebar
- **Survey/anomaly interactions**: 
  - Toggle checkboxes → Analytics recalculate (but items stay in list)
  - Click survey name → Enters focus mode (same as clicking survey line)
  - Click anomaly name → Enters focus mode + opens hazard modal
- **Existing flow**: Verify clicking survey lines on map still works to enter focus mode
- **Mode transitions**: Normal → Analytics → Focus → Normal (back button, etc.)
- **Different radius values**: Small (50m), medium (200m), large (500m)

---

## Example Response

```json
{
  "edgeId": "15143590",
  "json": {
    "type": "Feature",
    "properties": {
      "edgeId": "15143590",
      "distanceMeters": 5.114490797749058,
      "roadName": "Avenida Marginal",
      "projectId": null
    },
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [-9.3567886, 38.6863635],
        [-9.356636, 38.6863394],
        [-9.3564858, 38.686321]
      ]
    }
  }
}
```

---

## Questions?

If you need clarification on any part of this integration, please refer to:
- Swagger documentation at `/api-docs` for endpoint details
- Google Maps Data Layer documentation for GeoJSON rendering
- Existing analytics endpoint documentation for query parameters

