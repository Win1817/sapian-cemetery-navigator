-- In this migration, we are adding a new column `polygon_coords` to the `graves` table.
-- This column will store the geographic coordinates of the polygon defining a grave's footprint on the map.
-- The data type is set to JSONB, which is efficient for storing and querying JSON data.
-- It is nullable because existing graves will not have polygon data initially.
-- The existing Row Level Security (RLS) policies for the 'graves' table are sufficient,
-- as they grant insert/update/delete permissions at the row level to admins,
-- which will include this new column.

ALTER TABLE public.graves
ADD COLUMN polygon_coords JSONB;
