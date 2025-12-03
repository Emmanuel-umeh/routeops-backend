-- AlterTable
ALTER TABLE "Hazard" ADD COLUMN     "edgeId" TEXT;

-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "edgeIds" TEXT[];

-- CreateIndex
CREATE INDEX "Hazard_edgeId_idx" ON "Hazard"("edgeId");

-- CreateIndex
CREATE INDEX "Survey_edgeIds_idx" ON "Survey" USING GIN ("edgeIds");
