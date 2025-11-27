-- CreateEnum
CREATE TYPE "EnumVehicleType" AS ENUM ('passenger_cars', 'garbage_truck', 'bus', 'police_vehicles', 'other');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vehicleType" "EnumVehicleType",
ADD COLUMN     "vehicleTypeOther" TEXT;
