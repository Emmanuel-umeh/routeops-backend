-- AlterTable: Add segmentId to RoadRatingHistory
ALTER TABLE "RoadRatingHistory" ADD COLUMN "segmentId" TEXT;

-- CreateIndex: Add index on segmentId for RoadRatingHistory
CREATE INDEX "RoadRatingHistory_segmentId_idx" ON "RoadRatingHistory"("segmentId");

-- AlterTable: Add segmentId to RoadRating
ALTER TABLE "RoadRating" ADD COLUMN "segmentId" TEXT;

-- DropIndex: Remove old unique constraint
DROP INDEX IF EXISTS "RoadRating_entityId_roadId_key";

-- CreateIndex: Add index on segmentId for RoadRating
CREATE INDEX "RoadRating_segmentId_idx" ON "RoadRating"("segmentId");

-- CreateIndex: Add composite index for entityId + roadId queries
CREATE INDEX "RoadRating_entityId_roadId_idx" ON "RoadRating"("entityId", "roadId");

-- CreateUniqueIndex: New unique constraint including segmentId (allows multiple segments per edge)
CREATE UNIQUE INDEX "RoadRating_entityId_roadId_segmentId_key" ON "RoadRating"("entityId", "roadId", "segmentId");

