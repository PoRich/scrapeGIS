/**  NOTE: RUN THIS FILE FROM THE APP DIR AS 'node app/loopnet.js'   **/
const colors = require('colors/safe')
const puppeteer = require('puppeteer-extra')
require('dotenv').config();
const StealthPlugin = require('puppeteer-extra-plugin-stealth')  // add stealth plugin and use defaults (all evasion techniques)
const ProxyChain = require('proxy-chain');
const db = require('../db');
const ScrapeTools = require('../modules/scrapeTools.js');
puppeteer.use(StealthPlugin())

/**
// Anonymize User Agent 
puppeteer.use(require('puppeteer-extra-plugin-anonymize-ua')({
    stripHeadless: true, 
    makeWindows: false, 
    })
)
 */

// define URL structure 
var target = {
    state: 'IL', // upper case 
    city: 'Chicago' // case sensitive
}
const listing_type = 'sale'; //['lease', 'sale'];

// -------------------------- Proxies -------------------------- 
// State: proxy 
const useProxy = null;

/** Run the following in terminal to start/stop Tor
$ brew services start tor
$ brew services stop tor
*/

const proxies = {
    // free proxies
        'tor': {
            address: 'socks5://127.0.0.1', 
            port: '9050'},
        'session_1': {
            address: 'http://47.242.77.198', 
            port: '8083'},
        'session_2': {
            address: 'http://45.58.189.229', 
            port: '3128'},
        'session_3': {
            address: 'http://47.242.138.117', 
            port: '8083'},
    // premium proxies
        'scraperAPI': {
            address: 'http://proxy-server.scraperapi.com',
            port: '8001',
            credentials: {
                username: 'scraperapi',
                password: '5fa9ed494209abb506dd2ccf7a61d4e2' //process.env.SCRAPERAPI
            }
        }, 
    };


