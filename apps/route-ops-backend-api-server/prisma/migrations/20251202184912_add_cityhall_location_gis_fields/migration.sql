-- AlterTable
ALTER TABLE "CityHall" ADD COLUMN     "defaultLatitude" DOUBLE PRECISION,
ADD COLUMN     "defaultLongitude" DOUBLE PRECISION,
ADD COLUMN     "gisFileUrl" TEXT,
ADD COLUMN     "gisFileVersion" TEXT;
