-- CreateTable
CREATE TABLE "RoadRatingHistory" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "roadId" TEXT NOT NULL,
    "eiri" DOUBLE PRECISION NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadRatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadRating" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "roadId" TEXT NOT NULL,
    "eiri" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoadRatingHistory_entityId_roadId_idx" ON "RoadRatingHistory"("entityId", "roadId");

-- CreateIndex
CREATE INDEX "RoadRatingHistory_userId_idx" ON "RoadRatingHistory"("userId");

-- CreateIndex
CREATE INDEX "RoadRatingHistory_createdAt_idx" ON "RoadRatingHistory"("createdAt");

-- CreateIndex
CREATE INDEX "RoadRating_entityId_idx" ON "RoadRating"("entityId");

-- CreateIndex
CREATE INDEX "RoadRating_roadId_idx" ON "RoadRating"("roadId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "RoadRating_entityId_roadId_key" ON "RoadRating"("entityId", "roadId");

-- AddForeignKey
ALTER TABLE "RoadRatingHistory" ADD CONSTRAINT "RoadRatingHistory_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CityHall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadRatingHistory" ADD CONSTRAINT "RoadRatingHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadRating" ADD CONSTRAINT "RoadRating_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CityHall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