// ===================== function call =====================
async function run(){
    // -------------------------- Proxy Server -------------------------- 
    /*
    // Proxy Chain - Attempt 1 (err: PORT 8000 is already in use)
    const server = new ProxyChain.Server({ 
        port: 8000,
        verbose: true,
        prepareRequestFunction: ({request}) => {
            const sesionId = request.headers['session-id'];
            const proxy = `${proxies[sessionId]['address']}:${proxies[sessionId]['port']}`
            return { requestAuthentication: false, upstreamProxyUrl: proxy};
            // return { requestAuthentication: false, upstreamProxyUrl: 'http://45.58.189.229:3128' };
            }
    });

    server.listen(() => {
        console.log(`Proxy server is listening on port ${8000}`);
    });
   
   // Proxy Chain - Attempt 2 (err: connection is not private)
    const oldProxyUrl = 'http://scraperapi:5fa9ed494209abb506dd2ccf7a61d4e2@proxy-server.scraperapi.com:8001';
    const newProxyUrl = await ProxyChain.anonymizeProxy(oldProxyUrl);
    console.log(`new Proxy: ${newProxyUrl}`);
    */

    // -------------------------- Launch Browswer -------------------------- 
    const headless = false; 
    let browser = null;
    let page = null;
    if (useProxy === 'scraperAPI'){
        browser = await puppeteer.launch({
            headless: headless,
            ignoreHTTPSErrors: true,
            args: [`--proxy-server=${proxies[useProxy].address}:${proxies[useProxy].port}`],
        });
        page = (await browser.pages())[0];
        await page.authenticate(proxies[useProxy].credentials);
    } 
    else if (useProxy) {
        browser = await puppeteer.launch({
            headless: headless,
            args: [`--proxy-server=${proxies[useProxy].address}:${proxies[useProxy].port}`],
        });
        page = (await browser.pages())[0];
    }
    else {
        browser = await puppeteer.launch({
            headless: headless, 
            // args: [`--proxy-server=${newProxyUrl}`],
        });
        page = (await browser.pages())[0];
    }

    //const page = await browser.newPage()
    // configure page 
    // await page.setViewport({width: 800, height: 600});
    

    // set extra headers
    //await page.setExtraHTTPHeaders({
        //'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8', 
        /*
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'DNT': '1',
        'Host': 'www.loopnet.com',
        'Referer': 'https://www.loopnet.com',
        'Sec-GPC': '1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:89.0) Gecko/20100101 Firefox/89.0'
    })
*/
    // -------------------------- Run Tests -------------------------- 
    // Check if Tor is running 
    if (useProxy === 'tor'){    
        await page.goto('https://check.torproject.org/');
        const isUsingTor = await page.$eval('body', el =>
        el.innerHTML.includes('Congratulations. This browser is configured to use Tor')
        );

        if (!isUsingTor){
            console.log(colors.red.bold('Not using Tor. Closing... '));
            return await browser.close();
        }

        console.log(colors.green.bold('Using Tor. Continuing... '))
    }

    // Test for bot
    console.log('Running tests...')
    await page.goto('https://bot.sannysoft.com')
    await page.waitForTimeout(7000)
    await page.screenshot({ path: './screenshots/loopnet-bot-test.png', fullPage: true })
    console.log(`All done, check the screenshot. ✨`)

    // Check IP 
    await page.goto('https://httpbin.org/ip');
    await page.screenshot({ path: './screenshots/loopnet-ip-test.png', fullPage: true })
    console.log(`All done with IP screenshot. ✨`)

    // -------------------------- Optimize bandwith/speed -------------------------- 
    /* TODO - use puppeteer-extra-plugin-block-resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if(req.resourceType() == 'stylesheet' || 
            req.resourceType() == 'font' || 
            req.resourceType() === 'image'){
                req.abort();
        }
        else {
            req.continue();
        }   
    }); 
    */

    // -------------------------- Geography Search -------------------------- 
    await page.goto('https://loopnet.com');
    
    // Detect and close pop up
    try{
        const closePopUp = 'button[class="csgp-modal-close ln-icon-close-hollow"]';
        await page.waitForSelector(closePopUp, {timeout: 5000}); // wait for popup 
        await page.click(closePopUp, {delay: 20});
        console.log(`Popup detected and closed`)
    } catch(e){
        console.log(`No popup detected`)
    }
    
    await page.screenshot({ path: './screenshots/loopnet-search.png', fullPage: true })
    console.log('All done with loopnet search screenshot ')
    
    const searchType = {
        'lease': 'li.search-types--for-lease button', 
        'sale': 'li.search-types--for-sale button', 
        'auction': 'li.search-types--auction button', 
        'business': 'li.search-types--BBS button'
    };

    await page.click(searchType[listing_type], {delay: 13})
    await page.type('input[name="geography"]', `${target.city}, ${target.state}`, {delay: 20});
    await page.click('button.do-search', {delay: 17});


    // -------------------------- Scrape Results -------------------------- 
    const cachePrefix = 'http://webcache.googleusercontent.com/search?q=cache:'
    await page.goto(`${cachePrefix}https://www.loopnet.com/search/commercial-real-estate/chicago-il/for-sale`)
    var totalPages = 1
    var currentPage = 1;
    var maxResultsPerPage = 20;
    const searchLoaded = 'a[class="toggle-favorite ng-scope"]';
    const totalPagesCss = 'div[class="total-results"] span[class="ng-binding"]';

    while (currentPage <= totalPages){
        // wait for page to load successfully
        try{
            await page.waitForSelector(searchLoaded, {timeout: 10000}); 
            await page.screenshot({ path: `./screenshots/loopnet_${listing_type}_${currentPage}.png`, fullPage: true })
            console.log(`Succesfully loaded initial search results`)
        } catch(e){
            await page.screenshot({ path: `./screenshots/loopnet_${listing_type}_${currentPage}-err.png`, fullPage: true })
            console.log(`Failed to load initial search results`)
            return await browser.close();
        }
        
        // Scrape the map once
        if (currentPage === 1){ 
            await scrapeMapPins(page, listing_type);
            // TODO pass variables to $eval
            totalPages = await page.$eval(totalPagesCss, 
                (el, _maxResultsPerPage) => 
                    Math.ceil(Number(el.innerHTML)/_maxResultsPerPage), maxResultsPerPage); 
            console.log(`totalPages ${totalPages}`)
        }

        await scrapeProfileCards(page, listing_type);
        await ScrapeTools.updateMetaStatus(currentPage, totalPages, targetLocation, 'loopnet'+'_'+listing_type)    

        // Scroll down 
        await page._client.send("Input.synthesizeScrollGesture", {
            x: 50,
            y: 0,
            xDistance: 0,
            yDistance: - ScrapeTools.rand_num(0,1000),
        });
        
        // Track current page & Navigate to Next Page
        currentPage = currentPage + 1;
        await page.waitForTimeout(ScrapeTools.rand_num(3000, 5000)); // delay to behave human
        await page.click('a.caret-right-large', {delay: 14});
    }
    return await browser.close();
}


