require('dotenv').config()
const db = require('../db')
const format = require('pg-format');

// NOTE: this needs to be run from /Users/Rich/CSprojects/scrapeGIS/node_scraper
// b/c of .env file and path to db file) 

async function getPages(state_abbrev, county, city){
    try{
        await db.query('BEGIN');
        const queryText = 'SELECT max_pages from biz.dentists_meta where state_abbrev=$1 and county=$2 and city=$3 limit 1';
        const res = await db.query(queryText, [state_abbrev, county, city]);
        await db.query('COMMIT');
        return res['rows'][0]['max_pages']
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

async function getCities(state_abbrev, county){
    try{
        await db.query('BEGIN');
        const queryText = 'SELECT array(SELECT city from biz.dentists_meta where state_abbrev=$1 and county=$2 and city is not null and city <> $$[not_scraped]$$) as cities';
        const res = await db.query(queryText, [state_abbrev, county]);
        await db.query('COMMIT');
        return res['rows'][0]['cities']
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}



async function getDBCounties(state_abbrev){
    // get list of cities in a state from db
    try{
        await db.query('BEGIN');
        const queryText = 'SELECT array(SELECT county from biz.dentists_meta where state_abbrev=upper($1) and l_status is not null) as counties';
        const res = await db.query(queryText, [state_abbrev]);
        await db.query('COMMIT');
        return res['rows'][0]['counties']
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}


async function getTargetCity(){
    try{
        const queryText = 'select regexp_split_to_array((select concat_ws(\',\', city, state_abbrev, county) \
                           from biz.dentists_meta where city is not null and city <> \'[not_scraped]\' and \
                           y_max_pages is null limit 1), \',\') as target';
        var res = await db.query(queryText);
        return res['rows'][0]['target']
    } catch (e) {
        throw e
    }   
}



async function getIncompleteURLs(){
    try{
        const queryText = 'select array(select distinct src from biz.dentists where raw_st_addr is null and raw_biz is not null order by src) as url';
        var res = await db.query(queryText);
        return res['rows'][0]['url']
    } catch (e) {
        throw e
    }   
}


async function getProfileLinks(){
    try{
        const queryText = 'select d_id, y_profile from biz.dentists where raw_addr is null order by d_id';
        var res = await db.query(queryText);
        //console.log(res['rows'])
        return res['rows']
    } catch (e) {
        throw e
    }   
}

(async () => {
    // var x = await getPages('DE', 'Sussex', '[not_scraped]');
    // var x = await getCities('DE', 'New Castle');
    var x = await getProfileLinks();
    //console.log(x)
    var item1 = x[0];
    var item2 = x[1];
    console.log(`item1_d_id: ${item1['d_id']}, item1_y_profile ${item1['y_profile']}`);
})();

