const db = require('../db')

module.exports = {
    /**
     * @state state abbreviation to filter for cities
     * @site either yp or yelp
     * @returns array of cities (from ADA scrape) that have not been Yelp scraped
     * TODO - cross reference against tiger.place table
     */
    async getTargetCity(state, site){
        
            if (site == 'yelp') {
                let queryText = 'select regexp_split_to_array((select concat_ws(\',\', city, state_abbrev) \
                                from dental_data.meta\
                                where (yelp_status <> yelp_max_pages or yelp_max_pages is null) and \
                                state_abbrev=$1 limit 1), \',\') as target;'
                try{    
                    let res = await db.query(queryText, [state]);
                    return res['rows'][0]['target']
                } catch (e) {
                    throw e
                }   
            } else if (site == 'yp') {
                let queryText = 'select regexp_split_to_array((select concat_ws(\',\', city, state_abbrev) \
                                from dental_data.meta\
                                where (yp_status <> yp_max_pages or yp_max_pages is null) and \
                                state_abbrev=$1 limit 1), \',\') as target;'
                try{    
                    let res = await db.query(queryText, [state]);
                    return res['rows'][0]['target']
                } catch (e) {
                    throw e
                }   
            } else if (site == 'bcbs'){
                let queryText = 'select regexp_split_to_array((select concat_ws(\',\', city, state_abbrev) \
                                from dental_data.meta\
                                where (bcbs_status <> bcbs_max_pages or bcbs_max_pages is null) and \
                                state_abbrev=$1 limit 1), \',\') as target;'
                try{    
                    let res = await db.query(queryText, [state]);
                    return res['rows'][0]['target']
                } catch (e) {
                    throw e
                }   
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
    async updateMetaStatus(_currentPage, _totalPages, _target, site){
        let queryText = "";
        if (site == 'yelp') {
            queryText = 'update dental_data.meta set (yelp_status, yelp_max_pages) = ($1, $2) \
                               where state_abbrev=upper($3) and city=initcap($4)';
        } else if (site == 'yp'){
            queryText = 'update dental_data.meta set (yp_status, yp_max_pages) = ($1, $2) \
                               where state_abbrev=upper($3) and city=initcap($4)';
        }
        try{
            await db.query('BEGIN');
            
            await db.query(queryText, [_currentPage, _totalPages, 
                                       _target['state'], _target['city'] ]);
            await db.query('COMMIT');
        } catch (e) {
            await db.query('ROLLBACK');
            throw e
        }
    }

}