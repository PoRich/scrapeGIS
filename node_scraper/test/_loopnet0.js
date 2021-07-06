/** NOTE: RUN THIS FILE FROM THE APP DIR AS 'node app/loopnet.js'
 * Script works for sales but not lease 
*/
const puppeteer = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')  // Add adblocker plugin to block all ads and trackers (saves bandwidth)
require('dotenv').config();
const db = require('../db');
var format = require('pg-format');
const ScrapeTools = require('../modules/scrapeTools.js');
//puppeteer.use(require('puppeteer-extra-plugin-repl')())
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(
    RecaptchaPlugin({
        provider:{
            id: '2captcha', 
            token: process.env.TWOCAPTCHA,  
        },
        visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    })
)

require('dotenv').config();


/**
 * keep track of last update in tools.meta db table
 * keep track of pages scraped in tools.scrape_meta db table
 */

// TODO - update recaptcha css selectors for LoopNet (if any)
const recaptchaCss = '.g-recaptcha'; 
const recaptchaSubmitCss = '.ybtn.ybtn--primary';

// blocked
const blockedCss = 'section[class="wrap listing-not-found en  ng-scope"]'

// define URL structure 
var target = {
    state: 'PA', // upper case 
    city: 'Philadelphia' // case sensitive
}


async function getSiteMap(targetLocation, listing_type){

    var totalPages = 1
    var currentPage = 1;

    // Start browser, open new page, prep use-agent 
    let browser = await puppeteer.launch({headless: false});
    let page = await browser.newPage();
    ScrapeTools.preparePageForTests(page);
    // initial check 
    console.log('Check the bot tests...')
    await page.goto('https://bot.sannysoft.com');
    await page.waitForTimeout(5000);
    await page.screenshot({path:'./screenshots/bot-test-result0.png', fullPage: true})
    
    console.log('All done, check the bot result screenshot')

    // =================== PART 1: Inital Crawl for site map ===================
    // RUN THIS ONCE; aftwards, load from database
    while (currentPage <= totalPages){
        var pageURL = `https://www.loopnet.com/search/commercial-real-estate/${targetLocation.city}-${targetLocation.state}/for-${listing_type}/${currentPage}/`;
        // https://www.loopnet.com/search/commercial-real-estate/philadelphia-pa/for-lease/?sk=3b10dffa8f267f3352a881e6c2ba1582&e=u
        // https://www.loopnet.com/search/commercial-real-estate/philadelphia-pa/for-sale/?sk=5f393f8da8657aa220c953cd85717cf7
        var scrapeResult = await crawlSitemap(pageURL, page);
        // console.log(`scrapeResult ${JSON.stringify(scrapeResult)}`)
        totalPages = scrapeResult[0];
        const linkObj = scrapeResult[1];
        if (totalPages === -1) {
            // means no search results or failed to solve recaptcha 
            break;
        }
        linkObj.forEach(e => saveListingUrl(e, targetLocation, listing_type));
        ScrapeTools.updateMetaStatus(currentPage, totalPages, targetLocation, 'loopnet'+'_'+listing_type)    
        console.log(`******************** scraped ${listing_type} ${targetLocation.city} page ${currentPage} ********************`)
        // Increment page
        currentPage = currentPage + 1;
    }
    await browser.close();

    return {target: targetLocation, type: listing_type};
    // TODO get next target city, state
    
}

