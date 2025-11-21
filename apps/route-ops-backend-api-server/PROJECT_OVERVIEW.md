# RouteOps Backend - Project Overview

## 🎯 What This System Does

**RouteOps** is a **road inspection and quality assessment system** that helps cities/municipalities:
- Monitor road conditions in real-time
- Track road quality using eIRI (International Roughness Index)
- Identify hazards/anomalies (potholes, cracks, etc.)
- Visualize inspection data on maps
- Manage multiple entities (City Halls/Municipalities)

---

## 📱 Two Applications

### 1. **Mobile App** (Field Inspectors)
- Used by field workers (`app_user` role)
- Records road inspections while driving/walking
- Captures GPS coordinates, eIRI values, and photos/videos
- Reports hazards/anomalies found during inspection

### 2. **Dashboard** (Administrators)
- Used by admins and managers (`admin`, `dashboard_user` roles)
- Views all inspection data on Google Maps
- Sees road quality color-coded by eIRI values
- Manages users, entities, and projects

---

## 🔄 Complete Workflow

### **Mobile App Flow:**

```
1. Field Inspector Logs In
   ↓
2. Starts a Project
   POST /api/mobile/project/start
   - Provides starting location (lat/lng)
   - Gets back projectId
   ↓
3. While Inspecting Road
   - App records GPS coordinates continuously
   - Measures eIRI values (road roughness)
   - User marks anomalies (potholes, cracks, etc.)
   - App uploads photos/videos to Firebase Storage
   ↓
4. Ends Project
   POST /api/mobile/project/end
   - Sends all collected data:
     * Geometry: GeoJSON FeatureCollection with all GPS points + eIRI values
     * Anomalies: Array of hazards found (lat, lng, remarks, severity)
     * Attachments: Number of photos/videos uploaded
   - Backend creates:
     * Survey: With LineString geometry for map display
     * Hazards: For each anomaly reported
   ↓
5. Project Status = "completed"
```

### **Dashboard Flow:**

```
1. Admin/Manager Logs In
   ↓
2. Views Map (Google Maps)
   GET /api/projects
   - Fetches all projects with their surveys
   ↓
3. Map Displays:
   - Each project shows as a LINE on the map
   - Line color based on eIRI average:
     * RED = Bad road (high eIRI)
     * YELLOW = Medium
     * GREEN = Good road (low eIRI)
   - Markers for hazards/anomalies
   ↓
4. Click Project → See Details
   GET /api/projects/:id
   - Shows full project info
   - Lists all hazards found
   - Shows survey geometry
```

---

## 🗄️ Data Structure

### **Core Models:**

1. **Project**
   - Represents one inspection session
   - Status: `active` → `completed`
   - Belongs to an Entity (CityHall)
   - Has many: RoutePoints, Surveys, Hazards

2. **Survey** ⭐ **KEY FOR MAP DISPLAY**
   - Created when mobile app ends a project
   - Contains: `geometryJson` (GeoJSON LineString) ← **Used to draw lines on map**
   - Contains: `bbox` (bounding box for map zoom)
   - Contains: `eIriAvg` (average road quality) ← **Used for color coding**
   - Contains: `lengthMeters` (total distance inspected)

3. **Hazard** (Anomaly)
   - Individual problem found during inspection
   - Has: lat/lng, description, severity, imageUrl

4. **RoutePoint**
   - Individual GPS coordinates collected
   - Used for detailed tracking

5. **Entity (CityHall)**
   - Represents a municipality/city
   - Has settings: `allowVideo`, `allowImages`
   - Users belong to one entity

---

## ✅ Current Implementation Status

### **What's Working:**

✅ **Mobile Endpoints:**
- `POST /api/mobile/project/start` - Creates project, returns projectId
- `POST /api/mobile/project/end` - Creates survey with geometry, creates hazards
- `POST /api/mobile/attachments` - Placeholder for file uploads
- `GET /api/mobile/project/:id/status` - Check sync status
- `GET /api/mobile/user` - Get user profile
- `GET /api/mobile/entity/:id` - Get entity info

✅ **Dashboard Endpoints:**
- `GET /api/projects` - **Now includes surveys with geometryJson** ⭐
- `GET /api/projects/:id` - **Now includes surveys, routePoints, hazards** ⭐
- `POST /api/projects` - Create projects (admin)

✅ **Survey Data Available:**
- `geometryJson`: GeoJSON LineString ready for Google Maps
- `bbox`: Bounding box [minLng, minLat, maxLng, maxLat]
- `eIriAvg`: Average eIRI value (for color coding)
- `lengthMeters`: Survey length

✅ **User Management:**
- Role-based access (admin, dashboard_user, app_user)
- Entity scoping (dashboard users only see their entity)
- User CRUD operations

