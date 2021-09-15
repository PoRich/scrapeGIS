const fetch = require('node-fetch');
const fs = require('fs');
// const scrapeTools = require('../../modules/scrapeTools');
const exec = require('child_process').exec;
// const format = require('pg-format');
require('dotenv').config();

// Bypass fetchError:  unable to verify the first certificate (this is not secure)
// https://stackoverflow.com/questions/20082893/unable-to-verify-leaf-signature
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';   

var incr = 2000;
var upper = 0 + incr;  // API will not return more than 2000 records
var county_fips = '42091';
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

async function download_geom(_upper){
  var url = `https://gis.montcopa.org/arcgis/rest/services/IAS/Tax_Parcels_IAS_GCS/MapServer/0/query?f=geojson&where=OBJECTID%3E%27${upper-2000}%27%20AND%20OBJECTID%3C%27${upper}%27%20&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*`
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

  while (upper <= 600000) { 
    await download_geom(upper)
    // Increment 
    await sleep(10);
    upper += incr;
  }
})();

/*
RUN FROM /Users/Rich/csprojects/scrapegis/node_scraper:
$ node county_scripts/42091_montgomery/01_download_42091_gis.js


testing 
(async()=>{
  // var url = `https://gis.montcopa.org/arcgis/rest/services/IAS/Tax_Parcels_IAS_GCS/MapServer/0/query?f=geojson&where=OBJECTID>'112000' AND OBJECTID<'114000' &returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*`
  var url = `https://gis.montcopa.org/arcgis/rest/services/IAS/Tax_Parcels_IAS_GCS/MapServer/0/query?f=geojson&where=OBJECTID<'100' &returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*`
  const res = await fetch(url);
  const body = await res.json();
  // console.log(JSON.stringify(body));
  // console.log(response.ok);
  // cosole.log(body.type=== "FeatureCollection");
  console.log(Object.keys(body));
  if (Object.keys(body).includes('error')){
    console.log(`error`);
  } else if (Object.keys(body).includes('features')) {
    console.log(`payload length ${body.features.length}`)
  }
})();


// Scrape Parcel geom and list of parcel_nums
https://gis.montcopa.org/arcgis/rest/services/IAS/Tax_Parcels_IAS_GCS/MapServer/0/query?f=geojson&where=OBJECTID%3E%27500%27%20AND%20OBJECTID%3C%271000%27%20&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*

Use list of parcel_nums to scrape data 
https://propertyrecords.montcopa.org/PT/Datalets/PrintDatalet.aspx?pin=530004670029&gsp=PROFILEALL&taxyear=2021&jur=046&ownseq=0&card=1&roll=REAL&State=1&item=1&items=-1&all=all&ranks=Datalet



// API REFERENCE 
parcel data (limited)
https://propertyrecords.montcopa.org/PT/Datalets/SimpleDatalet.aspx?width=450&datalet=PROFILEALL&pin=530004670029&taxyr=2021&jur=046&ownseq=1&photo=false&psWidth=136&psHeight=136
sale history 
https://propertyrecords.montcopa.org/PT/Datalets/SimpleDatalet.aspx?width=450&sketch=false&photo=false&datalet=SALE_HIST&pin=530004670029&taxyr=2021&jur=046&ownseq=1

*/