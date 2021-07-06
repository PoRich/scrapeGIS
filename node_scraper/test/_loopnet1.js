/**  NOTE: RUN THIS FILE FROM THE APP DIR AS 'node app/loopnet.js'   **/
// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require('puppeteer-extra')

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

require('dotenv').config();
const db = require('../db');
const ScrapeTools = require('../modules/scrapeTools.js');

// blocked CSS
const blockedCss = 'section[class="wrap listing-not-found en  ng-scope"]'

// define URL structure 
var target = {
    state: 'FL', // upper case 
    city: 'Miami' // case sensitive
}

// ===================== function call =====================
puppeteer.launch({ headless: false }).then(async browser => {
    const page = await browser.newPage()
    console.log('Running tests..')
    await page.goto('https://bot.sannysoft.com')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: './screenshots/loopnet-bot-test.png', fullPage: true })
    console.log(`All done, check the screenshot. ✨`)
    
    await scrapeInitResults(page, target, 'sale')
    
    await browser.close()
  })


async function scrapeInitResults(page, targetLocation, listing_type){

    var totalPages = 1
    var currentPage = 1;

    // =================== PART 1: Inital Crawl for site map ===================
    const _waitForCss = 'a[class="toggle-favorite ng-scope"]';
    // for sale 
    var _pageURL = `https://www.loopnet.com/search/commercial-real-estate/${targetLocation.city}-${targetLocation.state}/for-${listing_type}/${currentPage}`;
    // for lease
    //var _pageURL = `https://www.loopnet.com/search/commercial-real-estate/${targetLocation.city}-${targetLocation.state}/for-${listing_type}/${currentPage}/?sk=9c9ad9a71c093064f40453351a5b847a`;
    
    console.log(`--------------- navigating to ${_pageURL} ---------------`)
    await page.goto(_pageURL);
    await page.waitForTimeout(ScrapeTools.rand_num(5000, 10000)); // delay to behave human
    await page.screenshot({ path: `./screenshots/loopnet_${listing_type}_${currentPage}.png`, fullPage: true })
    try{
        await page.waitForSelector(_waitForCss, {timeout: 5000}); // wait for page to load successfully
        console.log(`Succesfully loaded ${_pageURL}`)
    } catch(e){
        console.log(`Failed to load ${_pageURL}`)
        return;
    }

    await scrapeMapPins(page, _pageURL);
    
    while (currentPage <= totalPages){
        await scrapeProfileCards(page, listing_type);
        await ScrapeTools.updateMetaStatus(currentPage, totalPages, targetLocation, 'loopnet'+'_'+listing_type)    
        
        // iterate to next page 
        currentPage = currentPage + 1;
        var pageURL = `https://www.loopnet.com/search/commercial-real-estate/${targetLocation.city}-${targetLocation.state}/for-${listing_type}/${currentPage}/`;
        await page.goto(pageURL);
        await page.waitForTimeout(ScrapeTools.rand_num(3000, 5000)); // delay to behave human
        try{
            await page.waitForSelector(_waitForCss, {timeout: 5000}); // wait for page to load successfully
            console.log(`Succesfully loaded ${pageURL}`)
        } catch(e){
            console.log(`Failed to load ${pageURL}`)
            return
        }  
    }
    return;
}


// scrapes ALL pins from map (run once per target location city,state )
async function scrapeMapPins(page){
    try{
        let geocode = await page.evaluate(() =>{
            return Array.from(document.querySelectorAll('div#mapState div'))
                .map(d => {if(d.id){return {id: d.id, lngLat: [d.getAttribute('lon'), d.getAttribute('lat')]} }});
            });
        console.log(`geocode ${JSON.stringify(geocode)}`)
        geocode.forEach(d => {
            if(d){
                saveMapPin(d)
                }
            })

    } catch(e){
        console.log(`scrapeMapPins error: ${e}`)    
        return
    }
}

async function saveMapPin(d){
    try{
        const queryText = 'insert into hsing_data.loopnet (loopnet_id, the_geom) \
            values ($1, ST_SetSRID(ST_MakePoint($2::float, $3::float), 4269)) \
            on conflict do update set the_geom = EXCLUDED.the_geom returning *'; 
        await db.query('BEGIN');
        const queryResult =  await db.query(queryText, [geocode.id, Number(geocode.lngLat[0]), Number(geocode.lngLat[1]) ])
        await db.query('COMMIT');
        console.log(`scrapeMapPins saved loopnet_id: ${d.id} - ${JSON.stringify(queryResult)}`)
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`saveMapPin error: ${e}`)
        throw e
    }
}


// scrapes ALL pins from map (run once per target location city,state )
async function scrapeProfileCards(page, listing_type){

    let profileCards = await page.evaluate(() =>{
        return Array.from(document.querySelectorAll('article'))
            .map(a => {return {
                id: a.dataset.id,
                addr: `${[...a.getElementsByClassName('placard-carousel-pseudo')][0].title} ${a.getAttribute('gtm-listing-zip')}`, 
                //zipCode: a.getAttribute('gtm-listing-zip'), 
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
        });
    console.log(`profileCards ${JSON.stringify(profileCards)}`)
    profileCards.forEach(d => {
        if(d){
            saveProfileCard(d, listing_type);
        }
    })
}

async function saveProfileCard(d, listing_type){
    try{
        let loopnet_id = d.id;
        let addr = d.addr;
        delete d.id; 
        delete d.addr; 
        const queryText = 'update hsing_data.loopnet set (addr, facts, listing_type) \
            values ($1, $2, $3) where loopnet_id=$4 returning *'; 
        await db.query('BEGIN');
        const queryResult =  await db.query(queryText, [addr, d, listing_type, loopnet_id])
        await db.query('COMMIT');
        console.log(`scrapeProfileCards saved loopnet_id: ${d.id} - ${JSON.stringify(queryResult)}`)
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`scrapeProfileCards error: ${e}`)
        throw e
    }
}