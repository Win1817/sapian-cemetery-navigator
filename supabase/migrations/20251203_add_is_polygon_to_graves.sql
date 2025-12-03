-- Add is_polygon and polygon coordinates columns to graves table
ALTER TABLE public.graves
ADD COLUMN is_polygon boolean NOT NULL DEFAULT false,
ADD COLUMN polygon_coordinates jsonb NULL,
ADD COLUMN centroid_lat float8 NULL,
ADD COLUMN centroid_lng float8 NULL;

-- Create index for is_polygon for better query performance
CREATE INDEX idx_graves_is_polygon ON public.graves(is_polygon);
