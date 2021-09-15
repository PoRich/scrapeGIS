/*
Download directly from Chester GIS API cycling through Objectids 
$ node county_scripts/42029_chester/01_download_42029_gis.js
*/
const fetch = require('node-fetch');
const fs = require('fs');
// const scrapeTools = require('../../modules/scrapeTools');
const exec = require('child_process').exec;
// const format = require('pg-format');
require('dotenv').config();
const db = require('../../db')

// Bypass fetchError:  unable to verify the first certificate (this is not secure)
// https://stackoverflow.com/questions/20082893/unable-to-verify-leaf-signature
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';   

var county_fips = '42029';
const STAGING_FOLDER = `/Users/Rich/Downloads/scrape_temp/${county_fips}`

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkStatus(res) {
  if (res.ok) { // res.status >= 200 && res.status < 300
      return res;
  } else {
      console.log(`scraper failed on upper = ${upper}`);
      throw MyCustomError(res.statusText);
  }
}

// UPI pattern is a-b-c.d 
var incr = 1;
var re_pattern = '1112';  // API will not return more than 200 records
/**
 * 
 * make re_pattern specific enough to get less than 200 results per api call 
 * start with 4 digits, record # of matches and actual # of results returned
 * if results returned < matches then add another digit to re_pattern and iterate from there 
 */

async function download_geom(_re_pattern){
  var url = `https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(OBJECTID)%20LIKE%20UPPER('${_re_pattern}%3D%3D'))%20/PIN_MAP`;

  const res = await fetch(url).then(res => checkStatus(res));  
  // https://github.com/node-fetch/node-fetch/issues/396
  // const res2 = await res.clone(); // doesn't work on large responses

  var jsonPayload = await res.json();
  if (Object.keys(jsonPayload).includes('error')){
    console.log(`_re_pattern ${_re_pattern} -> API error ${url}`); // Check API payload
  } else if (Object.keys(jsonPayload).includes('COUNT')) {
    console.log(`_re_pattern ${_re_pattern} payload length ${jsonPayload.PARCELS.length} / ${jsonPayload.COUNT} results`)
    if (jsonPayload.PARCELS.length > 0){ // only save if valid payload 
      jsonPayload.PARCELS.forEach(async (e) => {
        const res = await db.query('INSERT INTO pcl_data.c42029_gis (OBJECTID, raw_data) VALUES ($1, $2)', [e.OBJECTID, e])
        // console.log(`${e.OBJECTID} db query`)
      })

      //var DATA_DIR = `${STAGING_FOLDER}/c${county_fips}_gis_${_re_pattern}.json`;
      //const dest = fs.createWriteStream(DATA_DIR); 
      //await res.body.pipe(dest);
    }
  }

}

// download payload 
(async ()=>{
  // exec(`mkdir ${STAGING_FOLDER}`);
  // exec(`cd ${STAGING_FOLDER}`);
  await db.query('CREATE TABLE pcl_data.c42029_gis (OBJECTID TEXT, raw_data JSONB)');
  while (re_pattern <= 100) { 
    re_pattern_actual = re_pattern < 10 ? '0'+re_pattern: re_pattern;
    await download_geom(re_pattern_actual)
    
    await sleep(10);
    re_pattern += incr;  // Increment 
  }
})();


/*
testing 

const fetch = require('node-fetch');
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';   
(async()=>{
  var _re_pattern = 1;
  var url = `https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(OBJECTID)%20LIKE%20UPPER('${_re_pattern}%3D%3D'))%20/PIN_MAP`
  const res = await fetch(url);
  var jsonPayload = await res.json();
  console.log(`url: ${url}`);
  if (Object.keys(jsonPayload).includes('error')){
    console.log(`_re_pattern ${_re_pattern} -> API error ${url}`); // Check API payload
  } else if (Object.keys(jsonPayload).includes('COUNT')) {
    console.log(`_re_pattern ${_re_pattern} payload length ${jsonPayload.PARCELS.length} / ${jsonPayload.COUNT} results`)
  }  
})();


https://arcweb.chesco.org/cv3/Default_CV.html

// Scrape Parcel geom and list of parcel_nums
https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(OWNER1%20LIKE%20'%3D%3DJOHNSON%3D%3D'%20OR%20OWNER2%20LIKE%20'%3D%3DJOHNSON%3D%3D')%20AND%20MUNI_ID%20%3D%2065/PIN_MAP
https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(OWNER1%20LIKE%20'%3D%3DJOHNSON%3D%3D'%20OR%20OWNER2%20LIKE%20'%3D%3DJOHNSON%3D%3D')%20AND%20MUNI_ID%20%3D%2065/PIN_MAP

https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(UPI)%20%3D%20UPPER('1')%20OR%20%20UPPER(UPI)%20LIKE%20UPPER('1-%3D%3D'))%20%2FPIN_MAP
https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(PIN_ASMNT)%20%3D%20UPPER('0109')%20OR%20%20UPPER(PIN_ASMNT)%20LIKE%20UPPER('0109%3D%3D'))%20/PIN_MAP

Object ID starts with 1
https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(OBJECTID)%20LIKE%20UPPER('1%3D%3D'))%20/PIN_MAP 

Use list of parcel_nums to scrape data 
delcorealestate.co.delaware.pa.us/PT/Datalets/PrintDatalet.aspx?pin=30000157600&gsp=PROFILEALL_PUB&taxyear=2021&jur=023&ownseq=0&card=1&roll=REAL&State=1&item=1&items=-1&all=all&ranks=Datalet




*/