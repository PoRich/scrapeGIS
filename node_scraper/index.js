if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();}
const Shp2psql= require('./routes/shp2psql.js');

// catch uncaught exceptions
process.on('uncaughtException', err =>{
    console.err('There was an uncaught err', err)
    process.exit(1) //mandatory (as per the Node.js docs)
})

// workhorse function downloads, unzips, inserts into psql 
const scrape_shp = async function (county_code, desscription, url) {
    var d = await Shp2psql.prepTmpPath(county_code, desscription)

    let records = await Shp2psql.rDownload(url, d)
        .catch(err => {
            console.log(`HTTP(S).Request failed w/ error ${err}`)
            Shp2psql.pDownload(url, d)
                .catch(err => {
                    console.log(`Puppeteer also failed: ${err}; DOWNLOAD MANUALLY`)
                })
        })
        .then(Shp2psql.checkDownload)
        .then(Shp2psql.unzipFile)
        .then(Shp2psql.dbPrecheck)
        .then(Shp2psql.dbLoad)
        .then(Shp2psql.dbLoadTest);
    return records
};


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

/* TODOs
2. test pDownoad - weird puppeteer error browser, test HTTPrequest
4. figure out some sort of file test logic between download and unzip - probably involves 
checking if the file is downloading and if so adding a delay
*/

// get keys 
var keys = [];
for(var k in shp_urls) keys.push(k);
// set variables for test 
var desc = keys[2];
const COUNTY_CODE = 'c42101';
const target_url = shp_urls[desc];

// function call 
(async function() {
    var records = await scrape_shp(COUNTY_CODE, desc, target_url)
    console.log(`${records} records saved from ${desc}`)
    return records 
})();


/**
// Prototype 
(async function() {
    var d = await Shp2psql.prepTmpPath(COUNTY_CODE, 'unsafe_violations')

    let records = await Shp2psql.rDownload(target_url, d)
        .catch(err => {
            console.log(`HTTP(S).Request failed w/ error ${err}`)
            Shp2psql.pDownload(target_url, d)
                .catch(err => {
                    console.log(`Puppeteer also failed: ${err}; DOWNLOAD MANUALLY`)
                })
        })
        .then(Shp2psql.checkDownload)
        .then(Shp2psql.unzipFile)
        .then(Shp2psql.dbPrecheck)
        .then(Shp2psql.dbLoad)
        .then(Shp2psql.dbLoadTest);

    console.log(`# of records loaded = ${records}`)
})();
 */



/** notes
const node_results =  {
    "land_use": [500, "download prompt -> partial zip download "],
    "dept_of_records": [500, "download prompt -> partial zip download "],
    "re_transfers": [500, "download prompt -> NO zip download]",
    "re_tax_delinquencies": [500, "download stalls -> NO zip download"],
    "business_licenses": [500, "download stalls / url is unresponsive -> NO zip download]", 
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
    "business_licenses": [500],
    "building_permits": [],
    "li_violations": [],
    "unsafe_violations": [],
    "dangerous_violations": [],
    }
 */