-- Add grave_id column to lots table to track assigned graves
ALTER TABLE public.lots
ADD COLUMN grave_id uuid NULL REFERENCES public.graves (id) ON DELETE SET NULL;
