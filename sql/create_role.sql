-- ROLE CREATION FOR admin
CREATE ROLE reiq_admin CREATEDB LOGIN;

-- grant database access
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE reiq to reiq_admin;

-- grant access on schema 
GRANT USAGE, CREATE ON SCHEMA admin, code_map, parcel, parcel_data, housing, housing_data, demo, demo_data, reiq to reiq_admin;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA 
admin, code_map, parcel, parcel_data, housing, housing_data, demo, demo_data, reiq TO reiq_admin;

-- give privileges to future roles 
ALTER DEFAULT PRIVILEGES IN SCHEMA admin, code_map, parcel, parcel_data, housing, housing_data, demo, demo_data, reiq 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO reiq_admin;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA admin, code_map, parcel, parcel_data, housing, housing_data, demo, demo_data, reiq TO reiq_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA admin, code_map, parcel, parcel_data, housing, housing_data, demo, demo_data, reiq GRANT USAGE ON SEQUENCES TO reiq_admin;

CREATE USER reiq WITH LOGIN PASSWORD 'password';
GRANT reiq_admin TO reiq;


--------------------------------

-- ROLE CREATION FOR SCRAPER BOT
CREATE ROLE scraper_bot LOGIN;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE reiq to scraper_bot;

GRANT USAGE, CREATE ON SCHEMA parcel_data, housing_data, demo_data to scraper_bot;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA 
parcel_data, housing_data, demo_data TO scraper_bot;

-- give privileges to future roles 
ALTER DEFAULT PRIVILEGES IN SCHEMA parcel_data, housing_data, demo_data
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scraper_bot;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA parcel_data, housing_data, demo_data TO scraper_bot;

ALTER DEFAULT PRIVILEGES IN SCHEMA parcel_data, housing_data, demo_data GRANT USAGE ON SEQUENCES TO scraper_bot;

CREATE USER parcel_data WITH LOGIN PASSWORD 'password';

CREATE ROLE parcel_data WITH LOGIN PASSWORD 'password';
GRANT scraper_bot TO parcel_data;

CREATE ROLE housing_data WITH LOGIN PASSWORD 'password';
GRANT scraper_bot TO housing_data;

CREATE ROLE demo_data WITH LOGIN PASSWORD 'password';
GRANT scraper_bot TO demo_data;

1