async function getListings(instructions, dateCutOff){
    
    const targetLocation = instructions.target;
    const listing_type = instructions.type;
    
     // Start browser, open new page, prep use-agent 
    let browser = await puppeteer.launch({headless: false});
    let page = await browser.newPage();
    ScrapeTools.preparePageForTests(page);
    
    // =================== PART 2: Scrape profiles ===================
    const listings = await getListingUrls(targetLocation, listing_type, dateCutOff);
    //const listings = ['https://www.loopnet.com/Listing/225-239-N-13th-St-Philadelphia-PA/22188169/'];
    
    while (listings.length > 0){
        let listing = listings.pop();
        console.log(`************ scraping listing ${listing} ************`)
        
        const elementPayload = await scrapeElement(listing, page, listing_type);
        
        // combine convert facts arrays [new DOM structure] into single object
        if (elementPayload.factsRaw?.labels1){
            let facts1 = ScrapeTools.zipObject(elementPayload.factsRaw.labels1, elementPayload.factsRaw.data1);
            let facts2 = ScrapeTools.zipObject(elementPayload.factsRaw.labels2, elementPayload.factsRaw.data2);
            let facts3 = ScrapeTools.zipObject(elementPayload.factsRaw.labels3, elementPayload.factsRaw.data3);
            elementPayload.facts = {...facts1, ...facts2, ...facts3};
            delete elementPayload.factsRaw;
        }
        
        const dollarRegex = /\$?([\d,?]+)/;
        var dollarFloatRegex = /\$(\d{0,3},?\d{0,3},?\d{0,3},?\d{0,3},?\d{0,3},?\d{0,3}\.?\d{0,2})$/;
        const floatRegex = /(\d+\.?\d*)/;
        const numberRegex = /\d|-/;
        // cobmine convert facts arrays [old DOM structure] into object, merge into single object
        if (elementPayload.factsArray){
            let facts2 = ScrapeTools.toObject(elementPayload.factsArray, 2);
            elementPayload.facts = {
                ...elementPayload.facts,
                ...facts2,
            };
            delete elementPayload.factsArray;

            // Extract integer data from prices, assessment (e.g., (2021)) 
            let intTargetKeys =  null;
            if (listing_type === 'sale'){
                intTargetKeys = ['Price', 'Price Per Unit', 'Price Per AC', 'Land Assessment', 'Improvements Assessment', 
                    'Total Assessment', 'Annual Taxes','Total Building Size', 'Building Size', 'Unit Size', 
                    'Typical Floor Size', 'Rentable Building Area', 'NOI'];
            } else if (listing_type === 'lease'){
                intTargetKeys = ['Building Size', 'Typical Floor Size', 'Gross Leasable Area'];
            }

            intTargetKeys.map(k =>{ 
                let _ = null;
                if(elementPayload.facts[k]){ 
                    let matchGroup = dollarRegex.exec(elementPayload.facts[k]);
                    if(matchGroup.length){
                        _ = matchGroup[1];
                        elementPayload.facts[k] = Number(_.replace(/,/g, ''))
                    };
                };    
            })

            // Extract decimal data from cap rate, lot size
            let decTargetKeys = ['Price Per SF','Cap Rate', 'Percent Leased', 'Total Lot Size', 'Lot Size', 'Land Acres', 'Total Land Area']
            decTargetKeys.map(k =>{
                let _ = null;
                if(elementPayload.facts[k]){ 
                    let matchGroup = floatRegex.exec(elementPayload.facts[k]);
                    if(matchGroup?.length>=1){
                        _ = matchGroup[1];
                        elementPayload.facts[k] = Number(_.replace(/,/g, ''))
                    };
                };    
            })

            // Combine related fields -> _lotSize
            let _lotSize = null;
            if (elementPayload.facts['Lot Size']){
                _lotSize = elementPayload.facts['Lot Size'];
            } else if (elementPayload.facts['Total Lot Size']){ 
                _lotSize = elementPayload.facts['Total Lot Size'];
            } else if (elementPayload.facts['Land Acres']){
                _lotSize = elementPayload.facts['Land Acres'];
            } else if (elementPayload.facts['Total Land Area']){
                _lotSize = elementPayload.facts['Total Land Area'];
            } 
            if (_lotSize){
                elementPayload.facts['_lotSize'] = _lotSize
            }
            
            // Combine related fields -> _bldingSize
            let _bldingSize = null;
            if (elementPayload.facts['Building Size']){
                _bldingSize = elementPayload.facts['Building Size'];
            } else if (elementPayload.facts['Total Building Size']){ 
                _bldingSize = elementPayload.facts['Total Building Size'];
            } else if (elementPayload.facts['Rentable Building Area']){
                _bldingSize = elementPayload.facts['Rentable Building Area'];
            } else if (elementPayload.facts['Unit Size']){
                _bldingSize = elementPayload.facts['Unit Size'];
            } 
            if (_bldingSize){
                elementPayload.facts['_bldingSize'] = _bldingSize;
            }

            // Process Rental Rate
            const rentRegex = /^\$(\d{1,}\.\d{2,2})[\s\-\$]*(\d{1,}\.\d{2,2})?\s\/SF\/YR$/;
            let _rentalRate = null;
            if (elementPayload.facts['Rental Rate'] && listing_type === 'lease'){
                var rents = rentRegex.exec(elementPayload.facts['Rental Rate']);
                if(rents){
                    if (rents[1] && rents[2]){
                        _rentalRate = (Number(rents[1])+Number(rents[2]))/2;
                    } else if (rents[1]){
                        _rentalRate = Number(rents[1]);
                    }
                }
            } else if (elementPayload.financials['lease_data'].length >= 2 && listing_type === 'lease'){
                let _rentRateArray = [];
                var rentMatch = null;
                for (i=1; i < elementPayload.financials['lease_data'].length; i++){
                    rentMatch = rentRegex.exec(elementPayload.financials['lease_data'][i][3]);
                    if (rentMatch){
                        if(rentMatch[1] && rentMatch[2]){
                            _rentRateArray.push( (Number(rentMatch[1]) + Number(rentMatch[2]))/2 ); // if range, calculate mid-point 
                        } else if (rentMatch[1]){
                            _rentRateArray.push( Number(rentMatch[1]) );
                        }
                    }
                }
                if (_rentRateArray.length > 1){
                    elementPayload.facts['_rentRateArray'] = _rentRateArray; // save for reference, array of all asking rentalRates (if multiple units available)
                    // calculate the average across all units 
                    _rentalRate = ScrapeTools.sum(_rentRateArray)/_rentRateArray.length;
                } else if (_rentRateArray.length == 1){
                    _rentalRate = _rentRateArray[0];
                }
            }
            if (_rentalRate){
                elementPayload.facts['_rentalRate'] = _rentalRate;
            }

        }
        
        // Process financial data 
        if (elementPayload.financialsArray && listing_type === 'sale'){
            // remove dollar signs and commas
            elementPayload.financialsArray = elementPayload.financialsArray.map((d, idx) => {
                let _ = null;
                let matchGroup = dollarFloatRegex.exec(d);
                // number
                if (matchGroup?.length >= 1){
                    _ = matchGroup[1];
                    elementPayload.financialsArray[idx] = _ ? Number(_.replace(/,/g, '')) : null;
                }
                return elementPayload.financialsArray[idx];
            })
            // determine how many columns, convert from arrays to objects
            if (elementPayload.financialsArray.length >=3){
                let matchGroup = numberRegex.exec(elementPayload.financialsArray[2]);
                if(matchGroup?.length){ // if three columns in financial table
                    elementPayload.financials = ScrapeTools.toObject(elementPayload.financialsArray, 3);
                } else {
                    elementPayload.financials = ScrapeTools.toObject(elementPayload.financialsArray, 2);
                }
            } else {
                elementPayload.financials = ScrapeTools.toObject(elementPayload.financialsArray, 2);
            }
            delete elementPayload.financialsArray;
        }
                
        elementPayload.href = listing;

        console.log(`170 final elementPayload ${JSON.stringify(elementPayload, null, "\t")}`);
        saveListing(elementPayload);
        if (listings.length===0){
            break
        }
    }
    await browser.close();
    return;
}

