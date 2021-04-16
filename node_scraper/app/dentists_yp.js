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



// =================== STEP 1: INITIAL SCRAPE ===================

//const targetState = 'IL';
var target = {};
(async () => {
    initial_scrape('IL');
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
    console.log(`_target ${_target}`)

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
            let relevantResults = 0
            var url = `https://www.yellowpages.com/${target['city']}-${target['state']}/dentists?page=${pageNum}`
            var bizData = await scrapeYP(url, page) // scrape general search results 
            console.log(`bizData: ${json.stringify(bizData)}`)
            if (bizData == -1 || !bizData || bizData.length == 0){  // if no search results 
                console.log(`No search results for ${target['city']}-${target['state']}`)
                break
            } 
            else {
                // save detail for individual business
                for(let i=0; i<bizData.length; i=i+1){
                    console.log(`profile ${bizData[i]['profile_url']}`)
                    await saveBizYP(bizData[i], target, url)
                    console.log(`Saved ${bizData[i]['name']} to db`)
                    // count the number of results actually in the target city 
                    relevantResults = bizData[i]['profile_url'].includes(`${target['city']}-${target['state']}`) ? relevantResults + 1 : relevantResults;
                }
                // update meta tracker
                await ScrapeTools.updateMetaStatus(pageNum, pageNum, target, 'yp');
                // move on to the next page if there are relevant results, up to page 5
                pageNum += 1; 
                nextPage = (relevantResults > 0 || pageNum <= 5) ? true : false;
            }
        }

    // get next target 
    _target = await ScrapeTools.getTargetCity(targetState, 'yp'); 
    }
    await browser.close();
}

async function scrapeYP(pageURL, page){
    try { // try to go to URL
        await page.goto(pageURL, { waitUntil: 'load', timeout: 36000} );
        console.log(`opened the page ${pageURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${pageURL} with error: ${error}`);
    }

    /// act human
    await page._client.send("Input.synthesizeScrollGesture", {
        x: 0,
        y: 0,
        xDistance: 0,
        yDistance: - ScrapeTools.rand_num(0,100),
        })

    try{
        await page.waitForSelector('div[class="info"]', {timeout: 48000});
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
                let scraped_data = { // preprocess
                    biz_name: e.querySelectorAll('a[class="business-name"]')[0].innerText,
                    specialty: e.querySelectorAll('div[class="categories"]').length > 0 ? e.querySelectorAll('div[class="categories"]')[0].innerText : null,
                    yearsInBiz: e.querySelectorAll('div[class="years-in-business"] > div[class="count"]').length > 0 ? currentYear - Number(e.querySelectorAll('div[class="years-in-business"] > div[class="count"]')[0].innerText): null,
                    profile_url: e.querySelectorAll('a[class="business-name"]')[0].href,
                    rating: e.querySelector('div[class="ratings"] > a[class="rating"]') ? e.querySelector('div[class="ratings"] > a[class="rating"]').firstElementChild.className.replace("result-rating ","").trim() : null,
                    numRatings: e.querySelectorAll('div[class="ratings"] > a[class="rating"]') ? e.querySelectorAll('div[class="ratings"] > a[class="rating"]')[0].innerText : null, 
                    website: e.querySelector('div[class="links"]') ? e.querySelector('div[class="links"]').firstElementChild.href : null, 
                    phone: e.querySelector(".phone") ? e.querySelector(".phone").innerText : null, 
                    addr: e.querySelector('div[class="street-address"]') ? e.querySelector('div[class="street-address"]').innerText : null,
                    locality: e.querySelector('div[class="locality"]') ? e.querySelector('div[class="locality"]').innerText : null
                    }
                return scraped_data;
            } catch(e){
                console.log(e);
            }
        });
        /*
        var bizPayload = pre.map( e => {
            let currentYear = new Date().getFullYear();
            return {
                biz_name: e.biz_name[0].innerText,
                specialty: e.specialty.length >= 1 ? e.specialty[0].innerText : null,
                yearEst: e.yearsInBiz.length >= 1 ? currentYear - Number(e.yearsInBiz[0].innerText) : null,
                profile_url: e.profile_url[0].href,
                rating: e.rating,
                numRatings: e.numRatings, 
                website: e.website, 
                phone: e.phone, 
                addr: e.addr,
                locality: e.locality
            }
        })
        */
        return bizPayload;
    })
    return payload;
}

// database helper functions
async function saveBizYP(payload, _target, url){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO dental_data.ypages(biz_name, specialty, year_est, rating, num_reviews, \
                            website, phone, addr1, addr2, state_abbrev, profile_url, src) \
                            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, upper($10), $11, $12) \
                            ON CONFLICT ON CONSTRAINT yelp_biz_name_addr_key \
                            DO UPDATE SET (rating, num_reviews, profile_url, last_update) = \
                            (EXCLUDED.rating, EXCLUDED.num_reviews, EXCLUDED.profile_url, now()) RETURNING d_id';
        await db.query(queryText, [payload['biz_name'], payload['specialty'], payload['yearEst'], 
                                  payload['rating'], payload['numRatings'], payload['website'], 
                                  payload['phone'], payload['addr'], payload['locality'], 
                                  _target['state'], payload['profile_url'], url]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}