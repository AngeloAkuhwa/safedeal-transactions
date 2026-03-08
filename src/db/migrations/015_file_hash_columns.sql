-- Add file hash columns for evidence integrity verification
ALTER TABLE public.files ADD COLUMN file_hash text;
ALTER TABLE public.files ADD COLUMN hash_algorithm text DEFAULT 'sha256';