// =================== helper functions ===================

// Given, page of search results, returns Array[Number totalPages, {addr: String Address, href: String ListingLink}]
async function getLoopnetLinks(page, waitForCss, totalPagesCss, maxResultsPerPage){
    await page.screenshot({path:'./screenshots/getLoopnetLinks0.png', fullPage: true})
    return page.evaluate((_waitForCss, _totalPagesCss, _maxResultsPerPage) => {
        var parentElement = Array.from(document.querySelectorAll(_waitForCss));
        
        // Gather addresses and listing URLs
        var listings = parentElement.map(function (e, i){
            return {
                href: e.href,
                addr: e.title,
            }
        });
        var totalListings = document.querySelector(_totalPagesCss).innerHTML;
        var totalPages = Math.ceil(Number(totalListings)/_maxResultsPerPage)

        // API convention is to have first element be the total page numbers
        // & second element be the actual payload
        return [totalPages, listings];
    }, waitForCss, totalPagesCss, maxResultsPerPage)
}

// Given a starting URL of city and search type (for sale vs for lease), returns list of listing URLs
async function crawlSitemap(pageURL, page){
    const _waitForCss = 'a[class="toggle-favorite ng-scope"]';
    const totalPagesCss = 'div[class="total-results"] span[class="ng-binding"]';
    await ScrapeTools.prepPage(pageURL, page, crawlSitemap, _waitForCss, recaptchaCss, recaptchaSubmitCss);
    return getLoopnetLinks(page, _waitForCss, totalPagesCss, 20);
}

