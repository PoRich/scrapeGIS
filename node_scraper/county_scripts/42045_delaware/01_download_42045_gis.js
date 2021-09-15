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
var upper = 0 + incr;  // API will not return more than 2000 records
var county_fips = '42045';
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

async function download_geom(_upper, _incr){
  var url = `https://dcgis.co.delaware.pa.us/arcgis/rest/services/AssessmentViewer_Parcels/MapServer/0/query?f=geojson&where=OBJECTID>${_upper-_incr} AND OBJECTID <${_upper} &returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*`

  const res = await fetch(url).then(res => checkStatus(res));  // get payload 
  const res2 = await fetch(url).then(res => checkStatus(res));  // get metadata 
  // https://github.com/node-fetch/node-fetch/issues/396
  // const res2 = await res.clone(); // doesn't work on large responses

  var jsonPayload = await res2.json();
  if (Object.keys(jsonPayload).includes('error')){
    console.log(`upper ${_upper} -> API error ${url}`); // Check API payload
  } else if (Object.keys(jsonPayload).includes('features')) {
    console.log(`upper ${_upper} payload length ${jsonPayload.features.length}`)
    if (jsonPayload.features.length > 0){ // only save if valid payload 
      var DATA_DIR = `${STAGING_FOLDER}/c${county_fips}_gis_${_upper}.geojson`;
      const dest = fs.createWriteStream(DATA_DIR); 
      await res.body.pipe(dest);
    }
  }

}

// download payload 
(async ()=>{
  exec(`mkdir ${STAGING_FOLDER}`);
  exec(`cd ${STAGING_FOLDER}`);

  while (upper <= 1200000) { 
    await download_geom(upper, incr)
    // Increment 
    await sleep(10);
    upper += incr;
  }
})();

/*
RUN FROM /Users/Rich/csprojects/scrapegis/node_scraper:
$ node county_scripts/42091_montgomery/01_download_42091_gis.js


// Scrape Parcel geom and list of parcel_nums
https://dcgis.co.delaware.pa.us/arcgis/rest/services/AssessmentViewer_Parcels/MapServer/0/query?f=geojson&where=PIN%20in%20(%2730-30-134%3A000%27)%20OR%20PIN%3D%271631502850372%27&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*
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


