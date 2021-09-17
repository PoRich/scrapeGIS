// Download directly from Chester GIS API cycling through Objectids 
// node county_scripts/42029_chester/01_download_42029_gis.js RUN 2x for special cases of OBJECTIDs <100
// node county_scripts/42029_chester/01_download_42029_gis.js 0 # increment in 0
// node county_scripts/42029_chester/01_download_42029_gis.js 100 # increment in 100
// node county_scripts/42029_chester/01_download_42029_gis.js 200 # increment in 100


const fetch = require('node-fetch');
require('dotenv').config();
const db = require('../../db')

// Bypass fetchError:  unable to verify the first certificate (this is not secure)
// https://stackoverflow.com/questions/20082893/unable-to-verify-leaf-signature
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';   

var county_fips = '42029';
// const STAGING_FOLDER = `/Users/Rich/Downloads/scrape_temp/${county_fips}`

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

async function fetch_api(_re_pattern){
  // * API will not return more than 200 records
  // * make re_pattern specific enough to get less than 200 results per api call 

  // STEP 2A: RUN THIS ONCE TO GET objectids < 10
  // var url = `https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(OBJECTID)%20LIKE%20UPPER('_'))%20/PIN_MAP`

  // STEP 2B: RUN THIS ONCE TO GET objectids 10 - 100
  // var url = `https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(OBJECTID)%20LIKE%20UPPER('__'))%20/PIN_MAP`

  // STEP 3: get objectids 100 at a time  
  var url = `https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(OBJECTID)%20LIKE%20UPPER('${_re_pattern}__'))%20/PIN_MAP`
  const res = await fetch(url).then(res => checkStatus(res));  

  var jsonPayload = await res.json();
  if (Object.keys(jsonPayload).includes('COUNT')) {
    console.log(`_re_pattern ${_re_pattern} --> ${jsonPayload.PARCELS.length} results returned (${(jsonPayload.PARCELS.length / jsonPayload.COUNT)*100}%)`)
    if (jsonPayload.PARCELS.length > 0){ // only save if valid payload 
      jsonPayload.PARCELS.forEach(async (e) => {
        const res = await db.query('INSERT INTO pcl_data.c42029_gis (objectid, match_count, result_count, raw_data) \
          VALUES ($1, $2, $3, $4::JSONB) ON CONFLICT (objectid) DO NOTHING RETURNING objectid', [e.OBJECTID, jsonPayload.COUNT, jsonPayload.PARCELS.length, e])
        
        if (typeof res === 'undefined'){
          console.log(`res undefined OBJECTID ${e.OBJECTID}`);
        }
        else if(res.rows.length>0){
          console.log(`saved objectid ${res.rows[0]['objectid']} to db`);
        } else{
          console.log(`OBJECTID ${e.OBJECTID} - not saved`)
        }
      })
    }
  }
}


// STEP 1: CREATE SQL TABLE ONCE 
//await db.query('CREATE TABLE pcl_data.c42029_gis (objectid TEXT UNIQUE, match_count INT, result_count INT, raw_data JSONB)');


// run function  
async function main(re_start){  
  // STEP 2: FETCH API FOR 1 AND 2 DIGIT LONG OBJECT IDS (ALTER URL in funciton)
  // await fetch_api(1) // RUN THIS ONCE 
  
  // STEP 3: FETCH API FOR 100 at a time (ALTER URL IN FUNCTION) - call this 1000 at a time 
  for (i=re_start;i<(re_start + 100);i++){ await fetch_api(i)}
};

main(parseInt(process.argv[2]));

/* API REFERENCE 
https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(UPI)%20LIKE%20UPPER('1-1-%3D%3D'))%20%2FPIN_MAP
https://arcweb.chesco.org/CV3Service/CV3Service1.svc/JsonService/GetParcelAttributes/(%20UPPER(OBJECTID)%20LIKE%20UPPER('1111%3D%3D'))%20/PIN_MAP 

SQL REFERENCE 
SELECT objectid -- , raw_data -- jsonb_pretty(raw_data)
FROM pcl_data.c42029_gis 
ORDER BY 1;

select count(*) 
FROM pcl_data.c42029_gis
WHERE raw_data is not null;

select * from pcl_data.c42029_gis where objectid='10068';
*/