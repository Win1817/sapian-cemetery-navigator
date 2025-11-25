-- Add lot_block_id column to graves table to track lot assignments
ALTER TABLE public.graves
ADD COLUMN lot_block_id uuid NULL REFERENCES public.lots (id) ON DELETE SET NULL;
