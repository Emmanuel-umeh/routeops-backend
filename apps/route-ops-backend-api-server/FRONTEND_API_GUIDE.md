# 🚀 RouteOps Frontend API Integration Guide

## **Base URL**: `http://localhost:3000` (or your deployed URL)

---

## **Table of Contents**
1. [Authentication Flow](#1-authentication-flow)
2. [User Role Management](#2-user-role-management)
3. [City Hall Management](#3-city-hall-management)
4. [User Management by Role](#4-user-management-by-role)
5. [Project Management](#5-project-management)
6. [Hazard Management](#6-hazard-management)
7. [Error Handling](#7-error-handling)
8. [Complete User Flow Examples](#8-complete-user-flow-examples)

---

## **1. Authentication Flow**

### **Login**
```bash
POST /login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}
```

**Response:**
```json
{
  "id": "68f22fdb787fcb32ef43987c",
  "username": "admin",
  "roles": ["admin"],
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### **Get Current User Profile**
```bash
GET /users/profile
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "id": "68f22fdb787fcb32ef43987c",
  "username": "admin",
  "email": "admin@routeops.com",
  "firstName": "System",
  "lastName": "Administrator",
  "role": "admin",
  "roles": ["admin"],
  "isActive": true,
  "cityHall": {
    "id": "68f25aaa9873992efeef91ab",
    "name": "Lisbon",
    "description": "Lisbon City Hall - Main administrative center"
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

## **2. User Role Management**

### **🔍 Project Scope - User Roles**

#### **1. Admin**
- **Full access** to all resources
- Can create, read, update, and delete both Dashboard Users and App Users
- When creating Dashboard Users, must assign a City Hall (Lisbon, Olhão)
- Only Admin can assign or change City Hall for Dashboard Users
- When creating App Users, can assign them under any city or City Hall

#### **2. Dashboard User**
- Created by Admin
- Assigned to **one City Hall only** (e.g., Lisbon)
- **Permissions:**
  - Can only manage (CRUD) App Users under their assigned city only
  - Cannot manage Dashboard Users
  - Cannot see or select other cities
  - Cannot change the city assignment

#### **3. App User**
- Created by Admin or Dashboard User
- Assigned to one City Hall
- Used for mobile app authentication and data access

---

## **3. City Hall Management**

### **Get Available City Halls (Admin Only)**
```bash
GET /cityHalls/available
Authorization: Bearer <adminToken>
```

**Response:**
```json
[
  {
    "id": "68f25aaa9873992efeef91ab",
    "name": "Lisbon",
    "description": "Lisbon City Hall - Main administrative center",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  {
    "id": "68f25aaa9873992efeef91ac",
    "name": "Olhão",
    "description": "Olhão City Hall - Regional administrative center",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
]
```

### **Get Dashboard User's City Hall**
```bash
GET /users/dashboard/city-hall
Authorization: Bearer <dashboardUserToken>
```

**Response:**
```json
{
  "id": "68f25aaa9873992efeef91ab",
  "name": "Lisbon",
  "description": "Lisbon City Hall - Main administrative center",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

## **4. User Management by Role**

### **Get Users by Role (Admin Only)**
```bash
GET /users/by-role/dashboard_user
Authorization: Bearer <adminToken>

GET /users/by-role/app_user
Authorization: Bearer <adminToken>
```

**Response:**
```json
[
  {
    "id": "68f22fdb787fcb32ef43987d",
    "username": "dashboard.lisbon",
    "email": "dashboard.lisbon@routeops.com",
    "firstName": "Lisbon",
    "lastName": "Dashboard User",
    "role": "dashboard_user",
    "roles": ["dashboard_user"],
    "isActive": true,
    "cityHall": {
      "id": "68f25aaa9873992efeef91ab",
      "name": "Lisbon"
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
]
```

### **Get Dashboard Users (Admin Only)**
```bash
GET /users/dashboard-users
Authorization: Bearer <adminToken>
```

### **Get App Users (Filtered by City Hall)**
```bash
# Admin can see all app users
GET /users/app-users
Authorization: Bearer <adminToken>

# Dashboard User can only see app users from their city hall
GET /users/app-users
Authorization: Bearer <dashboardUserToken>
```

### **Get Users by City Hall**
```bash
GET /users/by-city-hall/68f25aaa9873992efeef91ab
Authorization: Bearer <adminToken>
```

### **Create User with Role Validation**
**Note:** Passwords are automatically hashed - users can login immediately after creation.

```bash
POST /users/create-with-role
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "new.app.user",
  "password": "password123",
  "email": "new.app.user@routeops.com",
  "firstName": "New",
  "lastName": "App User",
  "role": "app_user",
  "roles": ["app_user"],
  "isActive": true,
  "cityHall": {
    "connect": {
      "id": "68f25aaa9873992efeef91ab"
    }
  }
}
```

### **Update User City Hall Assignment (Admin Only)**
```bash
PATCH /users/68f22fdb787fcb32ef43987d/city-hall
Authorization: Bearer <adminToken>
Content-Type: application/json

{
  "cityHallId": "68f25aaa9873992efeef91ac"
}
```

---

## **5. Project Management**

### **Create Project with Simplified Payload**
```bash
POST /projects
Authorization: Bearer <token>
Content-Type: application/json

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

**Notes:**
- Route points are created automatically from coordinates
- **Auto-hazard generation**: 2-5 random hazards are automatically created and attached
- Hazard and survey IDs are connected if they exist in the database

### **Get Projects**
```bash
GET /projects
Authorization: Bearer <token>
```

### **Get Single Project**
```bash
GET /projects/68f25aaa9873992efeef91ab
Authorization: Bearer <token>
```

---

## **6. Hazard Management**

### **Get Single Hazard with Remarks**
```bash
GET /hazards/68f261ed69266e1906ddf07c
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "68f261ed69266e1906ddf07c",
  "description": "Road Marking Faded: Significant damage requiring immediate repair",
  "severity": "Low",
  "typeField": "Road Marking Faded",
  "latitude": 38.73694,
  "longitude": -38.14268,
  "imageUrl": "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
  "createdBy": "system",
  "project": { "id": "68f25aaa9873992efeef91ab" },
  "routePoint": { "id": "68f25aa99873992efeef91aa" },
  "remarks": [
    {
      "id": "68f2674fe551b692836ce899",
      "text": "This pothole needs immediate attention",
      "timestamp": "2025-10-17T15:57:03.009Z",
      "createdAt": "2025-10-17T15:57:03.011Z",
      "user": {
        "id": "68f22fdb787fcb32ef43987c",
        "username": "admin",
        "firstName": "System",
        "lastName": "Administrator"
      },
      "survey": {
        "id": "68f265fc1239c4f25c35de3b",
        "name": "Hazard Survey - Road Marking Faded",
        "status": "active"
      }
    }
  ],
  "createdAt": "2025-10-17T15:34:04.749Z",
  "updatedAt": "2025-10-17T15:34:04.749Z"
}
```

### **Add Remark to Hazard**
```bash
POST /hazards/68f261ed69266e1906ddf07c/remarks
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "This pothole needs immediate attention. It's causing traffic issues.",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Notes:**
- Automatically creates a survey for the user if they don't have an active one for the project
- Subsequent remarks from the same user are added to the same survey
- Links the remark to both the hazard and the survey

### **Get Hazard Remarks**
```bash
GET /hazards/68f261ed69266e1906ddf07c/remarks
Authorization: Bearer <token>
```

---

## **7. Error Handling**

### **Common HTTP Status Codes**
- `200` - Success
- `201` - Created
- `400` - Bad Request (Invalid input data)
- `401` - Unauthorized (Invalid or missing token)
- `403` - Forbidden (Insufficient permissions)
- `404` - Not Found (Resource doesn't exist)
- `500` - Internal Server Error

### **Error Response Format**
```json
{
  "statusCode": 403,
  "message": "Only admin can view users by role",
  "error": "Forbidden"
}
```

### **Role-Based Access Examples**

#### **Dashboard User trying to access Admin endpoint:**
```bash
GET /users/by-role/dashboard_user
Authorization: Bearer <dashboardUserToken>

# Response: 403 Forbidden
{
  "statusCode": 403,
  "message": "Only admin can view users by role",
  "error": "Forbidden"
}
```

#### **Dashboard User trying to see users from different city:**
```bash
GET /users/by-city-hall/68f25aaa9873992efeef91ac
Authorization: Bearer <dashboardUserToken>

# Response: 403 Forbidden
{
  "statusCode": 403,
  "message": "Can only view users from your assigned city hall",
  "error": "Forbidden"
}
```

---

## **8. Complete User Flow Examples**

### **🔧 Admin Flow: Create Dashboard User**

1. **Login as Admin**
```bash
POST /login
{
  "username": "admin",
  "password": "admin"
}
```

2. **Get Available City Halls**
```bash
GET /cityHalls/available
Authorization: Bearer <adminToken>
```

3. **Create Dashboard User**
```bash
POST /users/create-with-role
Authorization: Bearer <adminToken>
{
  "username": "dashboard.olhao",
  "password": "password123",
  "email": "dashboard.olhao@routeops.com",
  "firstName": "Olhão",
  "lastName": "Dashboard User",
  "role": "dashboard_user",
  "roles": ["dashboard_user"],
  "isActive": true,
  "cityHall": {
    "connect": {
      "id": "68f25aaa9873992efeef91ac"
    }
  }
}
```

4. **Verify Dashboard User Creation**
```bash
GET /users/by-role/dashboard_user
Authorization: Bearer <adminToken>
```

### **🏢 Dashboard User Flow: Manage App Users**

1. **Login as Dashboard User**
```bash
POST /login
{
  "username": "dash.lisbon",
  "password": "password123"
}
```

2. **Get Current User Profile**
```bash
GET /users/profile
Authorization: Bearer <dashboardUserToken>
```

3. **Get Dashboard User's City Hall**
```bash
GET /users/dashboard/city-hall
Authorization: Bearer <dashboardUserToken>
```

4. **Get App Users from Their City Hall**
```bash
GET /users/app-users
Authorization: Bearer <dashboardUserToken>
```

5. **Create App User (Only for Their City Hall)**
```bash
POST /users/create-with-role
Authorization: Bearer <dashboardUserToken>
{
  "username": "app.lisbon.new",
  "password": "password123",
  "email": "app.lisbon.new@routeops.com",
  "firstName": "New",
  "lastName": "App User",
  "role": "app_user",
  "roles": ["app_user"],
  "isActive": true,
  "cityHall": {
    "connect": {
      "id": "68f25aaa9873992efeef91ab"
    }
  }
}
```

### **📱 App User Flow: View Hazards and Add Remarks**

1. **Login as App User**
```bash
POST /login
{
  "username": "app.lisbon",
  "password": "password123"
}
```

2. **Get Current User Profile**
```bash
GET /users/profile
Authorization: Bearer <appUserToken>
```

3. **Get Projects**
```bash
GET /projects
Authorization: Bearer <appUserToken>
```

4. **Get Single Hazard with Remarks**
```bash
GET /hazards/68f261ed69266e1906ddf07c
Authorization: Bearer <appUserToken>
```

5. **Add Remark to Hazard**
```bash
POST /hazards/68f261ed69266e1906ddf07c/remarks
Authorization: Bearer <appUserToken>
{
  "text": "This hazard needs immediate attention. It's causing safety issues.",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

---

## **🔐 Security Notes**

1. **Always include Authorization header** with Bearer token
2. **Role-based access control** is enforced on all endpoints
3. **Dashboard Users** can only manage users in their assigned city hall
4. **App Users** have read-only access to their own data
5. **Admin** has full access to all resources
6. **City Hall assignments** can only be changed by Admin

---

## **📋 Quick Reference**

### **Available Endpoints by Role**

| Endpoint | Admin | Dashboard User | App User |
|----------|-------|----------------|----------|
| `GET /users/profile` | ✅ | ✅ | ✅ |
| `GET /cityHalls/available` | ✅ | ❌ | ❌ |
| `GET /users/by-role/:role` | ✅ | ❌ | ❌ |
| `GET /users/dashboard-users` | ✅ | ❌ | ❌ |
| `GET /users/app-users` | ✅ | ✅ (own city) | ❌ |
| `GET /users/dashboard/city-hall` | ✅ | ✅ | ❌ |
| `POST /users/create-with-role` | ✅ | ✅ (app users only) | ❌ |
| `PATCH /users/:id/city-hall` | ✅ | ❌ | ❌ |
| `GET /projects` | ✅ | ✅ | ✅ |
| `POST /projects` | ✅ | ✅ | ❌ |
| `GET /hazards/:id` | ✅ | ✅ | ✅ |
| `POST /hazards/:id/remarks` | ✅ | ✅ | ✅ |

---

## **🚀 Getting Started**

1. **Start the server** and ensure it's running on `http://localhost:3000`
2. **Use the seeding scripts** to create test users:
   ```bash
   npm run seed
   ```
3. **Login with test credentials**:
   - Admin: `admin` / `admin`
   - Dashboard User (Lisbon): `dash.lisbon` / `password123`
   - Dashboard User (Olhão): `dash.olhao` / `password123`
   - App User (Lisbon): `app.lisbon` / `password123`
   - App User (Lisbon 2): `app.lisbon.2` / `password123`
   - App User (Lisbon 3): `app.lisbon.3` / `password123`
   - App User (Olhão): `app.olhao` / `password123`
   - App User (Olhão 1): `app.olhao.1` / `password123`
4. **Follow the user flow examples** above to implement your frontend

---

**Happy coding! 🎉**
