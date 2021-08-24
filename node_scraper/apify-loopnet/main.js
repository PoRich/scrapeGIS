const Apify = require('apify');
//const { puppeteer } = Apify.utils;
const db = require('../db');
const assert = require('assert');
require('dotenv').config();
const ScrapeTools = require('../modules/scrapeTools.js');
const { createCipher } = require('crypto');

/** TODO 
 * 1. load target  ---> update meta table 
 * 2. load listing_type
 * 7. block resource loading 
 * 4. integrate search from loopnet.com & robot/IP tests->screenshots 
 * 8. parallelization 
 */

// GLOBAL VARIABLES 
let loopCounter = 1;

const listing_type = 'lease';
var target = {
    state: 'PA', // upper case 
    city: 'Philadelphia' // case sensitive
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
            on conflict on constraint loopnet_loopnet_id_key do update set (the_geom, date_scraped) = (EXCLUDED.the_geom, EXCLUDED.date_scraped) returning *'; 
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


async function saveBroker(broker){
    let agent1_id, a1Query;
    let count = 1;
    let client;
    client = await db.getClient();
    await client.query('select reiq.venv();'); // required for python modules used in postgreSQL functions

    try{
        while (!agent1_id){
            await client.query('BEGIN;');
            a1Query = await client.query(
                'select agent.get_a_id_person($1, $2, $3) as a_id', 
                [broker.name.trim(), broker.jobTitle.trim(), 'loopnet']);
            agent1_id = a1Query['rows'][0]['a_id'];
            await client.query('COMMIT;');
            count +=1;
        }
        client.release(); 

        //console.log(`Attempt ${count}: saveJsonLD (Broker) - agent1_id: ${agent1_id}`);     
        return agent1_id;
    } catch(e){
        await client.query('ROLLBACK;');
        client.release(); 
        console.log(`ERROR saveJsonLD (saveBroker: ${broker.name} | db response ${JSON.stringify(a1Query)}) - error saving data: ${e}`)
        throw e
    }
    
}


async function saveBrokerage(broker){
    let agent2_id, a2Query;
    let count = 1;
    let client = await db.getClient();
    await client.query('select reiq.venv();'); // required for python modules used in postgreSQL functions

    try{
        while (!agent2_id){
            await client.query('BEGIN;');
            a2Query = await client.query(
                'select agent.get_a_id_entity($1, $2, $3) as a_id', 
                [broker.worksFor.name.trim(), 'Commercial Real Estate Brokerage', 'loopnet']);
            agent2_id = a2Query['rows'][0]['a_id'];
            await client.query('COMMIT;');
            count += 1;
        }
        client.release();
        
        //console.log(`Attempt: ${count}: saveJsonLD (Broker Organization) - agent2_id: ${agent2_id}`);        
        return agent2_id;
        
    } catch(e){
        await client.query('ROLLBACK;');
        client.release();
        console.log(`ERROR saveJsonLD (Broker Organization: ${broker.worksFor.name} | db result ${JSON.stringify(a2Query)}) - error saving data: ${e}`)
        throw e
    }
    
}


async function saveAgentRelationship(agent1_id, agent2_id){

    let aaQuery, aAgent_id;
    let count = 1;
    try{
        while (!aAgent_id){
            
            aaQuery = await db.query(
            'insert into agent.a_agent(agent1_id, relation, agent2_id, notes, last_update) \
            values ($1, $2, $3, $4, now()) \
            on conflict on constraint a_agent_agent1_id_relation_agent2_id_key \
            do update set last_update= EXCLUDED.last_update returning aa_id', 
            [agent1_id, 'works for', agent2_id, 'per loopnet']);
            aAgent_id = aaQuery['rows'][0]['aa_id'];

            //console.log(`Attempt ${count}: saveAgentRelationship (saveBroker) - aAgent_id: ${aAgent_id}`);        
            count +=1;
        }
        
        return aAgent_id;
    } catch(e){
        
        console.log(`ERROR saveJsonLD (Broker - Org Relation: agent1_id(${agent1_id}) <-> agent2_id(${agent2_id}) | 
                    db response ${JSON.stringify(aaQuery)}) - error saving data: ${e}`)
        throw e
    }
}


async function saveJsonLD(d){
    // keys: description, image, _avg_price, _prices, offeredBy, priceCurrency, 
    // availableAtOrFrom, @type, price, url, name, category
    
    const loopnet_id = d._loopnet_id;
    delete d._loopnet_id;

    try{    
        const href = d.url || null; 
        delete d.url;

        if(d['@type']){
            assert(d['@type']==='Offer')
            delete d['@type'];
        }
        if(d['availableAtOrFrom']){
            if (d.streetAddress = d.availableAtOrFrom.address['@type'] === "PostalAddress"){
                d.streetAddress = d.availableAtOrFrom.address.streetAddress;
                delete d.availableAtOrFrom;
            }
        }

        if(d.priceCurrency==='USD'){
            delete d.priceCurrency
        }

        let price = null;
        if(d._avg_price){
            price = d._avg_price;
            // delete d._avg_price
        } else if (d.price){
            price = Number(d.price);
            // delete d.price;
        }

        const imgs = [d.image] || null;
        if(d.image){
            delete d.image
        }

        let category = null;
        if(d.category){
            category = d.category;
            delete d.category
        }

        let description = null;
        if(d.description){
            description = d.description;
            delete d.description
        }

        // Serialize broker, brokerage, add a_agent_ids
        if(d.offeredBy){ 
            // d.offeredBy is either an array of objects (more than 1 broker)-> use Array.from 
            // or it is a single object (1 broker) -> enclose it in square brackets;
            let brokerArray = Array.from(d.offeredBy).length > 0 ? Array.from(d.offeredBy) : [d.offeredBy]; // Array.from will return null if only one object 
            brokerArray.forEach(async (broker, idx) => {
                if (broker['@type'] ==='Person'){
                    let agent1_id, agent2_id
                    // Save broker data
                    agent1_id = await saveBroker(broker);
                    
                    // Save brokerage data
                    if (broker.worksFor){
                        if(broker.worksFor['@type'] === 'Organization'){
                            agent2_id = await saveBrokerage(broker);
                        } else{
                            console.log(`NOTICE: broker doesn't work for organization [NOT SAVED]: ${broker.worksFor['@type']}`)
                        }
                    }

                    // Save relationship
                    if (agent1_id && agent2_id){
                        let aAgent_id = null;
                        let count = 1;

                        while (!aAgent_id){ // Save broker-brokerage relationship to agent.a_agent table 
                            aAgent_id = await saveAgentRelationship(agent1_id, agent2_id);
                            count +=1;
                            // console.log(`Called saveAgentRelationship ${count} times - aAgent_id = ${aAgent_id}`)
                        }

                        if(aAgent_id){
                            let updatedField, queryResult, queryResult2;
                            let listingBrokerUpdateCount = 1;
                            while (!updatedField){
                                // await db.query('BEGIN');
                                /* verison 1 - single listing_broker 
                                queryResult =  await db.query('update hsing_data.loopnet set listing_broker=$1 \
                                                             where loopnet_id=$2 and listing_type=$3 and listing_broker is null \
                                                             returning listing_broker', [aAgent_id, loopnet_id, listing_type]);
                                */

                                if(idx === 0){
                                    // IF there is already no listing_broker, add the data to both fields
                                    queryResult2 = await db.query('update hsing_data.loopnet set (listing_broker, listing_brokers) = ($1, Array[$2::INT])  \
                                    where loopnet_id=$3 and listing_type=$4 and listing_broker is null \
                                    returning listing_broker, listing_brokers', [Number(aAgent_id), Number(aAgent_id), loopnet_id, listing_type]);
                                } else{
                                    // IF there is already one listing_broker, just append the array field with any unique value
                                    queryResult = await db.query('update hsing_data.loopnet set listing_brokers = array_append(listing_brokers, $1::INT) \
                                    where loopnet_id=$2 and listing_type=$3 and listing_broker is not null and listing_brokers && Array[$1::INT] = false \
                                    returning listing_broker, listing_brokers', [Number(aAgent_id), loopnet_id, listing_type]);
                                }

                                if(queryResult?.row){
                                    updatedField = queryResult['row'][0]['listing_broker'];
                                }
                                // await db.query('COMMIT');
                                listingBrokerUpdateCount +=1;
                            }
                            // console.log(`300 - Attempt: ${listingBrokerUpdateCount} Updated loopnet_id: ${loopnet_id} to listing_broker: ${updatedField}`)
                        }
                    } else { 
                        console.log(`NOTICE: NO BROKER RELATIONSHIP SAVED (one agent_id is missing) agent1_id: ${agent1_id} | agent2_id: ${agent2_id}`)
                    }
                } else {
                    console.log(`NOTICE: broker is not a person [NOT SAVED]: ${broker['@type']}`)
                }
            });
            
        }

        
        await db.query('BEGIN');
        // Note: loopnet_id, listing_type already exists from first scraping mapPins 
        const queryText = 'update hsing_data.loopnet set (raw_jsonld, href, price, category, imgs, listing_desc, date_scraped) = \
                            ($1, $2, $3, $4, $5, $6, now()) where loopnet_id=$7 and listing_type=$8 returning *'; 
        const queryResult =  await db.query(queryText, [d, href, price, category, imgs, description, loopnet_id, listing_type])
        await db.query('COMMIT');
        console.log(`saveJsonLD db result: ${JSON.stringify(queryResult['rows'][0], null, '\t')}`);
        console.log(`saveJsonLD saved loopnet_id: ${JSON.stringify(queryResult['rows'][0]['loopnet_id'])} - ${JSON.stringify(queryResult['rows'][0]['raw_jsonld']['streetAddress'])}`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`ERROR (saveJsonLD error saving loopnet_id ${loopnet_id}): ${e}`)
        throw e
    }
}


async function saveArticles(d){
    try{
        const loopnet_id = d._loopnet_id;
        delete d._loopnet_id;

        let sqft = null;
        if (d._sqft){ // do not delete d._sqft b/c it is an array
            // get the max sqft
            let l = d._sqft.length - 1;
            sqft = d._sqft[l];
        }
        
        let capRate = null;
        if (d._capRate){
            capRate = Number(d._capRate);
            delete d._capRate
        }
        
        let addr = d.addr;
        delete d.addr;

        let imgs = d.images;
        delete d.images;

        let briefDesc = d.briefDesc
        delete d.briefDesc;

        let acreLot = null;
        if(d._acreLot){
            acreLot = d._acreLot;
            delete d._acreLot;
        }
        

        const queryText = 'update hsing_data.loopnet set (addr, imgs, blding_sqft, lot_acre, exec_sum, raw_article, cap_rate, date_scraped) = \
                        ($1, $2, $3, $4, $5, $6, $7, now()) where loopnet_id=$8 and listing_type=$9 returning *'; 
        await db.query('BEGIN');
        const queryResult =  await db.query(queryText, [addr, imgs, sqft, acreLot, briefDesc, d, capRate, loopnet_id, listing_type])
        await db.query('COMMIT');
        console.log(`saveArticles - saved loopnet_id: ${JSON.stringify(queryResult['rows'][0]['loopnet_id'])} - ${JSON.stringify(queryResult['rows'][0]['addr'])}`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`ERROR (saveArticles loopnet_id: ${loopnet_id}) error: ${e}`)
        throw e
    }
}


Apify.main(async () => {
    // First we create the request queue instance.
    const requestQueue = await Apify.openRequestQueue();
    // And then we add a request to it.
    await requestQueue.addRequest({ url: `https://www.loopnet.com/search/commercial-real-estate/${target.city.toLowerCase()}-${target.state.toLowerCase()}/for-${listing_type}/` });
    
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
        handlePageFunction: async ({request, page, session, proxyInfo, listing_type}) => {
            // Block Resources 
            page = await ScrapeTools.blockResources(page, ['stylesheet, image, media, font, script, other']);

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
                }

                // Scrape, extract & process data from JsonLD
                let searchResults, searchResultsJsonLD;
                const jsonld = await ScrapeTools.parseJsonLD(page);
                const loopnet_id_regex = /\/(\d{3,})\/$/;
                const rentRegex = /\$(\d{1,}\.\d{2,2})[\s\-\$]*(\d{1,}\.\d{2,2})?\s\SF\/Yr/; // $35.00 - $37.00 SF/Yr
                // const sqftRegex = /((\d{0,3},)?\d{1,3})\sSF(?!\/Yr)/;
                if (jsonld){
                    searchResultsJsonLD = jsonld.filter( e => e['@type'] === 'SearchResultsPage' );
                    searchResultsJsonLD = searchResultsJsonLD ? searchResultsJsonLD[0]['about'].map(e => e.item) : null;
                    
                    searchResultsJsonLD.forEach(e => {
                        // Extract loopnet_id 
                        e._loopnet_id = loopnet_id_regex.exec(e.url)[1] || null;
                        let rentMatch = null;
                        // Extract and calculate average rental rate
                        if (e.price){
                            rentMatch = rentRegex.exec(e.price) || rentRegex.exec(e.description);
                            if (e.price.includes('-')){
                                e._prices = [Number(rentMatch[1]), Number(rentMatch[2])];
                            } else {
                                e._prices = [Number(rentMatch[1])];
                            }
                            e._avg_price = ScrapeTools.sum(e._prices) / e._prices.length;
                        } 
                        
                    });
                    // console.log(`jsonld ${JSON.stringify(searchResultsJsonLD, null,'\t')}`);
                }
                // Save JsonLD to db
                searchResultsJsonLD.forEach( async (d) => { if(d){ saveJsonLD(d); } })
                

                // Scrape profile cards 
                const articles = await page.$$eval('article', ($articles) => {
                    const scrapedCards = [];
                    $articles.forEach(($a) =>{
                        let scrape = {
                            _loopnet_id: $a.dataset.id, 
                            addr: `${[...$a.getElementsByClassName('placard-carousel-pseudo')][0].title} ${$a.getAttribute('gtm-listing-zip')}`,
                            images: Array.from($a.getElementsByClassName('slide')).map(d => d.children[0].children[0].content), 
                            factSummary: [...$a.getElementsByClassName('data-points-a')][0] ? 
                                [...$a.getElementsByClassName('data-points-a')][0].innerText.split('\n') : 
                                ([...$a.getElementsByClassName('data-points-2c')][0] ? 
                                [...$a.getElementsByClassName('data-points-2c')][0].innerText.split('\n'): null),
                            briefDesc: [...$a.getElementsByClassName('data-points-b')][0] ?
                                [...$a.getElementsByClassName('data-points-b')][0].innerText : null
                        }

                        let banner = [...$a.getElementsByClassName('right-h4')][0] ? 
                                    [...$a.getElementsByClassName('right-h4')][0].innerText : null;
                        if (banner){
                            scrape.banner = banner;
                        }

                        let oz = $a.getElementsByClassName('tag tag-opportunity-zone')[0] ? true : false;
                        if(oz){
                            scrape.opportunity_zone = oz;
                        }                

                        scrapedCards.push(scrape);
                    })
                    return scrapedCards;
                })     

                // Extract yearBuilt, starRating;
                const yrRegex = /Built\sin\s(\d{4,4})/;
                const starRegex = /(\d{1,1})\sStar/;
                const sqftRegexArticle = /(\d{0,3},?\d{1,3})?(\s-\s)?(\d{0,3},?\d{1,3})\sSF(?!\/YR)/;
                const capRateRegex = /(\d{1,3}\.?\d{0,2})\%\sCap\sRate/;
                const acreLotRegex = /((\d{1,3}\,)?\d{0,3}\.?\d{0,2})\sAC\sLot/;
                // TODO - for-sale scrape _cap_rate, _AC 
                articles.forEach(e =>{
                    // listing_type=LEASE [year_built, stars from fact_summary]
                    // Extract year_built 
                    if(e.factSummary){
                        let yrMatch = null;
                        let starMatch = null;
                        let sqftMatch = null;
                        let capRateMatch = null;
                        let acreLotMatch = null;
                        
                        e.factSummary.forEach(d => {
                            yrMatch = yrRegex.exec(d);
                            starMatch = starRegex.exec(d);
                            sqftMatch = sqftRegexArticle.exec(d);                            
                            capRateMatch = capRateRegex.exec(d);
                            acreLotMatch = acreLotRegex.exec(d);
                            
                            if(capRateMatch){
                                e._capRate = Number(capRateMatch[1]);
                            }

                            if(acreLotMatch){
                                e._acreLot = Number(acreLotMatch[1]);
                            }

                            if(yrMatch){
                                e._yrBuilt = Number(yrMatch[1]);
                            } 
                            if(starMatch){
                                e._star = Number(starMatch[1]);
                            }
                            if(sqftMatch){
                                if(d.includes('-')){
                                    e._sqft = [Number(sqftMatch[1].replace(',','')), Number(sqftMatch[3].replace(',',''))];
                                }
                                else {
                                    e._sqft = [Number(sqftMatch[0].replace(',','').replace(' SF','') )];
                                }
                            }
         
                        })
                    }
                })
                // Save ProfileCards to db
                // console.log(`articles ${JSON.stringify(articles, null,'\t')}`);
                articles.forEach( d => { if(d){ saveArticles(d); } })
                

                // Store the results to the default dataset
                // await Apify.pushData(searchResultsJsonLD);
                
                // Wait to make this feel human
                await page.waitForTimeout(ScrapeTools.rand_num(1000, 5000))
                await page._client.send("Input.synthesizeScrollGesture", {
                    x: 0,
                    y: 0,
                    xDistance: 0,
                    yDistance: - ScrapeTools.rand_num(0, 1000),
                    });

                let nextPage 
                try{
                    nextPage = await page.$eval('a.caret-right-large', el =>{
                        console.log(`nextPageResults element ${JSON.stringify(el)}`);
                        return el.href;
                    })
                }catch(e){
                    console.log('No next Page found')
                }
                
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
https://docs.apify.com/web-scraping-101/web-scraping-techniques

delete from hsing_data.loopnet where target_plcidfp='4260000';
select * from hsing_data.loopnet where target_plcidfp='4260000' and raw_jsonld is not null;

 */