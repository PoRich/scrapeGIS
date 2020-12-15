-- RAW DATA SAVED IN THE FOLLOWING LOCATIONS
-- parcels database > parcel_data schema > c42101_properties table 
-- parcels database > parcel_data schema > c42101_assessments table 

-- ROLE CREATION FOR SCRAPER BOT
CREATE ROLE scraper_bot LOGIN;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE parcels to scraper_bot;
GRANT USAGE, CREATE ON SCHEMA parcel_data to scraper_bot;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA parcel_data TO scraper_bot;

-- give privileges to future roles 
ALTER DEFAULT PRIVILEGES IN SCHEMA parcel_data GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scraper_bot;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA parcel_data TO scraper_bot;
ALTER DEFAULT PRIVILEGES IN SCHEMA parcel_data GRANT USAGE ON SEQUENCES TO scraper_bot;
CREATE USER parcel_data WITH LOGIN PASSWORD 'password';
GRANT scraper_bot TO parcel_data;

