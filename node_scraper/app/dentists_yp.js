const puppeteerExtra = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')  // Add adblocker plugin to block all ads and trackers (saves bandwidth)
require('dotenv').config();
const db = require('../db')
const ScrapeTools = require('../modules/scrapeTools.js');


//puppeteerExtra.use(require('puppeteer-extra-plugin-repl')())
puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(AdblockerPlugin({ blockTrackers: true }));
puppeteerExtra.use(
    RecaptchaPlugin({
        provider:{
            id: '2captcha', 
            token: process.env.TWOCAPTCHA,  
        },
        visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    })
)

require('dotenv').config();

// User-Agent helper
const preparePageForTests = async (page) => {
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
//const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 7_1_2 like Mac OS X) AppleWebKit/537.51.2 (KHTML, like Gecko) Version/7.0 Mobile/11D257 Safari/9537.53';
await page.setUserAgent(userAgent);
await page.setViewport({  // set screen resolution
    width: 1366,
    height: 768   
 });
}

// THESE ARE FOR YELP, NEED TO RECALIBRATE FOR YELLOW PAGES 
const recaptchaCss = '.g-recaptcha'; 
const recaptchaSubmitCss = '.ybtn.ybtn--primary';


// =================== STEP 1: INITIAL SCRAPE ===================
var target = {};

(async () => {
    /*
    // pull list of states to scrape 
     var states_hitlist = await ScrapeTools.getTargetState('yp');
    // var states_hitlist = ['TX'];
    //console.log(`state list ${states_hitlist}`);
    while (states_hitlist.length >0) {
        await initial_scrape(states_hitlist.pop());
    }
    */
    geocodePostFacto();
})();


/**
 * takes tiger list of cities and saves help search results 
 *  @result null;
 */
 async function initial_scrape(targetState) {
    // prep chronium 
    let browser = await puppeteerExtra.launch({headless: true});
    let page = await browser.newPage();
    await preparePageForTests(page);
    
    // pull city to scrape from db

    var _target = await ScrapeTools.getTargetCity(targetState, 'yp'); 
    console.log(`******* CURRENT TARGET CITY: ${_target} ******`)

    while (_target){
        // scrape summary listings for each city 
        target['city'] =  _target[0];
        target['state'] = _target[1];
        //target['county'] = _target[2];

        console.log(`========= SCRAPING YELLOW PAGES city: ${target['city']}, state ${target['state']} ==============`);
        let pageNum = 1;
        let nextPage = true;
        
        // Given a target city, search and save results 
        while (nextPage) {
            console.log(`***************** SCRAPING PAGE # ${pageNum} of ${target['city']}, ${target['state']} ***************** `);
            let relevantResults = 0
            let localitySearch = `${target['city']}-${target['state']}`.toLowerCase();
            var url = `https://www.yellowpages.com/${localitySearch}/dentists?page=${pageNum}`
            var bizData = await scrapeYP(url, page) // scrape general search results 
            //console.log(`bizData: ${JSON.stringify(bizData)}`)
            if (bizData == -1 || !bizData || bizData.length == 0){  // if no search results 
                await ScrapeTools.updateMetaStatus(-1, -1, target, 'yp');
                console.log(`No search results for ${target['city']}-${target['state']}`)
                break
            } 
            else {
                // save detail for individual business
                for(let i=0; i<bizData.length; i=i+1){
                    await saveBizYP(bizData[i], target, url)
                    console.log(`Saved/Processed ${bizData[i]['biz_name']} to db`)
                    // count the number of results actually in the target city 
                    relevantResults = bizData[i]['profile_url'].includes(localitySearch) ? relevantResults + 1 : relevantResults;
                }
                console.log(`================ ${relevantResults} Relevant Results on page ================`)
                // update meta tracker
                await ScrapeTools.updateMetaStatus(pageNum, pageNum, target, 'yp');
                // move on to the next page if there are relevant results, up to page 5
                pageNum += 1; 
                // scraper may not reach page 5 if there are no results on a page less than 5
                // yellow pages may show the same repeated ads on every page, make sure results are > 7
                nextPage = ((relevantResults > 0 && bizData.length > 7) || pageNum <= 5) ? true : false;
            }
        }

    // get next target 
    _target = await ScrapeTools.getTargetCity(targetState, 'yp'); 
    }
    await browser.close();
}

