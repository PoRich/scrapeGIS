require('dotenv').config()
const db = require('../db')
const format = require('pg-format');

// NOTE: this needs to be run from /Users/Rich/CSprojects/scrapeGIS/node_scraper
// b/c of .env file and path to db file) 

let sql_cmd = 'Select NOW() as now';

db.query(sql_cmd, (err, res) =>{
    if (res.rows){
        console.log(`${res.rows}`);
    }
    if (err){
        console.log(`Error: ${err.stack}`)
    }
});

db.query('SELECT COUNT(*) FROM reiq.addrs', (err, res) =>{
        console.log(res.rows);  //if return first row: res.rows[0] 
        if (err){
            console.log(`Error: ${err.stack}`)
        }
});


(async function() {
    db.query('SELECT COUNT(*) FROM reiq.addrs', (err, res) =>{
        console.log(res.rows);  //if return first row: res.rows[0] 
        if (err){
            console.log(`Error: ${err.stack}`)
        }
        return res.rows[0]; 
    });
})();


// async function 
//save to db save('testurl3.com', 'christie', 'bobby', 'james')
async function save(uri, f,m,l){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO tools.whitepages(uri, f, m, l) VALUES($1, $2, $3, $4) RETURNING wp_id';
        const res = await db.query(queryText, [uri, f, m, l]);
        // add more queries here
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

// load from db
db.query('SELECT uri::text[] FROM tools.whitepages WHERE depth=$1',['2']).then(res =>{
    let links = res.rows[0]['uri'];
    //console.log(typeof(links));
    console.log(links[1]);
    }).catch( (e) => console.log(`error ${e.stack}`))


/* // using client
const { Client } = require('pg')
const client = new Client()
client.connect()

client.query('SELECT $1::text as message', ['Hello world!'], (err, res) => {
    console.log(err ? err.stack : res.rows[0].message) 
    client.end()
  })
  

*/