### **What Needs Clarification/Enhancement:**

⚠️ **Potential Gaps:**

1. **File Uploads** - Currently placeholder
   - Should integrate Firebase Storage
   - Update attachment upload endpoint

2. **Supported Area GIS** - Currently returns empty
   - `GET /api/mobile/entity/supported-area/:version`
   - Should return actual GeoJSON for supported inspection areas

3. **eIRI Color Coding Logic** - Not implemented in backend
   - Frontend should implement color thresholds:
     - Red: eIriAvg > 3.0
     - Yellow: 2.0 < eIriAvg <= 3.0
     - Green: eIriAvg <= 2.0

4. **Multiple Surveys Per Project** - Currently one survey per project
   - Mobile app ends project → creates one survey
   - If mobile app can resume/progress, may need multiple surveys

---

## 🎨 Frontend Integration Guide

### **For Dashboard (Google Maps):**

```typescript
// 1. Fetch projects
const projects = await fetch('/api/projects').then(r => r.json());

// 2. For each project, draw lines using surveys
projects.forEach(project => {
  project.surveys?.forEach(survey => {
    if (survey.geometryJson) {
      // Draw line on Google Maps
      const line = new google.maps.Polyline({
        path: survey.geometryJson.coordinates.map(coord => ({
          lat: coord[1],  // GeoJSON is [lng, lat]
          lng: coord[0]
        })),
        strokeColor: getColorFromEIri(survey.eIriAvg), // Red/Yellow/Green
        strokeWeight: 4
      });
      line.setMap(map);
    }
  });
});

function getColorFromEIri(eIriAvg: number | null): string {
  if (!eIriAvg) return '#gray';
  if (eIriAvg > 3.0) return '#red';      // Bad road
  if (eIriAvg > 2.0) return '#yellow';  // Medium
  return '#green';                        // Good road
}
```

### **For Mobile App:**

```typescript
// 1. Start project
const { projectId } = await fetch('/api/mobile/project/start', {
  method: 'POST',
  body: JSON.stringify({
    lat: 38.7223,
    lng: -9.1393,
    date: new Date().toISOString(),
    remarks: "Starting inspection"
  })
}).then(r => r.json());

// 2. Collect data while inspecting...

// 3. End project
await fetch('/api/mobile/project/end', {
  method: 'POST',
  body: JSON.stringify({
    projectId,
    numAttachments: { images: 5, video: 1 },
    geometry: {
      type: "FeatureCollection",
      features: collectedPoints.map(pt => ({
        type: "Feature",
        properties: { eIri: pt.eIri },
        geometry: {
          type: "Point",
          coordinates: [pt.lng, pt.lat]
        }
      }))
    },
    anomalies: foundHazards.map(h => ({
      lat: h.lat,
      lng: h.lng,
      remarks: h.description,
      severity: h.severity
    }))
  })
});
```

---

## 🔍 Alignment Check

### **Requirements vs Implementation:**

| Requirement | Status | Notes |
|------------|--------|-------|
| Mobile app starts project | ✅ | Returns projectId |
| Mobile app ends project with geometry | ✅ | Creates survey with GeoJSON LineString |
| Dashboard displays projects as lines | ✅ | Survey.geometryJson available |
| Color coding by eIRI | ⚠️ | Backend provides eIriAvg, frontend implements colors |
| Track hazards/anomalies | ✅ | Hazards created from anomalies array |
| User roles (admin/dashboard/app) | ✅ | Fully implemented |
| Entity scoping | ✅ | Dashboard users see only their entity |
| File uploads | ⚠️ | Placeholder ready for Firebase Storage |
| Multiple entities | ✅ | CityHall/Entity model supports this |

---

## 📝 Summary

**What We Have:**
- Complete mobile workflow (start → collect → end → sync)
- Survey geometry data stored and accessible
- Dashboard can fetch projects with survey lines
- User management with roles and entity scoping
- Hazard tracking system

**What's Missing/Needs Implementation:**
- Firebase Storage integration for actual file uploads
- Supported area GIS data (currently empty)
- Frontend color coding logic (backend provides data)

**The system is functionally complete for the core workflow!** The geometry data is stored correctly and available for the frontend to display on maps. The main remaining work is:
1. Integrating Firebase Storage
2. Implementing color logic on frontend
3. Populating supported area data if needed

---

## ❓ Questions for Client

1. **Should one project have multiple surveys?** (e.g., if mobile app pauses/resumes)
2. **What are the exact eIRI color thresholds?** (Currently suggested: >3.0 red, 2.0-3.0 yellow, <2.0 green)
3. **Do we need supported area GIS data?** (Or is it fine to return empty for now?)
4. **File upload flow:** Should mobile app upload directly to Firebase, or through backend?

