# 🌱 Database Seeding Guide

This guide explains how to seed your database with initial data for testing and development.

## 📋 Available Scripts

### 1. **Full Database Seed**
```bash
npm run seed
```
**What it does:**
- Creates an admin user with credentials: `admin` / `admin`
- Creates sample city halls (Lisbon, Olhão)
- Creates sample users for each role
- Creates a sample project

### 2. **Create Admin User Only**
```bash
npm run create-admin
```
**What it does:**
- Creates/updates an admin user with default credentials: `admin` / `admin`

### 3. **Add Hazards to Existing Projects**
```bash
npm run add-hazards
```
**What it does:**
- Adds 2-5 random hazards to all existing projects that don't have hazards yet
- Generates realistic hazard types (potholes, cracks, debris, etc.)
- Assigns random severity levels (Low, Medium, High, Critical)
- Links hazards to route points when available

**Custom credentials:**
```bash
npm run create-admin [username] [password] [email]
```
**Examples:**
```bash
npm run create-admin admin admin123 admin@routeops.com
npm run create-admin superadmin mypassword123 superadmin@routeops.com
```

## 🔐 Default Test Credentials

After running the seed scripts, you'll have these test users:

### **Admin User**
- **Username:** `admin`
- **Password:** `admin`
- **Role:** `admin`
- **Permissions:** Full access to all resources

### **Dashboard User (Lisbon)**
- **Username:** `dashboard.lisbon`
- **Password:** `password123`
- **Role:** `dashboard_user`
- **City Hall:** Lisbon
- **Permissions:** Can manage app users in Lisbon only

### **App User (Lisbon)**
- **Username:** `app.lisbon`
- **Password:** `password123`
- **Role:** `app_user`
- **City Hall:** Lisbon
- **Permissions:** Read-only access to their own data

## 🏢 Sample Data Created

### **City Halls**
- **Lisbon** - Main administrative center
- **Olhão** - Regional administrative center

### **Sample Project**
- **Name:** "Sample Road Inspection Project"
- **Status:** Active
- **City Hall:** Lisbon
- **Assigned User:** dashboard.lisbon

## 🚀 Quick Start

### Prerequisites
1. **Create `.env` file** with the following content:
   ```env
   # Database Configuration
   DB_URL=mongodb://admin:password@localhost:27017/routeops?authSource=admin
   DB_USER=admin
   DB_PASSWORD=password
   DB_NAME=routeops
   DB_PORT=27017

   # Authentication Configuration
   BCRYPT_SALT=10
   JWT_SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRATION=1d

   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

2. **Start your database** (MongoDB):
   ```bash
   # Option 1: Using Docker
   npm run docker:dev
   
   # Option 2: Local MongoDB (if installed locally)
   # Just make sure MongoDB is running on port 27017
   ```

3. **Run the seed script:**
   ```bash
   npm run seed
   ```

4. **Start your application:**
   ```bash
   npm run dev
   ```

5. **Test login with admin credentials:**
   ```bash
   curl -X POST http://localhost:3000/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "admin"}'
   ```

## 🔧 Environment Variables Required

Make sure you have these environment variables set in your `.env` file:

```env
DB_URL=mongodb://localhost:27017/routeops
BCRYPT_SALT=10
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRATION=1d
```

## 🧪 Testing Different Roles

### **Test Admin Access:**
```bash
# Login as admin
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'

# Use the returned token to access admin endpoints
curl -X GET http://localhost:3000/users/dashboard-users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Test Dashboard User Access:**
```bash
# Login as dashboard user
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username": "dashboard.lisbon", "password": "password123"}'

# Access app users (should only see Lisbon users)
curl -X GET http://localhost:3000/users/app-users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Test App User Access:**
```bash
# Login as app user
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username": "app.lisbon", "password": "password123"}'

# Access own profile
curl -X GET http://localhost:3000/userInfo \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🗑️ Reset Database

To reset and reseed the database:

```bash
npm run db:clean
npm run seed
```

## 📝 Notes

- All passwords are properly hashed using bcrypt
- Users are created with proper role assignments
- City hall relationships are properly established
- The seed scripts are idempotent (safe to run multiple times)
- Sample data includes realistic test scenarios for all user roles

## 🐛 Troubleshooting

### **"BCRYPT_SALT environment variable must be defined"**
- Make sure your `.env` file has `BCRYPT_SALT=10`

### **"Database connection failed"**
- Ensure MongoDB is running
- Check your `DB_URL` in the `.env` file

### **"User already exists"**
- This is normal - the scripts use `upsert` to update existing users
- You can safely run the scripts multiple times

---

**Happy Testing! 🎉**
