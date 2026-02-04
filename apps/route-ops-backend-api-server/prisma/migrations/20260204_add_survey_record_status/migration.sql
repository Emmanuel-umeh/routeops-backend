-- Add GPS and video recording status fields to Survey
ALTER TABLE "Survey"
  ADD COLUMN IF NOT EXISTS "gpsRecordStatus"   TEXT NULL,
  ADD COLUMN IF NOT EXISTS "videoRecordStatus" TEXT NULL;

