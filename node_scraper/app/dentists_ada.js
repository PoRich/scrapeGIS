// NOTE: RUN THIS FILE FROM THE APP DIR AS 'node app/dentists_ada.js'
// TODO - addresses showing up as 'x miles'
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

// GLOBAL VARIABLES
let parentURL = 'https://findadentist.ada.org';
var target = {};
    target['state'] = 'PA';  // select a state to scrape
    target['city'] = '[not_scraped]';  

// *************************** Scraping ***************************
(async () =>{
    // start browser & open new page 
    let browser = await puppeteerExtra.launch({
        headless: false, 
        //args: ['--proxy-server=127.0.0.1:8123'] // ['--lang=en-US,en']  // look like a human
    });
    let page = await browser.newPage();
    await preparePageForTests(page);


    // =================== PART 1: get site map ===================

    var stateURL = `${parentURL}/${target['state']}`
    try { 
        await page.goto(stateURL, { waitUntil: 'load', timeout: 9000} );
        console.log(`opened the page ${stateURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${stateURL} with error: ${error}`);
    }
/*
    // =================== PART 1A: map counties for this state
    var masterCountyList = await getChildLinks(stateURL, page);

    // save to db
    for (let i=0; i < masterCountyList.length; i=i+1){
        if (masterCountyList[i] == 'County') { // https://findadentist.ada.org/ has dummy County called 'County'
            masterCountyList.splice(i, 1) // disregard
            continue;
        }
        else {
            await saveCounty(target['state'], masterCountyList[i]);
        }
    }

    var countiesInitCrawl = masterCountyList;  // copy list of counties to track progress of initial crawl
    //var countiesInitCrawl = [ 'Philadelphia', 'Chester', 'Bucks', 'Montgomery', 'Delaware']; // can specify which to target
    // ================== PART 1C2: map pagination and first page of dentist for each county 
    // loop through the list of counties - scraping pages = 1

    while (countiesInitCrawl.length > 0){
        target['county'] = countiesInitCrawl.pop();
        var pageOneURL = `${parentURL}/${target['state']}/${target['county']}`;
        await countyScrape(pageOneURL, target, page);  // could instead loop through each county scrape by city (if there were many more cities than counties)
    };
*/
    // ================== PART 2: crawl remaining pages <> 1 ==================
    // loop through the list of counties again - scraping pages <> 1
    var countiesMP = await getDBCounties(target['state']);  // copy list of counties to track progress of 2nd pass crawl (MP for more pages)
    console.log(`counties found: ${countiesMP}`)
    while (countiesMP.length > 0){
        target['county'] = countiesMP.pop();
        var maxPages = await getDBPages(target['state'], target['county'], target['city']);
        console.log(`${target['county']}, ${target['state']} has ${maxPages} pages of dentists`);
        for (let j=2; j <= maxPages; j=j+1){  // first page has already been scraped 
            var pageOnePlusURL = `${parentURL}/${target['state']}/${target['county']}?page=${j}`;
            await countyScrape(pageOnePlusURL, target, page); 
        }        
    }

    await browser.close();
    process.exit()
})();


// ******************************* HELPER FUNCTIONS ************************************
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

