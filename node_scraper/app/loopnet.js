/** NOTE: RUN THIS FILE FROM THE APP DIR AS 'node app/whitepages.js'*/
const puppeteer = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')  // Add adblocker plugin to block all ads and trackers (saves bandwidth)
const db = require('../db')
const ScrapeTools = require('../modules/scrapeTools.js');
puppeteer.use(AdblockerPlugin({ blockTrackers: true }))
require('dotenv').config();

/**
 * keep track of last update in tools.meta db table
 * keep track of pages scraped in tools.scrape_meta db table
 */

var target = {
    state: 'PA', // upper case 
    city: 'Philadelphia' // case sensitive
}

(async () =>{
    // Start browser, open new page, prep use-agent 
    let browser = await puppeteer.launch({headless: true});
    let page = await browser.newPage();
    ScrapeTools.preparePageForTests(page);

    // =================== PART 1: Inital Crawl for site map ===================
    // RUN THIS ONCE; aftwards, load from database
    var pageURL = `https://www.loopnet.com/search/commercial-real-estate/${target.city}-${target.state}/for-sale/${currentPage}/`;
    var totalPages = 1;
    var currentPage = 1;

    while (currentPage <= totalPages){
        var totalPages, linkObj = await crawlSitemap(pageURL, page);
        if (totalPages === -1) {
            // means no search results or failed to solve recaptcha 
            break;
        }
        saveListingUrl(linkObj);
        ScrapeTools.updateMetaStatus(currentPage, totalPages, target, 'loopnet')    
        // Increment page
        currentPage = currentPage + 1;
    }
    // TODO get next target city, state
});



// =================== helper functions ===================
// Given a starting URL of city and search type (for sale vs for lease), returns list of listing URLs
async function crawlSitemap(pageURL, page){
    
    try { // Navigate to URL
        await page.goto(pageURL, { waitUntil: 'load', timeout: 36000} );
        console.log(`opened the page ${pageURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${pageURL} with error: ${error}`);
    }

    /// Act human
    await page._client.send("Input.synthesizeScrollGesture", {
        x: 0,
        y: 0,
        xDistance: 0,
        yDistance: - ScrapeTools.rand_num(0,100),
        })

    try{ // Wait 10 seconds or target css selector to load
        await page.waitForSelector('a[class="toggle-favorite ng-scope"]', {timeout: 10000});
    } catch (e) {
        console.log(`No results on page or Recaptcha : ${e}`)
        // ==================== RECAPTCHA CODE BLOCK [START] ====================
        try{ // TODO - get recaptcha css selector 
            await page.waitForSelector('.g-recaptcha', {timeout: 5000});
            await page.solveRecaptchas();  // puppeteer 2captcha plugin
            await Promise.all([
                page.waitForNavigation(),
                // TODO - get recaptcha submit button css selector 
                page.click('.ybtn.ybtn--primary')
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

    // NOTE: $eval is the same as document.querySelector; $$eval is the same as document.querySelectorAll
    // document.querySelectorAll('li[class="column-list__column__item"]').forEach(function(x){ console.log(x.innerText) })
    return page.evaluate(() => {
        var parentElement = Array.from(document.querySelectorAll('a[class="toggle-favorite ng-scope"]'));
        
        // Gather addresses and listing URLs
        var listings = parentElement.map(function (e, i){
            return {
                href: e.href,
                addr: e.title,
            }
        });
        var _payload = [];
        var totalListings = document.querySelector('div[class="total-results"] span[class="ng-binding"]').innerHTML;
        const maxResultsPerPage = 20;
        var totalPages = Math.ceiling(Number(totalListings)/maxResultsPerPage)
        _payload[0] = totalPages;
        _payload[1] = listings;
        return _payload;
    })
}

// database helper functions
async function saveListingUrl(payload){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO hsing_data.loopnet(addr, href) VALUES($1, $2,) \
                            ON CONFLICT DO NOTHING RETURNING l_id';
        await db.query(queryText, [payload.addr, payload.href]);
        await db.query('COMMIT');
        console.log(`************** Saved Listing URL for ${payload.addr} **************`)
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}
