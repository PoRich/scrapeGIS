const fetch = require('node-fetch');
const fs = require('fs');
// const scrapeTools = require('../../modules/scrapeTools');
const exec = require('child_process').exec;
const format = require('pg-format');
require('dotenv').config();

var incr = 2000;
var upper = 0 + incr;  // API will not return more than 2000 records
const STAGING_FOLDER = '/Users/Rich/Downloads/scrape_temp'
var tableName = 'c42107_gis';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkStatus(res) {
  if (res.ok) { // res.status >= 200 && res.status < 300
      return res;
  } else {
      throw MyCustomError(res.statusText);
  }
}

async function dl_bucks_county(_upper){
  var url = `https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=geojson&where=OBJECTID%20%3E%20${upper-2000}%20AND%20OBJECTID%20%3C%20${upper}%20&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=102100&quantizationParameters=\{%22mode%22:%22edit%22\}`;
  const res = await fetch(url);  
  var DATA_DIR = `${STAGING_FOLDER}/c42017_gis_${_upper}.geojson`;
  const dest = fs.createWriteStream(DATA_DIR); 
  await res.body.pipe(dest);
}

// download payload 
(async ()=>{
  exec(`mkdir ${STAGING_FOLDER}`);
  exec(`cd ${STAGING_FOLDER}`);

  while (upper <= 600000) {   
    await dl_bucks_county(upper)
    // Increment 
    await sleep(10);
    console.log(`API hit ${upper}`)
    upper += incr;
  }
})();

