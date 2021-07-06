const Apify = require('apify');
//const { puppeteer } = Apify.utils;
const db = require('../db');
require('dotenv').config();
const ScrapeTools = require('../modules/scrapeTools.js');

/** TODO 
 * 1. load target  ---> update meta table 
 * 2. load listing_type
 * 3. hide proxy credentials in ENV variables, push proxies to scrapeTools
 * 4. integrate search / test 
 * 5. extract price, sqft, etc from facts
 * 6. human interaction (scrolling, click links?), random delay
 * 7. block resource loading 
 * 8. parallelization 
 */

// GLOBAL VARIABLES 
let loopCounter = 1;

const listing_type = 'lease';
var target = {
    state: 'IL', // upper case 
    city: 'Chicago' // case sensitive
}

const proxyUrls = ScrapeTools.proxies.map( e => `http://${process.env.PROXY_USER}:${process.env.PROXY_PASSWORD}@${e}`)

async function runTests(page) {
    // Test for bot
    console.log('Running tests...')
    await page.goto('https://bot.sannysoft.com')
    await page.waitForTimeout(7000)
    await page.screenshot({ path: './screenshots/apify-bot-test.png', fullPage: true })
    console.log(`All done, check the screenshot. ✨`)

    // Check IP 
    await page.goto('https://httpbin.org/ip');
    await page.screenshot({ path: './screenshots/apify-ip-test.png', fullPage: true })
    console.log(`All done with IP screenshot. ✨`)
    return;
}

/**
 * Address Search based on listing_type and target GLOBAL VARIABLES 
 * @param {*} page 
 */
async function loopnetSearch(page){
    await page.goto('https://loopnet.com')
    try{ // Detect and close pop up
        const closePopUp = 'button[class="csgp-modal-close ln-icon-close-hollow"]';
        await page.waitForSelector(closePopUp, {timeout: 5000}); // wait for popup 
        await page.click(closePopUp, {delay: 20});
        console.log(`Popup detected and closed`)
    } catch(e){
        console.log(`No popup detected`)
    }
    
    const searchType = {
        'lease': 'li.search-types--for-lease button', 
        'sale': 'li.search-types--for-sale button', 
        'auction': 'li.search-types--auction button', 
        'business': 'li.search-types--BBS button'
    };

    try{
        await page.waitForSelector(searchType[listing_type], {timeout: 15000});
        await page.click(searchType[listing_type], {delay: 13})
        await page.type('input[name="geography"]', `${target.city}, ${target.state}`, {delay: 20});
        await page.screenshot({ path: `./screenshots/apify-${target.city}-${target.state}-loopnet-search.png`, fullPage: true })
        await page.click('button.do-search', {delay: 17});
        console.log('All done with loopnet search screenshot ')
    } catch (e){
        await page.screenshot({ path: `./screenshots/apify-${target.city}-${target.state}-loopnet-search-err.png`, fullPage: true })
        console.log(`loopnet.com not loaded`)
        throw e;
    }
}


async function saveMapPin(d){
    try{  // href is temporarily set to loopnet_id because it cannot be null               
        const queryText = 'insert into hsing_data.loopnet (loopnet_id, the_geom, href, target_plcidfp, listing_type, date_scraped) \
            values ($1, ST_SetSRID(ST_MakePoint($2::float, $3::float), 4269), $1, (select pcl.place_to_fp($4, $5)), $6, now()) \
            on conflict on constraint unique_loopnet_id do update set (the_geom, date_scraped) = (EXCLUDED.the_geom, EXCLUDED.date_scraped) returning *'; 
        await db.query('BEGIN');
        const queryResult =  await db.query(queryText, [d.id, Number(d.lngLat[0]), Number(d.lngLat[1]), 
                        target.city, target.state, listing_type]);
        await db.query('COMMIT');
        // console.log(`scrapeMapPins saved loopnet_id: ${JSON.stringify(queryResult['rows'][0]['loopnet_id'])}`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`saveMapPin error: ${e}`);
        throw e
    }
}