async function scrapeYP(pageURL, page){
    try { // try to go to URL
        await page.goto(pageURL, { waitUntil: 'load', timeout: 10000} );
        console.log(`opened the page ${pageURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${pageURL} with error: ${error}`);
        return -1;
    }

    /// act human
    await page._client.send("Input.synthesizeScrollGesture", {
        x: 0,
        y: 0,
        xDistance: 0,
        yDistance: - ScrapeTools.rand_num(0,100),
        })

    try{
        await page.waitForSelector('div[class="info"]', {timeout: 5000});
    } catch (e) {
        console.log(`No results on page: ${e}`)
        return -1;
    }

    // NOTE: $eval is the same as document.querySelector; $$eval is the same as document.querySelectorAll
    // document.querySelectorAll('li[class="column-list__column__item"]').forEach(function(x){ console.log(x.innerText) })
    const payload = await page.evaluate(() => {
        var parentElement = Array.from(document.querySelectorAll('div[class="info"]'));
        // Gather desired elements
        var bizPayload = parentElement.map(function (e, i){
            try{
                let currentYear = new Date().getFullYear();
                const street_addr = e.querySelectorAll('div[class="street-address"]')[0]?.innerText;
                const locality = e.querySelectorAll('div[class="locality"]')[0]?.innerText;
                let scraped_data = { // preprocess
                    biz_name: e.querySelectorAll('a[class="business-name"]')[0]?.innerText,
                    specialty: e.querySelectorAll('div[class="categories"]')[0]?.innerText,
                    yearEst: e.querySelectorAll('div[class="years-in-business"] > div[class="count"]') ? String(currentYear - Number(e.querySelectorAll('div[class="years-in-business"] > div[class="count"]')[0]?.innerText)) : null,
                    profile_url: e.querySelectorAll('a[class="business-name"]')[0].href,
                    rating: e.querySelectorAll('span[class="count"]')[0]?.parentElement.className.replace('result-rating ','').trim(),
                    numRatings: e.querySelectorAll('span[class="count"]')[0]?.innerText, 
                    website: e.querySelector('div[class="links"]')?.firstElementChild?.href, 
                    phone: e.querySelectorAll(".phone")[0]?.innerText,  
                    full_addr: e.querySelectorAll('p[class="adr"]')[0]?.innerText ? e.querySelectorAll('p[class="adr"]')[0]?.innerText : street_addr + ', ' + locality, 
                    st_addr: street_addr,  
                    locality: locality,  
                }
                return scraped_data;
            } catch(e){
                console.log(e);
            }
        });
        
        return bizPayload;
    })
    return payload;
}

// database helper functions
async function saveBizYP(payload, _target, url){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO dental_data.ypages(biz_name, specialty, year_est, rating, num_reviews, \
                            website, phone, full_addr, st_addr, locality, target_city, state_abbrev, profile_url, src) \
                            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, upper($12), $13, $14) \
                            ON CONFLICT ON CONSTRAINT ypages_profile_url_key \
                            DO UPDATE SET (rating, num_reviews, profile_url, last_update) = \
                            (EXCLUDED.rating, EXCLUDED.num_reviews, EXCLUDED.profile_url, now()) RETURNING d_id';
        await db.query(queryText, [payload['biz_name'], payload['specialty'], payload['yearEst'], 
                                  payload['rating'], payload['numRatings'], payload['website'], 
                                  payload['phone'], payload['full_addr'], payload['st_addr'], payload['locality'], 
                                  _target['city'], _target['state'], payload['profile_url'], url]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}


/**
 * Revisits yellow pages business profile pages and scrapes geocode info
 */
 async function geocodePostFacto(){
    // get urls 
    const urlsQuery = await db.query('select array_agg(profile_url) urls from dental_data.ypages where the_geom is null');
    let profileURLs = urlsQuery['rows'][0]['urls'];

    // Start browser, open new page, prep use-agent 
    let browser = await puppeteerExtra.launch({headless: true});
    let page = await browser.newPage();
    ScrapeTools.preparePageForTests(page);

    while (profileURLs.length > 0){
        let profileURL = profileURLs.pop(); 
        let url = await getDirectionsURL(profileURL, page, 'a.directions');
        
        if (url === -1){
            console.log(`************ unable to get DirectionURL for ${profileURL} ************`)    
            continue;
        }

        console.log(`************ scraping geom from ${url} ************`)
        let payload = await scrapeGeom(url, page, 'div#map img');
        console.log(`payload -> ${JSON.stringify(payload)}`);
        if (payload !== -1){
            // save lnglat 
            try{
                await db.query('BEGIN');
                const queryText = 'update dental_data.ypages set \
                        the_geom=ST_SetSRID(ST_MakePoint($1::float, $2::float), 4269) where profile_url=$3';
                await db.query(queryText, [payload[0], payload[1], profileURL]);
                await db.query('COMMIT');
            } catch (e) {
                console.log(`failed to save geom: ${e}`)
                await db.query('ROLLBACK');
                throw e
            }
        }
    }
    await browser.close();
    return;
}

async function getDirectionsURL(pageURL, page, waitForCss){
    const r = await ScrapeTools.prepPage(pageURL, page, scrapeGeom, waitForCss, recaptchaCss, recaptchaSubmitCss);
    if (r===-1){
        return -1;
    }
    return page.evaluate((_waitForCss)=>{
        var directionlink = document.querySelector(_waitForCss).href;
        return directionlink;
    }, waitForCss)
}

async function scrapeGeom(pageURL, page, waitForCss){
    await ScrapeTools.prepPage(pageURL, page, scrapeGeom, waitForCss, recaptchaCss, recaptchaSubmitCss);
    return page.evaluate((_waitForCss)=>{ 
        var mapSrc = document.querySelector(_waitForCss).getAttribute('src');
        let lon_regex = /%2C(-?\d{1,3}\.\d{3,})&zoom/; // '%2C' is hex encoding for comma
        let lat_regex = /markers=(-?\d{1,3}\.\d{3,})%2C/; // '%2C' is hex encoding for comma
        let lngLat = null
        if (lon_regex.exec(mapSrc)){
            lngLat = [lon_regex.exec(mapSrc)[1], lat_regex.exec(mapSrc)[1]]
        }
        return lngLat ? lngLat : -1;
    }, waitForCss);
};
