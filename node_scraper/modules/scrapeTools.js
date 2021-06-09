const db = require('../db')

module.exports = {
    /**gets states that have not yet been scraped */
    async getTargetState(site){
        let colName = null;
        if (site==='yp'){
            colName='yp_status';        
        } else if (site==='yelp'){
            colName='yelp_status';
        }else if (site==='loopnet'){
            colName='loopnet_status';
        }else{
            throw new UserException('unrecognized site; HINT: must be yelp, yp, loopnet or bcbs')
        }
        try{
            let res = await db.query('select array(select distinct state_abbrev \
                from tools.scrape_meta where $1 is null) \
                as target;', [colName]);
            return res['rows'][0]['target'];
        } catch(e){
            throw e;
        }
    },
    /**
     * @state state abbreviation to filter for cities
     * @site either yp or yelp
     * @returns array of cities (from ADA scrape) that have not been Yelp scraped
     * TODO - cross reference against tiger.place table
     */
    async getTargetCity(state, site){
        let status = null;
        let max = null;
        if (site == 'yelp') {
            status = 'yelp_status';
            max = 'yelp_max_pages';
        } else if (site == 'yp') {
            status = 'yp_status';
            max = 'yp_max_pages';   
        } else if (site == 'loopnet') {
            status = 'loopnet_status';
            max = 'loopnet_max_pages';   
        } else if (site == 'bcbs'){
            status = 'bcbs_status';
            max = 'bcbs_max_pages';   
        } else{
            throw new UserException('unrecognized site; HINT: must be yelp, yp, loopnet or bcbs')
        }

        try{    
            let res = await db.query('select regexp_split_to_array((select concat_ws(\';\', city, state_abbrev) \
            from tools.scrape_meta\
            where ($1 <> $2 or $2 is null) and \
            state_abbrev=$3 limit 1), \';\') as target;', [status, max, state]);
            console.log(`###### Retrieved target city ${res['rows'][0]['target']} for ${site} scraper ######`)
            return res['rows'][0]['target']
        } catch (e) {
            throw e
        }   
    },
    async updateMetaStatus(_currentPage, _totalPages, _target, site){
        // do not convert city capitalization it will not match McConnellsburg 
        let queryText = "";
        if (site == 'yelp') {
            queryText = 'update tools.scrape_meta set (yelp_status, yelp_max_pages) = ($1, $2) \
                               where state_abbrev=upper($3) and city=$4';
        } else if (site == 'yp'){

            queryText = 'update tools.scrape_meta set (yp_status, yp_max_pages) = ($1, $2) \
                               where state_abbrev=upper($3) and city=$4'; 
        }
        try{
            await db.query('BEGIN');
            await db.query(queryText, [_currentPage, _totalPages, 
                                       _target['state'], _target['city'] ]);
            await db.query('COMMIT');
            console.log(` ######## Updated tools.scrape_meta yp_status = ${_currentPage} for ${_target['city']}, ${_target['state']} ########`)
        } catch (e) {
            await db.query('ROLLBACK');
            throw e
        }
    },
    // Generates proxy api url 
    proxy_url(targetURL){
    // check scraperapi proxy account - requires sufficient credits
    // curl "http://api.scraperapi.com/account?api_key=5fa9ed494209abb506dd2ccf7a61d4e2"
    return `http://api.scraperapi.com/?api_key=${process.env.SCRAPERAPI}&url=${targetURL}&country_code=us`;
    },
    // Random num generator (for throttling)
    rand_num(min, max) {  
    return Math.floor(
        Math.random() * (max - min) + min
    )
    },
    // User-Agent helper
    async preparePageForTests(page){
        const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
        await page.setUserAgent(userAgent);
        await page.setViewport({  // set screen resolution
            width: 1366,
            height: 768   
        });
    },

}