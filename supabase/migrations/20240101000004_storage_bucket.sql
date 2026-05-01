INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "qr_codes_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'qr-codes');

CREATE POLICY "qr_codes_service_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'qr-codes');
