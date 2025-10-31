-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "bbox" JSONB,
ADD COLUMN     "eIriAvg" DOUBLE PRECISION,
ADD COLUMN     "geometryJson" JSONB,
ADD COLUMN     "lengthMeters" DOUBLE PRECISION;
