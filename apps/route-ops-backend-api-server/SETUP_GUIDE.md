# 🚀 RouteOps Backend Setup Guide

## 📋 Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose
- npm or yarn

## 🔧 Environment Setup

### 1. Create Environment File

Create a `.env` file in the root directory with the following content:

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

### 2. Install Dependencies

```bash
npm install
```

## 🐳 Database Setup (Option 1: Docker)

### Start MongoDB with Docker

```bash
# Start MongoDB container
npm run docker:dev

# Or manually with docker-compose
docker-compose -f docker-compose.dev.yml up -d
```

### Verify MongoDB is Running

```bash
# Check if MongoDB is accessible
docker ps
```

## 🗄️ Database Setup (Option 2: Local MongoDB)

If you prefer to run MongoDB locally:

1. **Install MongoDB locally**
2. **Start MongoDB service**
3. **Update your `.env` file:**
   ```env
   DB_URL=mongodb://localhost:27017/routeops
   ```

## 🌱 Database Seeding

### Option 1: Full Setup with Docker

```bash
# Start database and seed it
npm run compose:up
```

### Option 2: Manual Seeding

```bash
# If database is already running
npm run seed
```

### Option 3: Create Admin User Only

```bash
# Create just an admin user
npm run create-admin
```

## 🚀 Start the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm run start
```

## 🧪 Test the Setup

### 1. Test Database Connection

```bash
# Test if seeding works
npm run create-admin
```

### 2. Test Login Endpoint

```bash
# Start the server
npm run dev

# In another terminal, test login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'
```

### 3. Test Protected Endpoint

```bash
# Use the token from login response
curl -X GET http://localhost:3000/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 🔐 Default Test Credentials

After running the seed script, you'll have these users:

| Role | Username | Password | Permissions |
|------|----------|----------|-------------|
| **Admin** | `admin` | `admin` | Full access |
| **Dashboard User** | `dashboard.lisbon` | `password123` | Lisbon city hall only |
| **App User** | `app.lisbon` | `password123` | Read-only access |

## 🏢 Sample Data

The seed script creates:
- **2 City Halls**: Lisbon, Olhão
- **3 Users**: One for each role
- **1 Sample Project**: Road inspection project

## 🐛 Troubleshooting

### Database Connection Issues

**Error: "No connections available"**
```bash
# Check if MongoDB is running
docker ps

# Start MongoDB if not running
npm run docker:dev
```

**Error: "BCRYPT_SALT environment variable must be defined"**
```bash
# Make sure your .env file exists and has BCRYPT_SALT=10
```

**Error: "Invalid credentials"**
```bash
# Make sure you're using the correct credentials
# Default: admin / admin
```

### Port Issues

**Error: "Port 3000 already in use"**
```bash
# Change PORT in .env file to another port (e.g., 3001)
# Or kill the process using port 3000
lsof -ti:3000 | xargs kill -9
```

### Docker Issues

**Error: "Docker daemon not running"**
```bash
# Start Docker Desktop or Docker daemon
# On macOS: Open Docker Desktop
# On Linux: sudo systemctl start docker
```

## 📝 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run seed` | Seed database with sample data |
| `npm run create-admin` | Create admin user only |
| `npm run docker:dev` | Start MongoDB with Docker |
| `npm run compose:up` | Start full stack with Docker |
| `npm run compose:down` | Stop all Docker containers |

## 🔄 Reset Everything

To start fresh:

```bash
# Stop all containers
npm run compose:down

# Remove volumes (this will delete all data)
docker-compose down --volumes

# Start fresh
npm run compose:up
```

## 📚 Next Steps

1. **Test the API** using the provided credentials
2. **Check the API documentation** in `API_DOCUMENTATION.md`
3. **Explore the role-based permissions** with different user types
4. **Integrate with your frontend** using the documented endpoints

## 🆘 Need Help?

- Check the logs: `docker-compose logs -f`
- Verify environment variables in `.env`
- Ensure MongoDB is accessible on port 27017
- Check if all required ports are available

---

**Happy Coding! 🎉**
