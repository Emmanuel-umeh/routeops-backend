-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create roads table for storing road geometries from GPKG files
CREATE TABLE IF NOT EXISTS "Road" (
  id SERIAL PRIMARY KEY,
  edge_id TEXT NOT NULL,
  city_hall_id TEXT NOT NULL,
  name TEXT,
  highway TEXT,
  geom GEOMETRY(LineString, 4326) NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key to CityHall
  CONSTRAINT fk_road_city_hall FOREIGN KEY (city_hall_id) REFERENCES "CityHall"(id) ON DELETE CASCADE
);

-- Create spatial index for fast spatial queries
CREATE INDEX IF NOT EXISTS road_geom_idx ON "Road" USING GIST (geom);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS road_edge_id_idx ON "Road" (edge_id);
CREATE INDEX IF NOT EXISTS road_city_hall_idx ON "Road" (city_hall_id);
CREATE INDEX IF NOT EXISTS road_edge_city_idx ON "Road" (edge_id, city_hall_id);

-- Add comment
COMMENT ON TABLE "Road" IS 'Road geometries loaded from GPKG files, indexed by city hall';
