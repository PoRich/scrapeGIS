/** From node_scraper directory run
 *  $ node county_scripts/42101_philadelphia/c42101.js with the appropriate function calls below  
 * 
 * https://stackoverflow.com/questions/55921442/how-to-fix-referenceerror-primordials-is-not-defined-in-node-js
 * https://timonweb.com/javascript/how-to-fix-referenceerror-primordials-is-not-defined-error/
 * 
 * $ npm install -g n
 * 
 * # revert to older version of node
 * $ sudo n 11.15.0  
 * 
 * # revert to newer version of node
 * $ sudo n 14.16.0
*/

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();}
const Shp2psql= require('../../app/shp2psql.js');

// catch uncaught exceptions
process.on('uncaughtException', err =>{
    console.error('There was an uncaught err', err)
    process.exit(1) //mandatory (as per the Node.js docs)
})

/* TODOs
1. Add timeout for Requests
2. figure out some sort of file test logic between download and unzip - probably involves 
checking if the file is downloading and if so adding a delay
3. check should only count files larger than 10kbs
*/

const COUNTY_CODE = 'c42101';

const shp_urls =  {
    "land_use": "http://data-phl.opendata.arcgis.com/datasets/e433504739bd41049de5d8f4a22d34ba_0.zip",  
    "dept_of_records": "http://data-phl.opendata.arcgis.com/datasets/1c57dd1b3ff84449a4b0e3fb29d3cafd_0.zip", 
    "re_transfers_since_2020": "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272020-01-01%27", 
    "re_tax_delinquencies": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+real_estate_tax_delinquencies&filename=real_estate_tax_delinquencies&format=shp&skipfields=cartodb_id",
    "business_licenses": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+business_licenses&filename=business_licenses&format=shp&skipfields=cartodb_id",
    "building_permits": "https://phl.carto.com/api/v2/sql?filename=permits&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20permits%20WHERE%20permitissuedate%20%3E=%20%272016-01-01%27",
    "li_violations": "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272019-01-01%27",
    "unsafe_violations": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+unsafe&filename=unsafe&format=shp&skipfields=cartodb_id", 
    "dangerous_violations": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+imm_dang&filename=imm_dang&format=shp&skipfields=cartodb_id",
    "water_dept": "https://opendata.arcgis.com/datasets/84baed491de44f539889f2af178ad85c_0.zip"
    }

let archive_shp_urls = {
    //'re_transfers_18_19': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272018-01-01%27%20AND%20display_date%20%3C%20%272020-01-01%27",
    //'re_transfers_16_17': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272016-01-01%27%20AND%20display_date%20%3C%20%272018-01-01%27",
    //'re_transfers_14_15': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272014-01-01%27%20AND%20display_date%20%3C%20%272016-01-01%27",
    //'re_transfers_12_13': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272012-01-01%27%20AND%20display_date%20%3C%20%272014-01-01%27",
    //'re_transfers_10_11': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272010-01-01%27%20AND%20display_date%20%3C%20%272012-01-01%27",
    //'re_transfers_08_09': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272008-01-01%27%20AND%20display_date%20%3C%20%272010-01-01%27",
    //'re_transfers_06_07': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272006-01-01%27%20AND%20display_date%20%3C%20%272008-01-01%27",
    //'re_transfers_04_05': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272004-01-01%27%20AND%20display_date%20%3C%20%272006-01-01%27", 
    //'re_transfers_02_03': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272002-01-01%27%20AND%20display_date%20%3C%20%272004-01-01%27",
    //'re_transfers_prior_01': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3C%20%272002-01-01%27",
    //'business_licenses_archive': "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+li_business_licenses&filename=li_business_licenses&format=shp&skipfields=cartodb_id",
    //'building_permits_07_15': "https://phl.carto.com/api/v2/sql?filename=permits&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20permits%20WHERE%20permitissuedate%20%3E=%20%272007-01-01%27%20AND%20permitissuedate%20%3C%20%272016-01-01%27",
    //'building_permits_archive': "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+li_permits&filename=li_permits&format=shp&skipfields=cartodb_id",
    //'li_violations_16_18': "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272016-01-01%27%20AND%20violationdate%20%3C%20%272019-01-01%27",
    //'li_violations_13_15': "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272013-01-01%27%20AND%20violationdate%20%3C%20%272016-01-01%27",
    //'li_violations_10_12': "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272010-01-01%27%20AND%20violationdate%20%3C%20%272013-01-01%27",
    //'li_violations_07_09': "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272007-01-01%27%20AND%20violationdate%20%3C%20%272010-01-01%27",
}


/************************************************************ FUNCTION DEFINITIONS  ************************************************************/
// workhorse function downloads, unzips, inserts into psql 
const scrape_shp = async function (county_code, description, url) {
    var d = await Shp2psql.prepTmpPath(county_code, description)

    let records = await Shp2psql.rDownload(url, d) // first attempt 
        .catch(err => {
            console.log(`HTTP(S).Request failed w/ error ${err}`)
            Shp2psql.pDownload(url, d) // backup attempt
                .catch(err => {
                    console.log(`Puppeteer also failed: ${err}; DOWNLOAD MANUALLY`)
                })
        })
        .then(Shp2psql.checkDownload) // checks for valid file 
        .then(Shp2psql.unzipFile)
        .then(Shp2psql.dbPrecheck)
        .then(Shp2psql.dbLoad)
        .then(Shp2psql.dbLoadTest);
    return records
};


// creates folders, unzips, inserts into psql [FOR MANUAL DOWNLOADS]
const zip2psql = async function (county_code, desscription, url=undefined) {
    var d = await Shp2psql.getDestination(county_code, desscription)

    let records = await Shp2psql.unzipFile(d)
        .then(Shp2psql.dbPrecheck)
        .then(Shp2psql.dbLoad)
        .then(Shp2psql.dbLoadTest);
    return records
};


/******************************************************** FUNCTION CALLS  ************************************************************/

// get all archived data  
let completed = []; 

const addCompleted = function (record) {
    if (record>0) {
        completed.push(k); 
        console.log(completed);
    }
}

/**
for(var k in archive_shp_urls) {
    console.log(`Scraping ${k} for archives... `)
    
    scrape_shp(COUNTY_CODE, k, archive_shp_urls[k])
        .then(addCompleted);   
    }

(async function() {
    // get all archived data  
    let completed = []; 
    for(var k in archive_shp_urls) {
        console.log(`Scraping ${k} for archives... `)
        var records = await scrape_shp(COUNTY_CODE, k, archive_shp_urls[k])
        console.log(`impored ${records} records from table${k}`)
        if (records>0) {
            completed.push(k); 
            console.log(completed)
        }
    }
})();
 
(async function() {
    var records = await zip2psql(COUNTY_CODE, desc, target_url)
    console.log(`${records} records saved from ${desc}`)
    return records 
})();
*/

// download water dept shp file 
// scrape_shp('c42101', 'water_dept', shp_urls['water_dept']);

scrape_shp('c42101', 're_transfers_since_2020', shp_urls['re_transfers_since_2020']);