// Save listing address and URL to databsae
async function saveListingUrl(payload, target, listing_type){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO hsing_data.loopnet (addr, href, listing_type, target_plcidfp) \
                         VALUES($1, $2, $3, (select pcl.place_to_fp($4, $5))) ON CONFLICT DO NOTHING RETURNING l_id';
        await db.query(queryText, [payload.addr, payload.href, listing_type, target.city, target.state ]);
        await db.query('COMMIT');
        console.log(`************** Saved ${listing_type} Listing URL for ${payload.addr} **************`)
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

// Retrieve listingURLs from database where meta is null or where date_scraped is earlier than the dateCutOff
async function getListingUrls(_target, _listing_type, dateCutOff){
    if (dateCutOff=== undefined) { 
        // default to today (dateformat is postgres convention YYYY/MM/DD)
        dateCutOff = `${new Date().getFullYear()}/${new Date().getMonth()+1}/${new Date().getDate()}`;
    }
    try{
        const listingUrls = await db.query('select array_agg(href) listings from hsing_data.loopnet \
        where target_plcidfp=(select pcl.place_to_fp($1, $2)) \
        and (meta is null or date_scraped < $3::date) and listing_type=$4', 
            [_target.city, _target.state, dateCutOff, _listing_type]);
        // console.log(`listingUrls - ${JSON.stringify(listingUrls)}`);
        return listingUrls['rows'][0]['listings'];
    } catch(e){
        console.log(`error getListingUrls - ${e}`)
    }
}

// Scrape element (profile page of listing)
async function scrapeElement(elementURL, page, listing_type){
    const _waitForCss = 'ul[class="property-timestamp"]'; // img container
    const _badUrlCss = 'div[class="off-market-banner"]';

    const initLoad = await ScrapeTools.prepPage(elementURL, page, crawlSitemap, _waitForCss, 
        recaptchaCss, recaptchaSubmitCss, _badUrlCss, blockedCss, listing_type);
    
    if (initLoad === -1){
        // initLoad is either -1 (did not find _waitForCss nor recaptcha)
        return {off_market: true, 
            meta: {
                listingID: 'N/A', 
                dateCreated: 'N/A', 
                dateUpdated: 'N/A'},
            };
    } else if (initLoad){
        // or payload object (if recaptcha was found & solved, prepPage will recursively call crawlSitemap and return payload)
        return initLoad 
    } // if nothing was returned, proceed with the below
    
    return page.evaluate((_listing_type) => {
        let inContract = document.querySelector('span.title-pill')?.innerHTML === "Under Contract";

        // Geocode 
        const lon_regex = /[\?&]lon=(-?\d{1,3}\.\d{3,})[\?&]/;
        const lat_regex = /[\?&]lat=(-?\d{1,3}\.\d{3,})[\?&]/;
        // const mapSrc = document.querySelector('iframe.interactive-map')
        // const mapSrc = document.querySelector('iframe[class="interactive-map"]')
        const srcArray = Array.from(document.querySelectorAll('iframe')).map(e => e.getAttribute("src")).filter( e => {if(e){return e}});
        const lazySrcArray = Array.from(document.querySelectorAll('iframe')).map(e => e.getAttribute("lazy-src")).filter( e => {if(e){return e}});
        let lngLat = null;
        if (srcArray.length > 0){
            const src = srcArray[0];    
            if (lon_regex.exec(srcArray) && lat_regex.exec(srcArray)){
                lngLat = [ lon_regex.exec(srcArray)[1], lat_regex.exec(srcArray)[1] ];    
            } 
            else if (lon_regex.exec(src) && lat_regex.exec(src)){
                // TODO - loop thru each element in the array individually rather than just the first?
                lngLat = [ lon_regex.exec(src)[1], lat_regex.exec(src)[1] ];    
            }
        } else if (lazySrcArray.length>0 && (!lngLat)){
            const lazySrc = lazySrcArray[0];
            if (lon_regex.exec(lazySrcArray) && lat_regex.exec(lazySrcArray)){
                lngLat = [ lon_regex.exec(lazySrcArray)[1], lat_regex.exec(lazySrcArray)[1] ];    
            }
            else if (lon_regex.exec(lazySrc) && lat_regex.exec(lazySrc)){
                // TODO - loop thru each element in the array individually rather than just the first?
                lngLat = [ lon_regex.exec(lazySrc)[1], lat_regex.exec(lazySrc)[1] ];
            }
        }

        // List of image sources ( first and last element always null )
        let imgs = Array.from(document.querySelectorAll('div.mosaic-carousel div.mosaic-tile'))
                         .map(e=> e.getAttribute('data-src'))
                         .filter(i=>{if(i){return i}}); //filter out null elements
        
        if(imgs.length === 0){ // lease listings have different image DOM structure
        const validImgRegex = /^https:\/\/(?!maps)/;
        imgs = Array.from(document.querySelectorAll('div.mosaic-carousel div.mosaic-tile img'))
                    .map(e => e.getAttribute('src'))
                    .filter(i=>{if(validImgRegex.exec(i)){return i}}) //filter out maptiles
        }

        let execSumSelector = _listing_type === 'sale' ? 'div.sales-notes-text' : 'p.pre-wrap';
        let execSum = document.querySelector(execSumSelector)?.innerText.replace(/\n/g, '').trim();

        // Odd ordered elements are keys, even ordered elements are values 
        // Assuming old DOM structure 
        let factsArray = Array.from(document.querySelectorAll('table.featured-grid > tbody > tr > td'))
                              .map(e => e.innerText)
                              .filter(i=>{if(i){return i}}); //filter out null elements;
        
        // Assuming new DOM structure - column 1 
        let labels1 = Array.from(document.querySelectorAll('div.property-facts__column.property-facts__column--one div.property-facts__labels-two-col > div.property-facts__labels-item')).map(d => d.innerText);
        let data1 = Array.from(document.querySelectorAll('div.property-facts__column.property-facts__column--one div.property-facts__data-wrap div.property-facts__data-two-col div.property-facts__data-item > span.property-facts__data-item-text')).map(d => d.innerText);
        
        // Assuming new DOM structure - column 2
        let labels2 = Array.from(document.querySelectorAll('div.property-facts__column.property-facts__column--two div.property-facts__labels-two-col > div.property-facts__labels-item')).map(d => d.innerText);
        let data2 = Array.from(document.querySelectorAll('div.property-facts__column.property-facts__column--two div.property-facts__data-wrap div.property-facts__data-two-col div.property-facts__data-item > span.property-facts__data-item-text')).map(d => d.innerText);
        
        // Assuming new DOM structure - column 3
        let labels3 = Array.from(document.querySelectorAll('div.property-facts__column.property-facts__column--parking div.property-facts__labels-wrap--last > div.property-facts__labels-item')).map(d => d.innerText);
        let data3 = Array.from(document.querySelectorAll('div.property-facts__column.property-facts__column--parking div.property-facts__data-wrap > div.property-facts__data-item')).map(d => d.innerText);
        
        let factsRaw = { 
            labels1: labels1, 
            data1: data1,
            labels2: labels2, 
            data2: data2,
            labels3: labels3, 
            data3: data3,
        }
        
        let financialsArray = null;
        let leaseData = null;
        let tenantData = null;
        if (_listing_type === 'sale'){
            // set of two or three (label, annual, annual per sqft)
            // length of 21 expected
            financialsArray = Array.from(document.querySelectorAll('table[class="property-data summary financial"] > tbody > tr > td')).map(e=>e.innerText);
            // [ "Net Operating Income", "$12,892", "$1.85" ]
            let noiArray = Array.from(document.querySelectorAll('table[class="property-data summary financial"] > tfoot > tr > td')).map(e=>e.innerText);
            financialsArray.push(...noiArray); // append noi 
        } else { 
            // lease info  
            let leaseHeader = Array.from(document.querySelectorAll('div#available-spaces div.available-spaces__header li')).filter(d => d.innerText ? true : false).map(d => d.innerText);
            let leaseData1 = Array.from(document.querySelectorAll('div#available-spaces div.available-spaces__content ')).map(d => d.innerText.split('\n').filter(d=> {return d.trim() !== 'Brochure'})) // this is picking up tenants 
            let leaseData2 = Array.from(document.querySelectorAll('ul.available-spaces__accordion-data')).map(d => d.innerText.split('\n'));
            leaseData = leaseData1 ? leaseData1 : (leaseData2 ? leaseData2 : null); 
            if (leaseData) {leaseData.splice(0, 0, leaseHeader);}

            // tenant info 
            let tenantHeader = Array.from(document.querySelectorAll('div#select-tenant div.available-spaces__header li')).filter(d => d.innerText ? true : false).map(d => d.innerText);
            tenantData = Array.from(document.querySelectorAll('div#select-tenant div.available-spaces__content ')).map(d => d.innerText.split('\n'));
            if (tenantData.length >0) {tenantData.splice(0, 0, tenantHeader);}
        }

        // [ "Listing ID: 22680073", "Date Created: 4/8/2021", "Last Updated: 6/3/2021" ]
        // REGEX Patterns 
        const id_regex = /\d+/
        const date_regex = /\d{1,2}\/\d{1,2}\/\d{4,4}/
        let metaArray = Array.from(document.querySelectorAll('ul[class="property-timestamp"] > li')).map(e=>e.innerText)
        let meta = {
            listingID: id_regex.exec(metaArray[0])[0] || null, 
            dateCreated: date_regex.exec(metaArray[1])[0] || null, 
            dateUpdated: date_regex.exec(metaArray[2])[0] || null, 
        }

        const brokers = Array.from(document.querySelectorAll('div.container-contact-form > ul > li'))
                             .map( e => e.innerText.replaceAll('\n', ' ').trim()) // replace \n
                             .filter(i=>{if(i){return i}}); //filter out null elements;
        
        let brokerPhone = []
        const brokerBioPhone = document.querySelectorAll('span.broker-bio__info__phone');
        if(brokerBioPhone?.length > 0){
            // Phone numbers repeat, take ever other element
            Array.from(brokerBioPhone).forEach((d,idx)=>{if(idx%2===0){brokerPhone.push(d.textContent.trim())}});
        }
        else{
            brokerPhone = Array.from(document.querySelectorAll('div.container-contact-form > div.cta-phone-number')).map( e => e.innerText);
        }

        const brokerAddr = Array.from(document.querySelectorAll('div.container-contact-form > div.cta-address')).map( e => e.innerText.replaceAll('\n', ' '));

        return {
            lngLat: lngLat, // array
            inContract: inContract, // boolean
            imgs: imgs, // array
            execSum: execSum, // text
            factsArray: factsArray, // array
            factsRaw: factsRaw, // array of arrays
            financialsArray: financialsArray, // array (sale listings => data needs cleaning)
            financials: leaseData ? (tenantData.length > 0 ? {tenant_data: tenantData, lease_data: leaseData}:{lease_data: leaseData}): null, // object
            meta: meta, // obj
            brokers: { // obj
                name: [...brokers], 
                phone: [...brokerPhone],
                addr: [...brokerAddr],
            }
        };
    }, listing_type);   
}

// Save listing details to databsae
async function saveListing(p){
    // if no results were found tag as a bad link 
    if (p.off_market){
        await db.query('BEGIN');
        const l_id = await db.query('UPDATE hsing_data.loopnet set off_market=true, meta=$1 \
                                    WHERE href=$2 RETURNING l_id', [p.meta, p.href]);
        await db.query('COMMIT');
        console.log(`************** BAD LINK - labeled l_id ${l_id['rows'][0]['l_id']} to hsing_data.loopnet **************`)
        return; 
    }
    try{
        await db.query('BEGIN');
        const queryText = 'UPDATE hsing_data.loopnet set (the_geom, in_contract, \
                            imgs, exec_sum, meta, brokers, facts, financials, off_market) = \
                           (ST_SetSRID(ST_MakePoint($1::float, $2::float), 4269), $3, $4, $5, $6, $7, $8, $9, $10) WHERE href=$11 RETURNING l_id'; 
        const l_id = await db.query(queryText, [p.lngLat[0], p.lngLat[1], p.inContract, 
                        p.imgs, p.execSum, p.meta, p.brokers, p.facts, p.financials, false, p.href]);
        await db.query('COMMIT');
        console.log(`************** Saved l_id ${l_id['rows'][0]['l_id']} to hsing_data.loopnet **************`)
        return;
    } catch (e) {
        await db.query('ROLLBACK');
        throw e;
    }
}

// ===================== function call =====================
(async () => {
    const LISTING_TYPE = ['sale'];
    LISTING_TYPE.forEach(listing_type => { 
        getSiteMap(target, listing_type) .then(t => getListings(t));

        // To update listing details (not sitemap of actual listings) run the below
        // default to today (dateformat is postgres convention YYYY/MM/DD)

        //getListings({target: target, type: listing_type});
    });    
    return;
    
})();


/**
 * // loopnet listingID and lonLat from MAP 
 * 
Array.from(document.querySelectorAll('div#mapState div'))
    .map(d => {if(d.id){return {id: d.id, lngLat: [d.lon, d.lat]} }});

Array.from(document.querySelectorAll('article'))
    .map(a => {return {
        id: a.dataset.id,
        addr: [...a.getElementsByClassName('placard-carousel-pseudo')][0].title, 
        zipCode: a.getAttribute('gtm-listing-zip'), 
        spaceUse: a.getAttribute('gtm-listing-space-use'),
        propertyType: a.getAttribute('gtm-listing-property-type-name'), 
        imgs: Array.from(a.getElementsByClassName('slide')).map(d => d.children[0].children[0].content), 
        factSummary: [...a.getElementsByClassName('data-points-a')][0] ? 
            [...a.getElementsByClassName('data-points-a')][0].innerText.split('\n') : 
            [...a.getElementsByClassName('data-points-2c')][0].innerText.split('\n'),
        briefDesc: [...a.getElementsByClassName('data-points-b')][0] ?
            [...a.getElementsByClassName('data-points-b')][0].innerText : null, 
        contacts: Array.from(a.getElementsByClassName('contact')).map(d=>d.title), 
    }});

 */

