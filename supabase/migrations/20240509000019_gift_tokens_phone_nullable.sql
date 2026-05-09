-- Allow gift tokens without a phone number (QR-only distribution, e.g. on-site contractors)
ALTER TABLE gift_tokens ALTER COLUMN phone_number DROP NOT NULL;