// scrapes ALL pins from map (run once per target location city,state )
async function scrapeMapPins(page, listing_type){
    try{
        let geocode = await page.evaluate(() =>{
            return Array.from(document.querySelectorAll('div#mapState div'))
                .map(d => {if(d.id){return {id: d.id, lngLat: [d.getAttribute('lon'), d.getAttribute('lat')]} }});
            });
        console.log(`geocode ${JSON.stringify(geocode)}`)
        geocode.forEach(d => {
            if(d){
                saveMapPin(d, listing_type)
                }
            })

    } catch(e){
        console.log(`scrapeMapPins error: ${e}`)    
        return
    }
}


async function saveMapPin(d, listing_type){
    try{  // href is temporarily set to loopnet_id because it cannot be null
        const queryText = 'insert into hsing_data.loopnet (loopnet_id, the_geom, href, \
            target_plcidfp, listing_type, date_scraped) \
            values ($1, ST_SetSRID(ST_MakePoint($2::float, $3::float), 4269), $1, \
                    (select pcl.place_to_fp($4, $5)), $6, now()) \
            on conflict on constraint unique_loopnet_id \
            do update set the_geom = EXCLUDED.the_geom returning *'; 
        await db.query('BEGIN');
        const queryResult =  await db.query(queryText, [d.id, Number(d.lngLat[0]), Number(d.lngLat[1]), 
                         target.city, target.state, listing_type]);
        await db.query('COMMIT');
        console.log(`scrapeMapPins saved loopnet_id: ${JSON.stringify(queryResult['rows'][0]['loopnet_id'])}`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`saveMapPin error: ${e}`);
        throw e
    }
}


// scrapes ALL pins from map (run once per target location city,state )
async function scrapeProfileCards(page, listing_type){
    let profileCards = null;
    if(listing_type ==='lease'){
        profileCards = await page.evaluate(() =>{
            return Array.from(document.querySelectorAll('article'))
                .map(a => {return {
                    id: a.dataset.id,
                    addr: `${[...a.getElementsByClassName('placard-carousel-pseudo')][0].title} ${a.getAttribute('gtm-listing-zip')}`, 
                    href: `${[...a.getElementsByClassName('placard-carousel-pseudo')][0].href}`,
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
    } else {
        profileCards = await page.evaluate(() =>{
            return Array.from(document.querySelectorAll('article'))
                .map(a => {return {
                    id: a.dataset.id,
                    addr: `${[...a.getElementsByClassName('placard-carousel-pseudo')][0].title} ${a.getAttribute('gtm-listing-zip')}`, 
                    href: [...a.getElementsByClassName('placard-carousel-pseudo')][0].href ?
                        [...a.getElementsByClassName('placard-carousel-pseudo')][0].href : 
                        [...a.getElementsByClassName('placard-carousel-pseudo')][0].getAttribute('ng-href'),
                    // spaceUse: a.getAttribute('gtm-listing-space-use'),
                    propertyType: a.getAttribute('gtm-listing-property-type-name'), 
                    listingType: a.getAttribute('gtm-listing-type-name'),
                    imgs: Array.from(a.getElementsByClassName('slide')).map(d => d.children[0].children[0].content), 
                    factSummary: [...a.getElementsByClassName('data-points-a')][0] ? 
                        [...a.getElementsByClassName('data-points-a')][0].innerText.split('\n') : 
                        ([...a.getElementsByClassName('data-points-2c')][0] ? 
                        [...a.getElementsByClassName('data-points-2c')][0].innerText.split('\n'): null),
                    briefDesc: [...a.getElementsByClassName('data-points-b')][0] ?
                        [...a.getElementsByClassName('data-points-b')][0].innerText : null, 
                    contacts: a.getElementsByClassName('contact') ? Array.from(a.getElementsByClassName('contact')).map(d=>d.title) : null, 
                    }});
            });
    }


    console.log(`profileCards ${JSON.stringify(profileCards)}`)
    profileCards.forEach(d => {
        if(d){
            // Data processing ================================================
            // Remove empty strings from factSummary
            let cleanFacts = [] 
            d.factSummary.forEach(e => {
                if( e.trim() ){
                    cleanFacts.push( e.trim() );
                }
            });
            d.factSummary = cleanFacts;

            saveProfileCard(d, listing_type);
        }
    })
}

async function saveProfileCard(d, listing_type){
    console.log(`saveProfileCard d: ${JSON.stringify(d)} | listing_type: ${listing_type}`)
    try{
        let loopnet_id = d.id;
        let addr = d.addr;
        let href = d.href; 
        let exec_sum = d.briefDesc;
        
        delete d.id; 
        delete d.addr; 
        delete d.href;
        delete d.exec_sum;

        const queryText = 'update hsing_data.loopnet set (addr, href, exec_sum, facts) \
            values ($1, $2, $3, $4) where loopnet_id=$5 and listing_type=$6 returning *'; 
            await db.query('BEGIN');
            const queryResult =  await db.query(queryText, [addr, href, exec_sum, d, loopnet_id, listing_type])
        await db.query('COMMIT');
        console.log(`scrapeProfileCards saved loopnet_id: ${d.id} - ${JSON.stringify(queryResult)}`)
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`scrapeProfileCards error: ${e}`)
        throw e
    }
}


// -------------------------- Function Call -------------------------- 
run();

// Test Stealth 
// document.body.appendChild(Object.assign(document.createElement('script'), {src: 'https://gitcdn.xyz/repo/berstend/puppeteer-extra/stealth-js/stealth.min.js'}))

// ================ Basic Best Practices ================
// https://www.scrapehero.com/how-to-prevent-getting-blacklisted-while-scraping/
// https://stackoverflow.com/questions/51731848/how-to-avoid-being-detected-as-bot-on-puppeteer-and-phantomjs
// https://www.scraperapi.com/blog/5-tips-for-web-scraping/

// ================ Frameworks  ================
// https://www.scrapehero.com/open-source-javascript-web-scraping-tools-and-frameworks/

// ================ Tor + Puppeteer ================
// https://medium.com/@jsilvax/running-puppeteer-with-tor-45cc449e5672
// note: on mac, torrc.sample is in /usr/local/etc/tor

// ================ Proxy Rotation ================
// https://scrapingant.com/blog/how-to-use-rotating-proxies-with-puppeteer
// https://stackoverflow.com/questions/67569465/webscraper-being-blocked-how-to-make-a-puppeteer-ip-address-rotation

// ================ Google Cache ================
// http://webcache.googleusercontent.com/search?q=cache:https://www.loopnet.com/search/commercial-real-estate/philadelphia-pa/for-lease/



 



/**
 * Notes: Stealth mode (with simulated UI) with no additional configurations (user agent, viewport) works 
 * without proxies for loopnet lease listings 
 * 
 * BOT Detection could be timing based so do not repeatedly hit the site without random delays 
 * 
 * additional configurations seem to mess up the stealth configurations - it no longer passes (https://bot.sannysoft.com) bot tests 
 * 
 * BLOCKED - pupeteer-stealth, no proxy (You have exceeded the amount of activity)
 * BLOCKED - firefox incognito (You have exceeded the amount of activity)
 * NOT BLOCKED - firefox 
 * BLOCKED - tor (access denied)
 * 
 * 
 */