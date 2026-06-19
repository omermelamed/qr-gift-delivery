-- Drop standalone SMS campaign tables — credits are now tied to gift campaigns
DROP TABLE IF EXISTS sms_messages;
DROP TABLE IF EXISTS sms_campaigns;
DROP TYPE IF EXISTS sms_message_status;
DROP TYPE IF EXISTS sms_campaign_status;
