const Shp2psql = require('./shp2psql');

/**
const node_results =  {
    "land_use": [500, "download prompt -> partial zip download "],
    "dept_of_records": [500, "download prompt -> partial zip download "],
    "re_transfers": [500, "download prompt -> NO zip download]",
    "re_tax_delinquencies": [500, "download stalls -> NO zip download"],
    "business_licenses": [500, "download stalls -> NO zip download]", 
    "building_permits": [500, "download stalls -> download prompt -> clicking 'OK' sends to download folder "],
    "li_violations": [500, "download stalls -> download prompt -> clicking 'OK' sends to download folder"],
    "unsafe_violations": [200, "download prompt -> WORKS FINE"],
    "dangerous_violations": [200, "download prompt -> WORKS FINE"]
    }

const puppeteer_results =  {
    "land_use": [],
    "dept_of_records": [],
    "re_transfers": [200, "turnoff VPN"],
    "re_tax_delinquencies": [200, "turnoff VPN"],
    "business_licenses": [],
    "building_permits": [],
    "li_violations": [],
    "unsafe_violations": [],
    "dangerous_violations": [],
    }
 */

const shp_urls =  {
    "land_use": "http://data-phl.opendata.arcgis.com/datasets/e433504739bd41049de5d8f4a22d34ba_0.zip",  
    "dept_of_records": "http://data-phl.opendata.arcgis.com/datasets/1c57dd1b3ff84449a4b0e3fb29d3cafd_0.zip", 
    "re_transfers": "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272020-01-01%27", 
    "re_tax_delinquencies": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+real_estate_tax_delinquencies&filename=real_estate_tax_delinquencies&format=shp&skipfields=cartodb_id",
    "business_licenses": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+business_licenses&filename=business_licenses&format=shp&skipfields=cartodb_id",
    "building_permits": "https://phl.carto.com/api/v2/sql?filename=permits&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20permits%20WHERE%20permitissuedate%20%3E=%20%272016-01-01%27",
    "li_violations": "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272019-01-01%27",
    "unsafe_violations": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+unsafe&filename=unsafe&format=shp&skipfields=cartodb_id", 
    "dangerous_violations": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+imm_dang&filename=imm_dang&format=shp&skipfields=cartodb_id",
    }


var keys = [];
for(var k in shp_urls) keys.push(k);

var key = keys[8];
const url = shp_urls[key];
const COUNTY_CODE = 'c42101';
var records = Shp2psql.load(`${COUNTY_CODE}_${key}`, url); 

