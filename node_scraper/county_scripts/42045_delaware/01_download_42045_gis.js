// $ node county_scripts/42045_delaware/01_download_42045_gis.js
const fetch = require('node-fetch');
const fs = require('fs');
// const scrapeTools = require('../../modules/scrapeTools');
const exec = require('child_process').exec;
// const format = require('pg-format');
require('dotenv').config();

// Bypass fetchError:  unable to verify the first certificate (this is not secure)
// https://stackoverflow.com/questions/20082893/unable-to-verify-leaf-signature
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';   

var incr = 1000;
var lower = 0;  // API will not return more than 1000 records
var county_fips = '42045';
const STAGING_FOLDER = `/Users/Rich/Downloads/scrape_temp/${county_fips}`

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkStatus(res) {
  if (res.ok) { // res.status >= 200 && res.status < 300
      return res;
  } else {
      console.log(`scraper failed on lower = ${lower}`);
      throw MyCustomError(res.statusText);
  }
}

async function download_geom(_lower, _incr){
  var url = `https://dcgis.co.delaware.pa.us/arcgis/rest/services/AssessmentViewer_Parcels/MapServer/0/query?f=geojson&where=OBJECTID>${_lower} AND OBJECTID <${_lower+_incr} &returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*`

  const res = await fetch(url).then(res => checkStatus(res));  // get payload 
  const res2 = await fetch(url).then(res => checkStatus(res));  // get metadata 
  // https://github.com/node-fetch/node-fetch/issues/396
  // const res2 = await res.clone(); // doesn't work on large responses

  var jsonPayload = await res2.json();
  if (Object.keys(jsonPayload).includes('error')){
    console.log(`_lower ${_lower} -> API error ${url}`); // Check API payload
  } else if (Object.keys(jsonPayload).includes('features')) {
    console.log(`_lower ${_lower} payload length ${jsonPayload.features.length}`)
    if (jsonPayload.features.length > 0){ // only save if valid payload 
      var DATA_DIR = `${STAGING_FOLDER}/c${county_fips}_gis_${_lower}.geojson`;
      const dest = fs.createWriteStream(DATA_DIR); 
      await res.body.pipe(dest);
    }
  }

}


async function recurse_scrape(lower, upper){
  var url = `https://dcgis.co.delaware.pa.us/arcgis/rest/services/AssessmentViewer_Parcels/MapServer/0/query?f=geojson&where=OBJECTID>=${lower} AND OBJECTID <=${upper} &returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*`
  const res = await fetch(url).then(res => checkStatus(res));  // get payload 
  const res2 = await fetch(url).then(res => checkStatus(res));  // get metadata 
  
  var jsonPayload = await res2.json();
  if (Object.keys(jsonPayload).includes('error') && upper === (lower+1) ){
    console.log(`BASE CASE objectid ${lower} - ${upper} doesn't exist`); 
    return true;  // end case where it fails -- objectid likely doesn't exist
  }
  else if (Object.keys(jsonPayload).includes('error')){
  // recursive call with smaller interval 
    var mid = Math.floor((upper - lower)/2);
    //  console.log(`Error ${lower} - ${upper} on url: ${url}`); 
    await sleep(10);
    console.log(`recursive_scrape(${lower},${upper}) FAILED ==> recursive_scrape(${lower},${lower + mid}) & recursive_scrape(${lower + mid},${upper})`); 
    await recurse_scrape(lower, lower + mid);
    await recurse_scrape(lower + mid, upper);
    
  } else if (Object.keys(jsonPayload).includes('features')) { 
    console.log(`INTERVAL ${lower} - ${upper}, payload length ${jsonPayload.features.length}`)
    if (jsonPayload.features.length > 0){ // only save if valid payload 
      var DATA_DIR = `${STAGING_FOLDER}/c${county_fips}_gis_${lower}.geojson`;
      const dest = fs.createWriteStream(DATA_DIR); 
      await res.body.pipe(dest);
      return true;
    }
  }
}

// download payload 
(async ()=>{
  exec(`mkdir ${STAGING_FOLDER}`);
  exec(`cd ${STAGING_FOLDER}`);

  while (lower <= 1000000) { 
    //await download_geom(lower, incr)
    console.log(`PARENT RUN FUNCTION CALLING ${lower} - ${lower + incr}`);
    await recurse_scrape(lower, lower + incr)
    // Increment 
    await sleep(10);
    lower += incr;
  }
})();



/*
RUN FROM /Users/Rich/csprojects/scrapegis/node_scraper:
$ node county_scripts/42091_montgomery/01_download_42091_gis.js


// Scrape Parcel geom and list of parcel_nums
LOOK UP map pin 30-30-134:000 =>
https://dcgis.co.delaware.pa.us/arcgis/rest/services/AssessmentViewer_Parcels/MapServer/0/query?f=geojson&where=PIN%20in%20(%2730-30-134%3A000%27)%20OR%20PIN%3D%271631502850372%27&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*

MISSING objectid = 129177
LOOK UP map pin 38-10 -071:000 =>
https://dcgis.co.delaware.pa.us/arcgis/rest/services/AssessmentViewer_Parcels/MapServer/0/query?f=geojson&where=PIN%20in%20(%2738-10-071%3A000%27)&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*


https://dcgis.co.delaware.pa.us/arcgis/rest/services/AssessmentViewer_Parcels/MapServer/0/query?f=geojson&where=OBJECTID>0 AND OBJECTID <2000 &returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*

Use list of parcel_nums to scrape data 
delcorealestate.co.delaware.pa.us/PT/Datalets/PrintDatalet.aspx?pin=30000157600&gsp=PROFILEALL_PUB&taxyear=2021&jur=023&ownseq=0&card=1&roll=REAL&State=1&item=1&items=-1&all=all&ranks=Datalet
delcorealestate.co.delaware.pa.us/pt/Datalets/PrintDatalet.aspx?gispin=30-30-134:000&gsp=PROFILEALL_PUB&taxyear=2021&jur=023&ownseq=0&card=1&roll=REAL&State=1&item=1&items=-1&all=all&ranks=Datalet

// API REFERENCE 
parcel data (limited)
http://delcorealestate.co.delaware.pa.us/PT/Datalets/SimpleDatalet.aspx?width=450&datalet=PROFILEALL&pin=36040264800&taxyr=2021&jur=023&ownseq=1&photo=false&psWidth=136&psHeight=136

sale history 
http://delcorealestate.co.delaware.pa.us/PT/Datalets/SimpleDatalet.aspx?width=450&sketch=false&photo=false&datalet=SALE_HIST&pin=36040264800&taxyr=2021&jur=023&ownseq=1

*/


