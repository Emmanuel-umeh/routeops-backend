# Migration Commands (No Data Loss)

## Option 1: Use `prisma migrate deploy` (Recommended - Safest)
This applies migrations without checking for drift:

```bash
# Apply the migration
yarn prisma migrate deploy

# Generate Prisma client
yarn prisma generate
```

## Option 2: Use `prisma db push` (Alternative)
This syncs your schema directly without migrations:

```bash
# Push schema changes to database
yarn prisma db push

# Generate Prisma client
yarn prisma generate
```

## Option 3: Resolve Drift First (If migrate deploy doesn't work)
If you still get drift errors:

```bash
# Mark the migration as applied (if tables already exist)
yarn prisma migrate resolve --applied 20251206141324_add_road_ratings

# Or if you need to create the tables manually first, use db push
yarn prisma db push
yarn prisma generate
```

## After Migration:
```bash
# Seed test data
yarn seed:road-ratings-silopi
```

