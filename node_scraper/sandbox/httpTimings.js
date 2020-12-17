//https://blog.risingstack.com/measuring-http-timings-node-js/#contact-us
const request = require('request')

const target_uri = "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+business_licenses&filename=business_licenses&format=shp&skipfields=cartodb_id"
request({
  uri: target_uri,
  method: 'GET',
  time: true
}, (err, resp) => {
  console.log(err || resp.timings)
})