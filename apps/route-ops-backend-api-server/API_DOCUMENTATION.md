# 🚀 RouteOps Backend API Documentation

## **Base URL**: `http://localhost:3000` (or your deployed URL)

---

## **Table of Contents**
1. [Authentication Endpoints](#1-authentication-endpoints)
2. [User Management Endpoints](#2-user-management-endpoints)
3. [City Hall Management Endpoints](#3-city-hall-management-endpoints)
4. [Project Management Endpoints](#4-project-management-endpoints)
5. [Route Point Management Endpoints](#5-route-point-management-endpoints)
6. [Hazard Management Endpoints](#6-hazard-management-endpoints)
7. [Survey Management Endpoints](#7-survey-management-endpoints)
8. [Remark Management Endpoints](#8-remark-management-endpoints)
9. [User Roles & Permissions](#9-user-roles--permissions)
10. [Error Handling](#10-error-handling)

---

## **1. Authentication Endpoints**

### **POST /login**
**Description:** Authenticate user and get access token
**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```
**Response:**
```json
{
  "id": "string",
  "username": "string", 
  "roles": ["string"],
  "accessToken": "string"
}
```
**Example:**
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password123"}'
```

### **GET /userInfo** (Current User Profile)
**Description:** Get current authenticated user information
**Headers:** `Authorization: Bearer <token>`
**Response:**
```json
{
  "id": "string",
  "username": "string",
  "roles": ["string"]
}
```

---

## **2. User Management Endpoints**

### **GET /users**
**Description:** List all users (filtered by role permissions)
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** 
- `skip` (number): Number of records to skip
- `take` (number): Number of records to take
- `where` (object): Filter conditions
- `orderBy` (array): Sorting criteria
**Response:**
```json
[
  {
    "id": "string",
    "username": "string",
    "email": "string | null",
    "firstName": "string | null", 
    "lastName": "string | null",
    "role": "admin | dashboard_user | app_user | null",
    "roles": "object",
    "isActive": "boolean | null",
    "cityHall": {
      "id": "string"
    },
    "createdAt": "string (ISO date)",
    "updatedAt": "string (ISO date)"
  }
]
```

### **GET /users/:id**
**Description:** Get single user by ID
**Headers:** `Authorization: Bearer <token>`
**Response:** Single user object (same structure as above)

### **POST /users**
**Description:** Create new user
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "email": "string | null",
  "firstName": "string | null",
  "lastName": "string | null", 
  "role": "admin | dashboard_user | app_user | null",
  "roles": "object",
  "isActive": "boolean | null",
  "cityHall": {
    "connect": {
      "id": "string"
    }
  }
}
```
**Response:** Created user object

### **PATCH /users/:id**
**Description:** Update existing user
**Headers:** `Authorization: Bearer <token>`
**Request Body:** Same as POST (all fields optional)
**Response:** Updated user object

### **DELETE /users/:id**
**Description:** Delete user
**Headers:** `Authorization: Bearer <token>`
**Response:** Deleted user object

### **GET /users/dashboard-users** (Admin only)
**Description:** Get all dashboard users (Admin only)
**Headers:** `Authorization: Bearer <token>`
**Response:** Array of dashboard users

### **GET /users/app-users**
**Description:** Get app users (filtered by city hall for dashboard users)
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `cityHallId` (optional)
**Response:** Array of app users

### **POST /users/create-with-role**
**Description:** Create user with role-based validation (passwords are automatically hashed)
**Headers:** `Authorization: Bearer <token>`
**Request Body:** Same as POST /users
**Response:** Created user with role validation
**Notes:** 
- Passwords are automatically hashed using bcrypt
- Users can login immediately after creation

### **GET /users/by-city-hall/:cityHallId**
**Description:** Get users by city hall
**Headers:** `Authorization: Bearer <token>`
**Response:** Array of users from specified city hall

### **GET /users/filtered**
**Description:** Get filtered users based on role and permissions
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `role`, `cityHallId`
**Response:** Filtered array of users based on role permissions

### **GET /users/profile**
**Description:** Get current user profile with city hall information
**Headers:** `Authorization: Bearer <token>`
**Response:** Current user profile with city hall info
```json
{
  "id": "string",
  "username": "string",
  "email": "string | null",
  "firstName": "string | null",
  "lastName": "string | null",
  "role": "admin | dashboard_user | app_user | null",
  "roles": "object",
  "isActive": "boolean | null",
  "cityHall": {
    "id": "string",
    "name": "string | null",
    "description": "string | null"
  },
  "createdAt": "string (ISO date)",
  "updatedAt": "string (ISO date)"
}
```

### **GET /users/by-role/:role**
**Description:** Get users by specific role (Admin only)
**Headers:** `Authorization: Bearer <token>`
**Path Parameters:** `role` (admin, dashboard_user, app_user)
**Response:** Array of users with the specified role

### **PATCH /users/:id/city-hall**
**Description:** Update user city hall assignment (Admin only)
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "cityHallId": "string"
}
```
**Response:** Updated user with new city hall assignment

### **GET /users/dashboard/city-hall**
**Description:** Get dashboard user's city hall information (or all city halls for admin)
**Headers:** `Authorization: Bearer <token>`
**Response:** 
- **Dashboard User**: Single city hall object
- **Admin (no city hall)**: All available city halls with message
- **Admin (with city hall)**: Single city hall object

---

## **3. City Hall Management Endpoints**

### **GET /cityHalls**
**Description:** List all city halls
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:**
```json
[
  {
    "id": "string",
    "name": "string | null",
    "description": "string | null",
    "createdAt": "string (ISO date)",
    "updatedAt": "string (ISO date)"
  }
]
```

### **GET /cityHalls/:id**
**Description:** Get single city hall by ID
**Headers:** `Authorization: Bearer <token>`
**Response:** Single city hall object

### **POST /cityHalls**
**Description:** Create new city hall
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "name": "string | null",
  "description": "string | null"
}
```
**Response:** Created city hall object

### **PATCH /cityHalls/:id**
**Description:** Update existing city hall
**Headers:** `Authorization: Bearer <token>`
**Request Body:** Same as POST (all fields optional)
**Response:** Updated city hall object

### **DELETE /cityHalls/:id**
**Description:** Delete city hall
**Headers:** `Authorization: Bearer <token>`
**Response:** Deleted city hall object

### **GET /cityHalls/available**
**Description:** Get available city halls for dropdown (Admin only)
**Headers:** `Authorization: Bearer <token>`
**Response:** List of available city halls ordered by name

---

## **4. Project Management Endpoints**

### **GET /projects**
**Description:** List all projects
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:**
```json
[
  {
    "id": "string",
    "name": "string | null",
    "description": "string | null",
    "status": "string | null",
    "assignedUser": "string | null",
    "createdBy": "string | null",
    "videoUrl": "string | null",
    "cityHall": {
      "id": "string"
    },
    "createdAt": "string (ISO date)",
    "updatedAt": "string (ISO date)"
  }
]
```

### **GET /projects/:id**
**Description:** Get single project by ID
**Headers:** `Authorization: Bearer <token>`
**Response:** Single project object

### **POST /projects**
**Description:** Create new project with simplified payload
**Headers:** `Authorization: Bearer <token>`
**Request Body (Simplified):**
```json
{
  "name": "Road Inspection Project",
  "description": "A comprehensive road inspection project",
  "status": "active",
  "assignedUserId": "user123",
  "cityHallId": "cityhall123",
  "createdBy": "admin",
  "videoUrl": "https://example.com/video.mp4",
  "routePoints": [
    {
      "latitude": 38.7223,
      "longitude": -9.1393,
      "frameNumber": 100,
      "timestamp": 1640995200
    }
  ],
  "hazardIds": ["hazard1", "hazard2"],
  "surveyIds": ["survey1", "survey2"]
}
```
**Request Body (Legacy - still supported):**
```json
{
  "name": "string | null",
  "description": "string | null",
  "status": "string | null",
  "assignedUser": "string | null",
  "createdBy": "string | null",
  "videoUrl": "string | null",
  "cityHall": {
    "connect": {
      "id": "string"
    }
  }
}
```
**Response:** Created project object

**Notes:**
- The simplified payload automatically creates route points from the provided coordinates
- Route points are created first, then connected to the project
- **Auto-hazard generation**: 2-5 random hazards are automatically created and attached to each new project
- Hazard and survey IDs are connected if they exist in the database
- Both simplified and legacy payload formats are supported for backward compatibility

### **PATCH /projects/:id**
**Description:** Update existing project
**Headers:** `Authorization: Bearer <token>`
**Request Body:** Same as POST (all fields optional)
**Response:** Updated project object

### **DELETE /projects/:id**
**Description:** Delete project
**Headers:** `Authorization: Bearer <token>`
**Response:** Deleted project object

### **GET /projects/:id/routePoints**
**Description:** Get route points for a project
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:** Array of route points

### **GET /projects/:id/hazards**
**Description:** Get hazards for a project
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:** Array of hazards

### **GET /projects/:id/surveys**
**Description:** Get surveys for a project
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:** Array of surveys

---

## **5. Route Point Management Endpoints**

### **GET /routePoints**
**Description:** List all route points
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:**
```json
[
  {
    "id": "string",
    "latitude": "number | null",
    "longitude": "number | null",
    "frameNumber": "number | null",
    "timestamp": "number | null",
    "project": {
      "id": "string"
    },
    "createdAt": "string (ISO date)",
    "updatedAt": "string (ISO date)"
  }
]
```

### **GET /routePoints/:id**
**Description:** Get single route point by ID
**Headers:** `Authorization: Bearer <token>`
**Response:** Single route point object

### **POST /routePoints**
**Description:** Create new route point
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "latitude": "number | null",
  "longitude": "number | null",
  "frameNumber": "number | null",
  "timestamp": "number | null",
  "project": {
    "connect": {
      "id": "string"
    }
  }
}
```
**Response:** Created route point object

### **PATCH /routePoints/:id**
**Description:** Update existing route point
**Headers:** `Authorization: Bearer <token>`
**Request Body:** Same as POST (all fields optional)
**Response:** Updated route point object

### **DELETE /routePoints/:id**
**Description:** Delete route point
**Headers:** `Authorization: Bearer <token>`
**Response:** Deleted route point object

---

## **6. Hazard Management Endpoints**

### **GET /hazards**
**Description:** List all hazards
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:**
```json
[
  {
    "id": "string",
    "description": "string | null",
    "severity": "string | null",
    "typeField": "string | null",
    "latitude": "number | null",
    "longitude": "number | null",
    "imageUrl": "string | null",
    "createdBy": "string | null",
    "project": {
      "id": "string"
    },
    "routePoint": {
      "id": "string"
    },
    "createdAt": "string (ISO date)",
    "updatedAt": "string (ISO date)"
  }
]
```

### **GET /hazards/:id**
**Description:** Get single hazard by ID with all remarks
**Headers:** `Authorization: Bearer <token>`
**Response:** Single hazard object with remarks array
```json
{
  "id": "string",
  "description": "string | null",
  "severity": "string | null",
  "typeField": "string | null",
  "latitude": "number | null",
  "longitude": "number | null",
  "imageUrl": "string | null",
  "createdBy": "string | null",
  "project": {
    "id": "string"
  },
  "routePoint": {
    "id": "string"
  },
  "remarks": [
    {
      "id": "string",
      "text": "string | null",
      "timestamp": "string (ISO date) | null",
      "createdAt": "string (ISO date)",
      "user": {
        "id": "string",
        "username": "string",
        "firstName": "string | null",
        "lastName": "string | null"
      },
      "survey": {
        "id": "string",
        "name": "string | null",
        "status": "string | null"
      }
    }
  ],
  "createdAt": "string (ISO date)",
  "updatedAt": "string (ISO date)"
}
```

### **POST /hazards**
**Description:** Create new hazard
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "description": "string | null",
  "severity": "string | null",
  "typeField": "string | null",
  "latitude": "number | null",
  "longitude": "number | null",
  "imageUrl": "string | null",
  "createdBy": "string | null",
  "project": {
    "connect": {
      "id": "string"
    }
  },
  "routePoint": {
    "connect": {
      "id": "string"
    }
  }
}
```
**Response:** Created hazard object

### **PATCH /hazards/:id**
**Description:** Update existing hazard
**Headers:** `Authorization: Bearer <token>`
**Request Body:** Same as POST (all fields optional)
**Response:** Updated hazard object

### **DELETE /hazards/:id**
**Description:** Delete hazard
**Headers:** `Authorization: Bearer <token>`
**Response:** Deleted hazard object

### **POST /hazards/:id/remarks**
**Description:** Add a remark to a hazard
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "text": "This pothole needs immediate attention. It's causing traffic issues.",
  "timestamp": "2024-01-15T10:30:00Z"
}
```
**Response:** Created remark object with survey information
**Notes:** 
- Automatically creates a survey for the user if they don't have an active one for the project
- Subsequent remarks from the same user are added to the same survey
- Links the remark to both the hazard and the survey

### **GET /hazards/:id/remarks**
**Description:** Get all remarks for a hazard
**Headers:** `Authorization: Bearer <token>`
**Response:** Array of remark objects ordered by creation date (newest first)

---

## **7. Survey Management Endpoints**

### **GET /surveys**
**Description:** List all surveys
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:**
```json
[
  {
    "id": "string",
    "name": "string | null",
    "status": "string | null",
    "remarks": "string | null",
    "assignedUser": "string | null",
    "startTime": "string (ISO date) | null",
    "endTime": "string (ISO date) | null",
    "project": {
      "id": "string"
    },
    "createdAt": "string (ISO date)",
    "updatedAt": "string (ISO date)"
  }
]
```

### **GET /surveys/:id**
**Description:** Get single survey by ID
**Headers:** `Authorization: Bearer <token>`
**Response:** Single survey object

### **POST /surveys**
**Description:** Create new survey
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "name": "string | null",
  "status": "string | null",
  "remarks": "string | null",
  "assignedUser": "string | null",
  "startTime": "string (ISO date) | null",
  "endTime": "string (ISO date) | null",
  "project": {
    "connect": {
      "id": "string"
    }
  }
}
```
**Response:** Created survey object

### **PATCH /surveys/:id**
**Description:** Update existing survey
**Headers:** `Authorization: Bearer <token>`
**Request Body:** Same as POST (all fields optional)
**Response:** Updated survey object

### **DELETE /surveys/:id**
**Description:** Delete survey
**Headers:** `Authorization: Bearer <token>`
**Response:** Deleted survey object

---

## **8. Remark Management Endpoints**

### **GET /remarks**
**Description:** List all remarks
**Headers:** `Authorization: Bearer <token>`
**Query Parameters:** `skip`, `take`, `where`, `orderBy`
**Response:**
```json
[
  {
    "id": "string",
    "text": "string | null",
    "timestamp": "string (ISO date) | null",
    "user": {
      "id": "string"
    },
    "createdAt": "string (ISO date)",
    "updatedAt": "string (ISO date)"
  }
]
```

### **GET /remarks/:id**
**Description:** Get single remark by ID
**Headers:** `Authorization: Bearer <token>`
**Response:** Single remark object

### **POST /remarks**
**Description:** Create new remark
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "text": "string | null",
  "timestamp": "string (ISO date) | null",
  "user": {
    "connect": {
      "id": "string"
    }
  }
}
```
**Response:** Created remark object

### **PATCH /remarks/:id**
**Description:** Update existing remark
**Headers:** `Authorization: Bearer <token>`
**Request Body:** Same as POST (all fields optional)
**Response:** Updated remark object

### **DELETE /remarks/:id**
**Description:** Delete remark
**Headers:** `Authorization: Bearer <token>`
**Response:** Deleted remark object

---

## **9. User Roles & Permissions**

### **Role Types:**
- **`admin`**: Full access to all resources
- **`dashboard_user`**: Limited to their assigned city hall
- **`app_user`**: Read-only access to their own data

### **Permission Matrix:**

| Role | Users | City Halls | Projects | Hazards | Surveys | Remarks |
|------|-------|------------|----------|---------|---------|---------|
| **Admin** | CRUD All | CRUD All | CRUD All | CRUD All | CRUD All | CRUD All |
| **Dashboard User** | CRUD App Users (own city hall only) | Read Own | CRUD Own | CRUD Own | CRUD Own | CRUD Own |
| **App User** | Read Own | Read Own | Read Own | Read Own | Read Own | Read Own |

### **City Hall Assignment Rules:**
- **Admin**: Can assign users to any city hall
- **Dashboard User**: Can only assign app users to their own city hall
- **App User**: Cannot assign users to city halls

---

## **10. Error Handling**

### **Common HTTP Status Codes:**
- **200**: Success
- **201**: Created
- **400**: Bad Request
- **401**: Unauthorized
- **403**: Forbidden
- **404**: Not Found
- **409**: Conflict
- **500**: Internal Server Error

### **Error Response Format:**
```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

### **Authentication Errors:**
```json
{
  "statusCode": 401,
  "message": "The passed credentials are incorrect",
  "error": "Unauthorized"
}
```

### **Permission Errors:**
```json
{
  "statusCode": 403,
  "message": "Insufficient privileges to complete the operation",
  "error": "Forbidden"
}
```

---

## **11. Example Usage**

### **Login Flow:**
```javascript
// 1. Login
const loginResponse = await fetch('/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'password123'
  })
});
const { accessToken } = await loginResponse.json();

// 2. Use token for subsequent requests
const usersResponse = await fetch('/users', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
const users = await usersResponse.json();
```

### **Create User with Role Validation:**
```javascript
const createUserResponse = await fetch('/users/create-with-role', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    username: 'newuser',
    password: 'password123',
    role: 'app_user',
    cityHall: { connect: { id: 'cityHallId' } }
  })
});
```

### **Get Filtered Users:**
```javascript
// Get app users from specific city hall
const appUsersResponse = await fetch('/users/app-users?cityHallId=cityHallId', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
const appUsers = await appUsersResponse.json();
```

---

## **12. Notes for Frontend Integration**

1. **Authentication**: Always include the `Authorization: Bearer <token>` header for protected endpoints
2. **Role-based UI**: Use the user's role to show/hide features and data
3. **City Hall Filtering**: Dashboard users should only see data from their assigned city hall
4. **Error Handling**: Implement proper error handling for 401, 403, and other status codes
5. **Pagination**: Use `skip` and `take` parameters for pagination
6. **Filtering**: Use the `where` parameter for complex filtering
7. **Sorting**: Use the `orderBy` parameter for sorting results

---

## **13. Development Setup**

### **Local Development:**
```bash
# Install dependencies
npm install

# Start development server
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod
```

### **Environment Variables:**
- `DB_URL`: MongoDB connection string
- `JWT_SECRET`: JWT secret key
- `JWT_EXPIRATION`: JWT expiration time

---

**Last Updated:** December 2024  
**API Version:** 1.0.0