/*
OBJECTID IS MULTIPOLYGON (VS POLYGON)
8726
9408
9966
101824
103090
103574
103806
104480

> Object.keys(r);
[
  'objectIdFieldName',
  'uniqueIdField',
  'globalIdFieldName',
  'geometryProperties',
  'geometryType',
  'spatialReference',
  'transform',
  'fields',
  'features'
]

r.geometryProperties
{
  shapeAreaFieldName: 'Shape__Area',
  shapeLengthFieldName: 'Shape__Length',
  units: 'esriMeters'
}

r.geometryType
'esriGeometryPolygon'

r.spatialReference
{ wkid: 102100, latestWkid: 3857 }


 r.transform
{
  originPosition: 'upperLeft',
  scale: [ 0.0001, 0.0001, 0, 0 ],
  translate: [ -20037700, -30241100, 0, 0 ]
}

r.fields
[
  {
    name: 'OBJECTID',
    type: 'esriFieldTypeOID',
    alias: 'OBJECTID',
    sqlType: 'sqlTypeOther',
    domain: null,
    defaultValue: null
  },
  {
    name: 'PARCEL_NUM',
    type: 'esriFieldTypeString',
    alias: 'PARCEL_NUM',
    sqlType: 'sqlTypeOther',
    length: 22,
    domain: null,
    defaultValue: null
  },
  {
    name: 'ADDRESS',
    type: 'esriFieldTypeString',
    alias: 'ADDRESS',
    sqlType: 'sqlTypeOther',
    length: 69,
    domain: null,
    defaultValue: null
  },
  {
    name: 'MUNICIPALITY',
    type: 'esriFieldTypeString',
    alias: 'MUNICIPALITY',
    sqlType: 'sqlTypeOther',
    length: 29,
    domain: null,
    defaultValue: null
  },
  {
    name: 'DEED_AREA',
    type: 'esriFieldTypeString',
    alias: 'DEED_AREA',
    sqlType: 'sqlTypeOther',
    length: 26,
    domain: null,
    defaultValue: null
  },
  {
    name: 'OWNER1',
    type: 'esriFieldTypeString',
    alias: 'OWNER1',
    sqlType: 'sqlTypeOther',
    length: 40,
    domain: null,
    defaultValue: null
  },
  {
    name: 'OWNER2',
    type: 'esriFieldTypeString',
    alias: 'OWNER2',
    sqlType: 'sqlTypeOther',
    length: 40,
    domain: null,
    defaultValue: null
  },
  {
    name: 'CARE_OF',
    type: 'esriFieldTypeString',
    alias: 'CARE_OF',
    sqlType: 'sqlTypeOther',
    length: 60,
    domain: null,
    defaultValue: null
  },
  {
    name: 'LAND_VALUE_',
    type: 'esriFieldTypeDouble',
    alias: 'LAND_VALUE$',
    sqlType: 'sqlTypeOther',
    domain: null,
    defaultValue: null
  },
  {
    name: 'BUILDING_VALUE_',
    type: 'esriFieldTypeDouble',
    alias: 'BUILDING_VALUE$',
    sqlType: 'sqlTypeOther',
    domain: null,
    defaultValue: null
  },
  {
    name: 'TOTAL_VALUE_',
    type: 'esriFieldTypeDouble',
    alias: 'TOTAL_VALUE$',
    sqlType: 'sqlTypeOther',
    domain: null,
    defaultValue: null
  },
  {
    name: 'LAND_USE_CODE',
    type: 'esriFieldTypeString',
    alias: 'LAND_USE_CODE',
    sqlType: 'sqlTypeOther',
    length: 40,
    domain: null,
    defaultValue: null
  },
  {
    name: 'ZONING',
    type: 'esriFieldTypeString',
    alias: 'ZONING',
    sqlType: 'sqlTypeOther',
    length: 8,
    domain: null,
    defaultValue: null
  },
  {
    name: 'Shape__Area',
    type: 'esriFieldTypeDouble',
    alias: 'Shape__Area',
    sqlType: 'sqlTypeDouble',
    domain: null,
    defaultValue: null
  },
  {
    name: 'Shape__Length',
    type: 'esriFieldTypeDouble',
    alias: 'Shape__Length',
    sqlType: 'sqlTypeDouble',
    domain: null,
    defaultValue: null
  }
]

// get the first ownership record 
r.features[0].attributes
// get the first gemoetry record 
r.features[0].geometry


// API REFERENCE 

// Object ID
https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=json&where=OBJECTID%20%3E%20200%20AND%20OBJECTID%20%3C%20300%20&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=102100&quantizationParameters={%22mode%22:%22edit%22}


// search by parcel number
https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=json&where=UPPER(PARCEL_NUM) LIKE '%332%'&returnGeometry=false&spatialRel=esriSpatialRelIntersects&outFields=PARCEL_NUM,OBJECTID&outSR=102100&resultRecordCount=6&quantizationParameters={"mode":"edit"}
02-058-062
const r = fetch('https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=json&where=UPPER(PARCEL_NUM)%20LIKE%20%27%2526-015-214%25%27&returnGeometry=true&spatialRel=esriSpatialRelIntersects&maxAllowableOffset=0.01866138385297604&outFields=*&outSR=102100&resultRecordCount=6&quantizationParameters=%7B%22mode%22%3A%22edit%22%7D')


https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=json&where=UPPER(PARCEL_NUM)%20LIKE%20%27%2501-011-158%25%27&returnGeometry=true&spatialRel=esriSpatialRelIntersects&maxAllowableOffset=0.01866138385297604&outFields=*&outSR=102100&resultRecordCount=6&quantizationParameters=%7B%22mode%22%3A%22edit%22%7D
'26-015-214'
https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=json&where=UPPER(PARCEL_NUM)%20LIKE%20%27%2526-015-214%25%27&returnGeometry=true&spatialRel=esriSpatialRelIntersects&maxAllowableOffset=0.01866138385297604&outFields=*&outSR=102100&resultRecordCount=6&quantizationParameters=%7B%22mode%22%3A%22edit%22%7D


// search by owner name
https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=json&where=UPPER(OWNER1)%20LIKE%20%27%25SMITH%25%27%20or%20UPPER(OWNER2)%20LIKE%20%27%25SMITH%25%27&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=102100&resultRecordCount=500000&quantizationParameters=%7B%22mode%22%3A%22edit%22%7D
https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=json&where=UPPER(OWNER1)%20LIKE%20%27%25A%25%27%&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=102100&resultRecordCount=500000&quantizationParameters=%7B%22mode%22%3A%22edit%22%7D
https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/ParcelsMay2019/FeatureServer/0/query?f=json&where=OBJECTID=46124&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=102100&quantizationParameters={"mode":"edit"}

*/