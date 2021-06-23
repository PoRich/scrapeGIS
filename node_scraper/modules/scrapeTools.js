const db = require('../db')


// Random num generator (for throttling)
function rand_num(min, max) {  
    return Math.floor(
        Math.random() * (max - min) + min
    )
}


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
        } else if (site == 'loopnet_sale') {
            status = 'loopnet_sale_status';
            max = 'loopnet_sale_max_pages';   
        } else if (site == 'loopnet_lease') {
            status = 'loopnet_lease_status';
            max = 'loopnet_lease_max_pages';   
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
        console.log(`updateMetaStatus called with _currentPage ${_currentPage}, _totalPages ${_totalPages}, _target ${JSON.stringify(_target)}, site ${site}`)
        let queryText = "";
        if (site == 'yelp') {
            queryText = 'update tools.scrape_meta set (yelp_status, yelp_max_pages) = ($1, $2) \
                               where state_abbrev=upper($3) and city=$4';
        } else if (site == 'yp'){
            queryText = 'update tools.scrape_meta set (yp_status, yp_max_pages) = ($1, $2) \
                               where state_abbrev=upper($3) and city=$4'; 
        } else if (site == 'loopnet_sale'){
            queryText = 'update tools.scrape_meta set (loopnet_sale_status, loopnet_sale_max_pages) = ($1, $2) \
                               where state_abbrev=upper($3) and city=$4'; 
        } else if (site == 'loopnet_lease'){
            queryText = 'update tools.scrape_meta set (loopnet_lease_status, loopnet_lease_max_pages) = ($1, $2) \
                               where state_abbrev=upper($3) and city=$4'; 
        }
        
        try{
            await db.query('BEGIN');
            await db.query(queryText, [_currentPage, _totalPages, _target['state'], _target['city'] ]);
            await db.query('COMMIT');
            console.log(` ######## Updated tools.scrape_meta ${site} = ${_currentPage} for ${_target['city']}, ${_target['state']} ########`)
            return;
        } catch (e) {
            await db.query('ROLLBACK');
            console.log(`scrapeTools.updateMetaStatus error ${e}`)
            throw e
        }
    },
    // Generates proxy api url 
    proxy_url(targetURL){
    // check scraperapi proxy account - requires sufficient credits
    // curl "http://api.scraperapi.com/account?api_key=5fa9ed494209abb506dd2ccf7a61d4e2"
    return `http://api.scraperapi.com/?api_key=${process.env.SCRAPERAPI}&url=${targetURL}&country_code=us`;
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
    // Navigate, simulate human, wait for/solve recaptcha
    /**
     * 
     * @param {string} pageURL page to navigate to 
     * @param {object} page puppeteer page object
     * @param {function} crawlSitemap for recursive call after solving recatcha 
     * @param {string} waitForCss css selector to signal page loaded successfully 
     * @param {string} recaptchaCss css selector to signal recaptcha 
     * @param {string} recaptchaSubmitCss css selector for recaptcha submit button
     * @returns -1 if error, null if no error, payload if solved recaptcha => recursive call of crawlSitemap
     */
    async prepPage(pageURL, page, crawlSitemap, waitForCss, 
                    recaptchaCss, recaptchaSubmitCss, badUrlCss){
        try { // Navigate to URL
            await page.goto(pageURL, { waitUntil: 'load', timeout: 30000} );
            console.log(`opened the page ${pageURL}`);
            if (badUrlCss){// Try to test if page is no longer active 
                try{ 
                    await page.waitForSelector(badUrlCss, {timeout: 50});
                    return -1;
                } catch(e){ // No badUrlCss found
                }
            }
        } catch (error) {
            console.log(`failed to open the page: ${pageURL} with error: ${error}`);
        }
    
        /// Act human
        await page._client.send("Input.synthesizeScrollGesture", {
            x: 0,
            y: 0,
            xDistance: 0,
            yDistance: - rand_num(0,100),
            })

        try{ // Wait 10 seconds or target css selector to load
            await page.waitForSelector(waitForCss, {timeout: 10000});
            return;
        } catch (e) {
            console.log(`No results on page: ${e} | Looking for Recaptcha ... `)
            // ==================== RECAPTCHA CODE BLOCK [START] ====================
            try{ // TODO - get recaptcha css selector 
                await page.waitForSelector(recaptchaCss, {timeout: 5000});
                await page.solveRecaptchas();  // puppeteer 2captcha plugin
                await Promise.all([
                    page.waitForNavigation(),
                    // TODO - get recaptcha submit button css selector 
                    page.click(recaptchaSubmitCss)
                ]); // Recursive call after solving recaptcha 
                var payload2 = crawlSitemap(pageURL, page)
                console.log(`*************** Recaptcha Solved ***************`)
                return payload2;
            } catch (e2) {
                console.log(`No results on page [no Recaptcha found]: ${e2}`)    
                return -1;
            }
            // ==================== RECAPTCHA CODE BLOCK [END] ====================
        }
    }, 
    // converts an array into an object, divisor is the count in between keys 
    toObject(arr, divisor){
        var rv = {};    
        for (var i=0; i<arr.length; ++i){
            if (i % divisor === 0){
                const k = arr[i];
                rv[k] = arr[i+1];
            }
        }
        return rv;
    },
    /** Javascript version of Python's zip function; 
     *  @param {array} arrays array of arrays of equal length 
     *  @returns {array} 
     * */ 
    zip(arrays) {
        return arrays[0].map(function(_,i){
            return arrays.map(function(array){return array[i]})
        });
    }, 
    /**
     * @param {array} labelsArray 
     * @param {array} dataArray 
     * @returns {object}
     */
    zipObject(labelsArray, dataArray){
        var p = {};
        for (var i=0; i<labelsArray.length; ++i){
            const k = labelsArray[i]
            p[k] = dataArray[i];
        }
        return p; 
    }

}