async function saveJsonLD(d){
    try{
        const loopnet_id = d.loopnet_id;
        delete d.loopnet_id;

        const queryText = 'update hsing_data.loopnet set (raw_preview, date_scraped) = ($1, now()) where loopnet_id=$2 and listing_type=$3 returning *'; 
        await db.query('BEGIN');
        const queryResult =  await db.query(queryText, [d, loopnet_id, listing_type])
        await db.query('COMMIT');
        console.log(`scrapeProfileCards saved loopnet_id: ${JSON.stringify(queryResult['rows'][0]['loopnet_id'])} - ${JSON.stringify(queryResult['rows'][0]['raw_preview']['availableAtOrFrom']['address']['streetAddress'])}`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`scrapeProfileCards error: ${e}`)
        throw e
    }
}


Apify.main(async () => {
    // First we create the request queue instance.
    const requestQueue = await Apify.openRequestQueue();
    // And then we add a request to it.
    await requestQueue.addRequest({ url: `https://www.loopnet.com/search/commercial-real-estate/${target.city.toLowerCase()}-${target.state.toLowerCase()}/for-lease/` });
    
    const proxyConfiguration = await Apify.createProxyConfiguration({ proxyUrls: proxyUrls, });
    const proxyInfo = proxyConfiguration.newProxyInfo();
    
    // ---------- Set up the crawler, passing a single options object as an argument. ---------- 
    // const crawler = new Apify.CheerioCrawler({
    // const crawler = new Apify.PlaywrightCrawler({
    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        // Proxy connection is automatically established in the Crawler
        proxyConfiguration: proxyConfiguration,
        useSessionPool: true,  // Activates Session pool.
        sessionPoolOptions: {  // Overrides default Session pool configuration.
            maxPoolSize: 100  // Number of unique sessions.
        },
        // Set to true if you want the crawler to save cookies per session, 
        // and set the cookies to page before navigaiton automatically.
        persistCookiesPerSession: true, 
        launchContext: {
            useChrome: true, // required for stealth-mode
            stealth: true,  // Puppeteer ONLY 
            // launcher: require("playwright").firefox, 
            launchOptions:{
                headless: true, // required for stealth-mode
            },
        },
        handlePageFunction: async ({request, page, session, proxyInfo, listing_type }) => {
            // await runTests(page);

            console.log(`Using proxy url ${proxyInfo.url} and sessionID ${proxyInfo.sessionId}`); 
            console.log(`Processing ${request.url}`); 

            /** TODO - how to integrate this into the apify work flow since handlePageFunction is called on every url
            if (request.url === 'https://www.loopnet.com'){
                await loopnetSearch(page);
            }
             */

            // CHECK IF RESULTS LOADED 
            const totalPagesCss = 'div[class="total-results"] span[class="ng-binding"]';
            let totalResultsPages; 
            try{
                await page.waitForSelector(totalPagesCss, {timeout: 7000})
                totalResultsPages = await page.$eval(totalPagesCss, el =>{
                    console.log(`totalResultsPages element ${JSON.stringify(el)}`);
                    return el.innerText;
                })
                await page.screenshot({ path: './screenshots/loopnet-apify.png', fullPage: true })
                // await puppeteer.saveSnapshot(page); // saves screen shot to keyvalue store
            } catch(e){ // TODO - check errors for specific types of network errors
                // If a network error happens, such as timeout, socket hangup, etc...
                // There is usually a chance that it was just bad luck and the proxy works.
                // No need to throw it away
                await page.screenshot({ path: './screenshots/loopnet-apify-err.png', fullPage: true })
                console.log(`Error on initial page load: ${e}`);
                session.markBad();
            };

            const blocked = await page.$$eval('section.access-denied-wrapper h1', el => {
                return el.innerText;
            });

            if (blocked === "Temporarily Blocked"){
                console.log('Scraper is blocked');
                session.retire()
            } else if (!totalResultsPages.length){
                //  Page results did not load (no indication of total pages of search result)
                console.log('No results loaded ');
                session.markBad();
            } else { // automatically session.markGood()
                if (loopCounter === 1){  // Run this block of code ONCE per target city/state
                    // Scrape map pins
                    const mapPins = await page.$$eval('div#mapState div', $pins => {
                        const scrapedPins = [];

                        $pins.forEach($p =>{
                            if($p?.id){
                                scrapedPins.push({
                                    id: $p.id, 
                                    lngLat: [$p.getAttribute('lon'), $p.getAttribute('lat')]
                                })
                            }
                        })
                        return scrapedPins;
                    });
                    
                    // Save map pins to db
                    mapPins.forEach(d => { if(d){ saveMapPin(d); } })
                    console.log(`--------------------- SAVED mapPins ---------------------`)   
                }

                // Scrape JsonLD
                let searchResults, searchResultsJsonLD;
                const loopnet_id_regex = /\/(\d{3,})\/$/;
                const jsonld = await ScrapeTools.parseJsonLD(page);
                if (jsonld){
                    searchResultsJsonLD = jsonld.filter( e => e['@type'] === 'SearchResultsPage' );
                    searchResultsJsonLD = searchResultsJsonLD ? searchResultsJsonLD[0]['about'].map(e => e.item) : null;

                    searchResultsJsonLD.forEach(e => {
                        // listing_type=LEASE parse [avg_price, SF from description], [year_built, stars from fact_summary]
                        e.loopnet_id = loopnet_id_regex.exec(e.url)[1] || null;
                    });
                    console.log(`jsonld ${JSON.stringify(searchResultsJsonLD, null,'\t')}`);
                }
                // Save JsonLD to db
                searchResultsJsonLD.forEach( d => { if(d){ saveJsonLD(d); } })
                console.log(`--------------------- SAVED searchResultsJsonLD ---------------------`)  


                const profileCards = await page.$$eval('article', $articles => {
                    const scrapedCards = [];
                    $articles.forEach(($a) =>{
                        scrapedCards.push({
                            id: $a.dataset.id, 
                            addr: `${[...$a.getElementsByClassName('placard-carousel-pseudo')][0].title} ${$a.getAttribute('gtm-listing-zip')}`,
                            imgs: Array.from($a.getElementsByClassName('slide')).map(d => d.children[0].children[0].content), 
                            factSummary: [...$a.getElementsByClassName('data-points-a')][0] ? 
                                [...$a.getElementsByClassName('data-points-a')][0].innerText.split('\n') : 
                                ([...$a.getElementsByClassName('data-points-2c')][0] ? 
                                [...$a.getElementsByClassName('data-points-2c')][0].innerText.split('\n'): null),
                            briefDesc: [...$a.getElementsByClassName('data-points-b')][0] ?
                                [...$a.getElementsByClassName('data-points-b')][0].innerText : null,
                        });
                    })
                    return scrapedCards;
                }, listing_type)     
 

                // Store the results to the default dataset
                // await Apify.pushData(searchResultsJsonLD);

                const nextPage  = await page.$eval('a.caret-right-large', el =>{
                    console.log(`nextPageResults element ${JSON.stringify(el)}`);
                    return el.href;
                })
                
                // Add next page of search results to the queue 
                if (nextPage){
                    console.log(`nextPage found: ${nextPage}`);
                    await requestQueue.addRequest({ url: nextPage });
                }

                loopCounter += 1;
            }
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times `);
        },
    });

    await crawler.run();

    console.log(`Crawler finished.`)
    
});


/**
 * https://docs.apify.com/web-scraping-101/web-scraping-techniques
 * 
 * 
 * for loopnet, yelp PROFILE pages 
 * var jsonLD = $('script[type="application/ld+json"]');
 * return JSON.parse(jsonLD.innerHTML
 */