// for each state/county, get link for each county/city
async function getChildLinks(pageURL, page){  
    // to get counties, input is state-level url https://findadentist.ada.org/tx
    // to get cities input is county-level url https://findadentist.ada.org/tx/dallas
    try { // try to go to URL
        await page.goto(pageURL, { waitUntil: 'load', timeout: 6000} );
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
    
    await page.waitForSelector('li[class="column-list__column__item"]', {timeout: 0});
    // NOTE: $eval is the same as document.querySelector; $$eval is the same as document.querySelectorAll
    // document.querySelectorAll('li[class="column-list__column__item"]').forEach(function(x){ console.log(x.innerText) })
    const countyList = await page.evaluate(() => {

        let header = document.querySelector('h2[class="bordered-headline"]').innerText;
        let regexCounty = /Browse Dentists by (County) in /;
        let regexLocation = /Browse Dentists by (Location) in /;
        let childType = '';
        if ((regexCounty.exec(header) == null) && (regexLocation.exec(header) == null)) {
            childType = null;
        } else if (regexCounty.exec(header) == null){
            childType = 'City';
        } else {
            childType = 'County';
        }

        if (childType == 'City' || childType == 'County'){
            let elements = Array.from(document.querySelectorAll('li[class="column-list__column__item"]'))
            let counties = elements.map(element =>{
                return element.innerText
            })
            console.log(`counties: ${counties}`)
            return counties;
        }
        else {  // child links are specialties not counties or cities 
            return null;
        }
    })
    return countyList
}


async function getDentists(pageURL, page){ // input is county-level url https://findadentist.ada.org/pa/adams
    // returns list, first element is # of pages for that city, second element is list of dentists objects
    try { // try to go to URL
        await page.goto(pageURL, { waitUntil: 'load', timeout: 36001} );
        console.log(`opened the page ${pageURL}`);
        // TODO check for error 503 status? 
    } catch (error) {
        console.log(`failed to open the page: ${pageURL} with error: ${error}`);
        // ==================== RECAPTCHA CODE BLOCK [START] ====================
        try {
            // trigger reCaptcha by going to general-practice url
            await page.goto(ScrapeTools.proxy_url('https://findadentist.ada.org/de/kent/dover/general-practice'), { waitUntil: 'load', timeout: 18002} );

            //await page.waitForSelector('div[class="high-traffic-captcha-overlay"]', { timeout: 12000 });
            await page.waitForTimeout(9000);
            await page.solveRecaptchas();  // puppeteer 2captcha plugin

            await Promise.all([
                page.waitForNavigation(),
                page.click('.high-traffic-captcha-overlay [type="submit"]')
            ]);
            console.log('recaptcha found');
            
            var payload2 =  await getDentists(pageURL, page);
            return payload2;
        }
        catch (e) {
            console.log('no recaptcha found');
        }
        // ==================== RECAPTCHA CODE BLOCK [END] ====================
    }

    // act human
    await page._client.send("Input.synthesizeScrollGesture", {
        x: 0,
        y: 0,
        xDistance: 0,
        yDistance: - ScrapeTools.rand_num(0,100),
        })

    try{
        await page.waitForSelector('li[class="dentist-list__item"]', {timeout: 36003});
    } catch(e){
        console.log('dentist data not loading; scraper is likely blocked;')
        // TODO check for error 503 status?
        // ==================== RECAPTCHA CODE BLOCK [START] ====================
        try {
            // trigger reCaptcha by going to general-practice url
            await page.goto(ScrapeTools.proxy_url('https://findadentist.ada.org/de/kent/dover/general-practice'), { waitUntil: 'load', timeout: 18004} );

            //await page.waitForSelector('div[class="high-traffic-captcha-overlay"]', { timeout: 12000 });
            await page.waitForTimeout(9003);
            await page.solveRecaptchas();  // puppeteer 2captcha plugin

            await Promise.all([
                page.waitForNavigation(),
                page.click('.high-traffic-captcha-overlay [type="submit"]')
            ]);
            console.log('recaptcha found');
            
            var payload2 =  await getDentists(pageURL, page);
            return payload2;
        }
        catch (e) {
            console.log('no recaptcha found');
        }
        // ==================== RECAPTCHA CODE BLOCK [END] ====================
    }
    
    const payload = await page.evaluate(() => {
        let elements = Array.from(document.querySelectorAll('li[class="dentist-list__item"]'));
        let _dentists = elements.map(element =>{
            let htmlContent = element.innerHTML
            let regex = / src=\"(.*)\"\salt=/i;
            return {photo_src: regex.exec(htmlContent)[1], 
                    profile_url: element.querySelector('.photo > a').href,
                   specialty: element.firstElementChild.children[1].innerText, 
                   raw_name: element.firstElementChild.children[2].innerText, 
                   raw_phone: element.firstElementChild.children[3].innerText,
                   raw_addr: element.firstElementChild.children[4].innerText};
        });
        // add total pages to payload - get inner text of second to last pagination element, adjust for -1 for index being zero based 
        let pagination = document.querySelector('ul[class="pagination"]').children[document.querySelector('ul[class="pagination"]').childElementCount-2].innerText; 

        // check that child links are Cities or Counties (and not specialties)
        let header = document.querySelector('h2[class="bordered-headline"]').innerText;
        let regexCounty = /Browse Dentists by (County) in /;
        let regexLocation = /Browse Dentists by (Location) in /;
        let childType = '';
        if ((regexCounty.exec(header) == null) && (regexLocation.exec(header) == null)) {
            childType = null;
        } else if (regexCounty.exec(header) == null){
            childType = 'City';
        } else {
            childType = 'County';
        }

        let cities = [];
        if (childType == 'City' || childType == 'County'){
            let cityList = Array.from(document.querySelectorAll('li[class="column-list__column__item"]'))
            cities = cityList.map(element =>{ return element.innerText })
        } else {
            cities = [null];
        }

        var arr = [];
        arr[0] = Number(pagination);
        arr[1] = cities;
        arr[2] = _dentists;
        return arr;  
    });
    return payload;
}

// database helper functions
async function saveCounty(state_abbrev, county){
    try{
        await db.query('BEGIN');
        const queryText = 'SELECT dental.get_dentist_county($1, $2)';
        const res = await db.query(queryText, [state_abbrev, county]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

async function saveCity(state_abbrev, county, city){
    try{
        await db.query('BEGIN');
        const queryText = 'SELECT dental.get_dentist_city(upper($1), $2, $3)';
        const res = await db.query(queryText, [state_abbrev, county, city]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

async function savePagination(state_abbrev, county, city, ada_max_pages){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO dental_data.ada_meta(state_abbrev, county, city, ada_max_pages, ada_status) VALUES($1, $2, $3, $4, $5) ON CONFLICT ON CONSTRAINT meta_state_abbrev_county_city_key DO UPDATE SET ada_max_pages = EXCLUDED.ada_max_pages RETURNING l_id';
        const res = await db.query(queryText, [state_abbrev.toUpperCase(), county, city, ada_max_pages, 0]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

// TODO test profile_url 
async function saveDentist(state_abbrev, county, city, photo_src, specialty, raw_name, raw_phone, raw_addr, src, profile_url){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO biz_data.dental_ada(state_abbrev, county, city, photo_src, specialty, dentist_name, phone, addr, src, profile_url) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT ON CONSTRAINT ada_dentist_name_addr_key DO NOTHING RETURNING d_id';
        const res = await db.query(queryText, [state_abbrev.toUpperCase(), county, city, photo_src, specialty, raw_name, raw_phone, raw_addr, src, profile_url]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}


async function countyScrape(url, target, page){
    // scrapes cities, pagination and 1st page of dentists for each county and saves to db
    var state_abbrev = target['state'];
    var targetCounty = target['county'];
    var targetCity = target['city'];  // if few cities in each county; scrape county rather than city to minimize HTTP requests

    let payload = await getDentists(ScrapeTools.proxy_url(url), page)
    
    // save pagination 
    var totalPages = payload[0];
    await savePagination(state_abbrev, targetCounty, targetCity, totalPages);
    
    // save list of cities
    var cities = payload[1];
    for (let i=0; i < cities.length; i=i+1){
        console.log(`saving city: ${cities[i]}`);
        await saveCity(state_abbrev, targetCounty, cities[i]);
    }

    // save first page of dentists
    var dentistObjects = payload[2];
    for (let k=0; k < dentistObjects.length; k=k+1){
        let d = dentistObjects[k];
        await saveDentist(state_abbrev, targetCounty, targetCity, d.photo_src, d.specialty, d.raw_name, d.raw_phone, d.raw_addr, url, d.profile_url);
        console.log(`saved: ${d.raw_name} @ ${d.raw_addr}`)
    } 

    // extract pageNumber  (used to set ada_status)
    let regex = /\d$/;
    var pageNumber
    console.log(`url ${url} / regex ${regex.exec(url)}`)
    if (regex.exec(url) == null) {
        pageNumber = 1;
    } else {
        pageNumber = Number(regex.exec(url)[0]);
    }
    // update status for targetCity
    const queryText = 'UPDATE dental_data.ada_meta set ada_status=$1 where state_abbrev=$2 and county=$3 and city=$4';
    const res = await db.query(queryText, [pageNumber, state_abbrev.toUpperCase(), targetCounty, targetCity]);
    console.log(`db l_update status ${pageNumber} for ${state_abbrev}, ${targetCounty}`);
}

async function getDBPages(state_abbrev, county, city){
    // maximum number of pages in a county, city from db
    try{
        await db.query('BEGIN');
        const queryText = 'SELECT ada_max_pages from dental_data.ada_meta where state_abbrev=upper($1) and county=$2 and city=$3 limit 1';
        const res = await db.query(queryText, [state_abbrev, county, city]);
        await db.query('COMMIT');
        return res['rows'][0]['ada_max_pages']
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

async function getDBCounties(state_abbrev){
    // get list of cities in a state from db
    try{
        await db.query('BEGIN');
        const queryText = 'SELECT array(SELECT county from dental_data.ada_meta where state_abbrev=upper($1) and ada_status is not null and ada_status <> ada_max_pages ) as counties'; 
        const res = await db.query(queryText, [state_abbrev]);
        await db.query('COMMIT');
        return res['rows'][0]['counties']
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

/*
async function getDBCities(state_abbrev, county){
    // get list of cities in a state from db
    try{
        await db.query('BEGIN');
        const queryText = 'SELECT array(SELECT city from dental_data.ada_meta where state_abbrev=$1 and county=$2 and city is not null and city <> $$[not_scraped]$$) as cities';
        const res = await db.query(queryText, [state_abbrev, county]);
        await db.query('COMMIT');
        return res['rows'][0]['cities']
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}
*/

