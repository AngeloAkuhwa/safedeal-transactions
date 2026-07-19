-- Objects are laid out as: <requester_uuid>/<job_uuid>.csv
CREATE POLICY "Requester reads own export files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'admin-exports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );