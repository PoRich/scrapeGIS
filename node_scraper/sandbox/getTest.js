const { EWOULDBLOCK } = require('constants');
const http = require('http');
const https = require('https');

const url = 'https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272020-01-01%27'
const options = {
    hostname: url,
    //port: 80,
    //path: '',
    method: 'GET',
    //headers: {}
    timeout: 60000
  };
  
const req = https.request(url, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
      console.log('No more data in response.');
    });
  });

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });
  
  // Write data to request body
  //req.write(postData);
  req.end();

