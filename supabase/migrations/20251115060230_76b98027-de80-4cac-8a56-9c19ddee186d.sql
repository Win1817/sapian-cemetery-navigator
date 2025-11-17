-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table for secure role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create graves table
CREATE TABLE public.graves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grave_name TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  grave_image_url TEXT,
  date_of_birth DATE,
  date_of_death DATE,
  additional_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on graves
ALTER TABLE public.graves ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read graves (public access for map)
CREATE POLICY "Anyone can view graves"
ON public.graves
FOR SELECT
USING (true);

-- Only admins can insert graves
CREATE POLICY "Admins can insert graves"
ON public.graves
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update graves
CREATE POLICY "Admins can update graves"
ON public.graves
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete graves
CREATE POLICY "Admins can delete graves"
ON public.graves
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for grave images
INSERT INTO storage.buckets (id, name, public)
VALUES ('grave-images', 'grave-images', true);

-- Allow public read access to grave images
CREATE POLICY "Public can view grave images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'grave-images');

-- Admins can upload grave images
CREATE POLICY "Admins can upload grave images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'grave-images' AND
  public.has_role(auth.uid(), 'admin')
);

-- Admins can update grave images
CREATE POLICY "Admins can update grave images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'grave-images' AND
  public.has_role(auth.uid(), 'admin')
);

-- Admins can delete grave images
CREATE POLICY "Admins can delete grave images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'grave-images' AND
  public.has_role(auth.uid(), 'admin')
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for graves table
CREATE TRIGGER update_graves_updated_at
BEFORE UPDATE ON public.graves
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();
