const puppeteerExtra = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
require('dotenv').config();
const db = require('../db');
const ScrapeTools = require('../modules/scrapeTools.js');

puppeteerExtra.use(StealthPlugin());  

puppeteerExtra.use(
    RecaptchaPlugin({
        provider:{
            id: '2captcha', 
            token: process.env.TWOCAPTCHA,  
        },
        visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    })
)

const recaptchaCss = '.g-recaptcha'; 
const recaptchaSubmitCss = '.ybtn.ybtn--primary';

// =================== RUN FUNCTION ===================
var target = {};

async function run(){
    /*
    // pull list of states to scrape 
    var states_hitlist = await ScrapeTools.getTargetState('yelp');
    //var states_hitlist = ['TX'];
    while (states_hitlist.length >0) {
        await initial_scrape(states_hitlist.pop());
    }
    */

    // Start browser, open new page, prep use-agent 
    let browser = await puppeteerExtra.launch({headless: true});
    let page = await browser.newPage();
    page = await ScrapeTools.preparePageForTests(page);
    page = await ScrapeTools.blockResources(page, ['font', 'media', 'image', 'other']);
    await geocodePostFacto(page);
    await browser.close();
};

// =================== STEP1: initial Scrape ===================
/**
 * takes tiger list of cities and saves help search results 
 *  @result null;
 */
async function initial_scrape(targetState) {
    // prep chronium 
    let browser = await puppeteerExtra.launch({headless: true});
    let page = await browser.newPage();
    await ScrapeTools.preparePageForTests(page);
    
    // pull city to scrape from db
    var _target = await ScrapeTools.getTargetCity(targetState, 'yelp'); 
    console.log(`_target ${_target}`)

    while (_target){
        // scrape summary listings for each city 
        target['city'] =  _target[0];
        target['state'] = _target[1];
        //target['county'] = _target[2];

        console.log(`========= SCRAPING YELP city: ${target['city']}, state ${target['state']} ==============`);
        var totalPages = 1;

        for(let j=1; j<=totalPages; j=j+1){
            url = `https://www.yelp.com/search?find_desc=Dentists&find_loc=${target['city']}%2C+${target['state']}&start=${(j-1)*10}`
            p = await scrapeSearch(url, page)
            if (p == -1){ // no results detected
                await ScrapeTools.updateMetaStatus(-1, -1, target, 'yelp');
                continue 
            } 
            else if (p.length == 2) { // first item is the page number
                totalPages = p[0]; // update total pages (this may change as you paginate through results)
                bizData = p[1];    
                for(let k=0; k<bizData.length; k=k+1){
                    await saveBiz(bizData[k], target, url)
                    console.log(`Saved ${bizData[k]['name']} to db`)
                }
                await ScrapeTools.updateMetaStatus(j, totalPages, target, 'yelp');
            }
        }
        // scrape individual business pages where address is missing 
        var d = await detail_scrape(target, page);

        // get next target 
        _target = await ScrapeTools.getTargetCity(targetState, 'yelp'); 
        console.log(`next target city ${_target}`);
    }

    await browser.close();
}

// =================== STEP 2: GET FULL ADDRESSES of Company's Profile page ===================

async function detail_scrape(target, page) {
    //let browser = await puppeteerExtra.launch({headless: true});
    //let page = await browser.newPage();
    // pull initial targets from db
    var _targetList = await getProfileLinks(target);  // list of objects with keys d_id, and profile_url
    var targetObj
    while(_targetList.length > 0){
        targetObj = _targetList.pop();
        var addrPayload = await scrapeAddress(targetObj['profile_url'], page);
        await saveFullAddr(targetObj['d_id'], addrPayload);
        console.log(`saved ${addrPayload[0]} ${addrPayload[1]} --> d_id: ${targetObj['d_id']}`)
    }

    //await browser.close();
}



// =================== STEP X: GET MISSING ADDRESSES ===================
/*
// 2163 missing addresses 
 select distinct count(src) from dental_data.yelp where addr is null and biz_name is not null; 
 select array(select distinct src from dental_data.yelp where addr is null and biz_name is not null order by src); 

select biz_name, 
--addr, 
--phone, specialty, 
-- rating, num_reviews,
src, last_update from dental_data.yelp 
where addr is null and biz_name is not null order by biz_name, src;


select distinct city, state from dental_data.yelp where addr is null and biz_name is not null; 
*/
/*

(async () => {
    // prep chronium 
    let browser = await puppeteerExtra.launch({headless: true});
    let page = await browser.newPage();
    await ScrapeTools.preparePageForTests(page);
    
    // pull urls where address is missing from db
    var URLs = await getIncompleteURLs(); 
    var target_regex = /find_loc=(.*)%2C\+([A-Z]{2,2})/
    
    while (URLs.length > 0){
        var url = URLs.pop()
        console.log(`url: ${url}`)
        target['city'] =  target_regex.exec(url)[1];
        target['state'] = target_regex.exec(url)[2];
        var countyQueryText = 'select county from dental_data.meta where city ~* $1 and state_abbrev ~* $2;';
        target['county'] = db.query(countyQueryText, [ target['city'], target['state'] ]);

        var p = await scrapeSearch(url, page)
        var bizData = p[1];

        var updateStatusText;
        try{
            for(let i=0; i<bizData.length; i=i+1){
                await saveBiz(bizData[i], target, url)
                console.log(`Saved ${bizData[i]['name']} @ ${bizData[i]['addr']} to db`)
            }
            updateStatusText = 'update biz.dentists_redo set u_status=1 where url=$1;';
        } catch(e){
            console.log(`failed to scrape ${url}: ${e}`)
            updateStatusText = 'update biz.dentists_redo set u_status=-1 where url=$1;';
        }
        db.query(updateStatusText, [ url ]);
    }

    await browser.close();
})();
 */

// ============================== HELPER FUNCTIONS ============================== 


async function scrapeSearch(pageURL, page){
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
        await page.waitForSelector('a[class="css-166la90"]', {timeout: 10000});
    } catch (e) {
        console.log(`No results on page or Recaptcha : ${e}`)
        // ==================== RECAPTCHA CODE BLOCK [START] ====================
        try{
            await page.waitForSelector('.g-recaptcha', {timeout: 5000});
            await page.solveRecaptchas();  // puppeteer 2captcha plugin
            await Promise.all([
                page.waitForNavigation(),
                page.click('.ybtn.ybtn--primary')
            ]);
            var payload2 = scrapeSearch(pageURL, page)
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
    const payload = await page.evaluate(() => {
        var parentElement = Array.from(document.querySelectorAll('div[class=" scrollablePhotos__09f24__1PpB8 arrange__09f24__2v3uJ border-color--default__09f24__1eOdn"]'));
        // Gather desired elements
        var pre = parentElement.map(function (e, i){
            return {
                name: e.firstElementChild.querySelectorAll('a[class="css-166la90"]'), // [0].innerText, 
                specialty: e.firstElementChild.querySelectorAll('p[class=" css-n6i4z7"]'), // [0].innerText,
                rating: e.firstElementChild.querySelectorAll('div[class=" attribute__09f24__3znwq display--inline-block__09f24__3L1EB margin-r1__09f24__BCulR border-color--default__09f24__1eOdn"]'),
                numRatings: e.firstElementChild.querySelectorAll('span[class="reviewCount__09f24__EUXPN css-e81eai"]'), // [0].innerText,
                phone: e.lastElementChild.querySelectorAll('p[class=" css-8jxw1i"]'), // [0].innerText,
                addr: e.lastElementChild.querySelectorAll('p[class=" css-8jxw1i"]'), // [1].innerText,
            }
        });

        var bizPayload = pre.map( (e, i) => {
            var rating_regex = /aria-label=\"(\d\.?\d?) star rating\" role=/;
            var phone_regex = /\(\d\d\d\) \d\d\d/;

            return {
                name: e.name[0].innerText, 
                profile_url: e.name[0].href,
                specialty: e.specialty.length == 1 ? e.specialty[0].innerText : null,
                rating: e.rating.length == 1 ? Number(rating_regex.exec(e.rating[0].innerHTML)[1]) : null,
                numRatings: e.numRatings.length == 1 ? Number(e.numRatings[0].innerText) : null,
                phone: e.phone.length >= 1 ? (phone_regex.exec(e.phone[0].innerText) ? e.phone[0].innerText : null) : null,
                addr: e.addr.length >= 2 ? (phone_regex.exec(e.addr[1].innerText) ? null : e.addr[1].innerText) : null,
                district: e.addr.length == 3 ? (phone_regex.exec(e.addr[2].innerText) ? null : e.addr[2].innerText) : null,
            }
        })

        var _payload = [];
        var pagination = document.querySelectorAll('div[class=" border-color--default__09f24__1eOdn text-align--center__09f24__1P1jK"] > span[class=" css-e81eai"]')[0].innerHTML;
        var page_regex = / of (\d\d*)$/;
        var totalPages = Number(page_regex.exec(pagination)[1])
        _payload[0] = totalPages;
        _payload[1] = bizPayload;
        return _payload;
    })
    return payload;
}


/** Scrapes business profile page for address if address wasn't in general search results
 * Uses recaptcha rather than proxy because recaptchas are not served frequently 
 * 
 * @param {String} pageURL link to yelp business page  
 * @param {object} page puppeteer page object 
 * @returns Array 
 */
async function scrapeAddress(pageURL, page){
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
        await page.waitForSelector('p[class=" css-m6anxm"] > span', {timeout: 30000});
    } catch (e) {
        // Either 1) no results or 2) blocked by recaptcha 
        console.log(`No results on page or RECAPTCHA: ${e}`)
        // ==================== RECAPTCHA CODE BLOCK [START] ====================
        try{
            await page.waitForSelector('.g-recaptcha"]', {timeout: 15000});
            await page.solveRecaptchas();  // puppeteer 2captcha plugin
            await Promise.all([
                page.waitForNavigation(),
                page.click('.ybtn.ybtn--primary')
            ]);
            var payload2 = scrapeSearch(pageURL, page)
            console.log(`*************** Recaptcha Solved ***************`)
            return payload2;
        } catch (e2) {
            console.log(`No results on page [no Recaptcha found]: ${e2}`)    
            return ['-1', '-1', '-1', '-1'];
        }
        // ==================== RECAPTCHA CODE BLOCK [END] ====================
    }

    const payload = await page.evaluate(() => {
        var fullAddr = document.querySelector('p[class=" css-1h1j0y3"] > p[class=" css-e81eai"]') ? document.querySelector('p[class=" css-1h1j0y3"] > p[class=" css-e81eai"]').innerText : -1;
        var district = document.querySelector('p[class=" css-m6anxm"] > span') ? document.querySelector('p[class=" css-m6anxm"] > span').innerText : -1; 

        var sideBox = document.querySelectorAll('div[class=" arrange-unit__373c0__1piwO arrange-unit-fill__373c0__17z0h border-color--default__373c0__2oFDT"] >p[class=" css-1h1j0y3"]') ? document.querySelectorAll('div[class=" arrange-unit__373c0__1piwO arrange-unit-fill__373c0__17z0h border-color--default__373c0__2oFDT"] >p[class=" css-1h1j0y3"]') : -1;
        var phone_regex = /\(\d\d\d\) \d\d\d/;
        var website_regex = /\.(org|net|com?)$/;
        
        // geocode 
        var mapSrc = document.querySelectorAll('img[alt="Map"]')[0].getAttribute('srcset');
        var latLngRegex = /(-?\d{1,3}\.\d{3,})%2C(-?\d{1,3}\.\d{3,})/;
        var latLngMatch = latLngRegex.exec(mapSrc);
        let lngLat = null
        if (latLngMatch){
            lngLat = [latLngMatch[2], latLngMatch[1]]
        }
        

        let phone = "";
        let website = "";
        for(let i=0; i<sideBox.length; i=i+1){
            if (phone_regex.exec(sideBox[i].innerText)) {
                phone = sideBox[i].innerText;
            }
            else if (website_regex.exec(sideBox[i].innerText)) {
                website = sideBox[i].innerText;
            }
        }
        return [fullAddr, district, phone, website, lngLat];
    })
    return payload;
    }


// database helper functions
async function saveBiz(payload, _target, url){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO dental_data.yelp(biz_name, specialty, phone, addr, \
                            rating, num_reviews, target_city, district, state_abbrev, src, profile_url) \
                            VALUES($1, $2, $3, $4, $5, $6, initcap($7), initcap($8), upper($9), $10, $11) \
                            ON CONFLICT DO NOTHING RETURNING d_id';
        await db.query(queryText, [payload['name'], payload['specialty'], payload['phone'], 
                                  payload['addr'], payload['rating'], payload['numRatings'],
                                  _target['city'], _target['district'], 
                                  _target['state'], url, payload['profile_url']]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}





async function getProfileLinks(target){
    try{
        const queryText = 'select d_id, profile_url from dental_data.yelp where addr is null and state_abbrev=$1 and target_city=$2 order by d_id';
        var res = await db.query(queryText, [target['state'], target['target_city']]);
        //console.log(res['rows'])
        return res['rows']
    } catch (e) {
        throw e
    }   
}


async function saveFullAddr(_d_id, _addrPayload){
    try{
        await db.query('BEGIN');
        const queryText = 'update dental_data.yelp set addr = $1, district = $2, \
                           phone=$3, website=$4, the_geom=(ST_SetSRID(ST_MakePoint($5::float, $6::float), 4269) where d_id=$7';
        await db.query(queryText, [_addrPayload[0], _addrPayload[1], _addrPayload[2], 
                _addrPayload[3], _addrPayload[4][0], _addrPayload[4][1], _d_id]);
        await db.query('COMMIT');
    } catch (e) {
        console.log('failed to save full address')
        await db.query('ROLLBACK');
        throw e
    }
}


async function getIncompleteURLs(){
/* Before using this function, run the following SQL code block to gather urls needing redo:
insert into biz.dentists_redo(url) select distinct src from dental_data.yelp where addr is null and biz_name is not null order by src;
*/
    try{
        const queryText = 'select array(select url from biz.dentists_redo where u_status is null order by url) as url';
        var res = await db.query(queryText);
        return res['rows'][0]['url']
    } catch (e) {
        throw e
    }   
}


/**
 * Revisits yelp business profile pages and scrapes geocode info
 */
async function geocodePostFacto(page){
    // get urls 
    const urlsQuery = await db.query('select array_agg(profile_url) urls from dental_data.yelp where the_geom is null and no_geocode is null');
    let urls = urlsQuery['rows'][0]['urls'];
    if (!urls){
        console.log(`geocodePostFacto: No urls to update from db query`)
        return;
    }

    while (urls.length > 0){
        let url = urls.pop();
        console.log(`************ scraping geom from ${url} ************`)
        let payload = await scrapeGeom(url, page);
        console.log(`payload -> ${JSON.stringify(payload)}`);
        if (payload !== -1){
            // save lnglat b
            try{
                await db.query('BEGIN');
                const queryText = 'update dental_data.yelp set \
                        (the_geom, last_update)=(ST_SetSRID(ST_MakePoint($1::float, $2::float), 4269), now()) where profile_url=$3 returning *';
                const r = await db.query(queryText, [payload[0], payload[1], url]);
                await db.query('COMMIT');
                console.log(`geocodePostFacto: Saved geocode for d_id: ${r['rows'][0]['d_id']}} -> dental_data.yelp`)
            } catch (e) {
                console.log(`geocodePostFacto: Failed to save geom: ${e}`)
                await db.query('ROLLBACK');
                throw e
            }
        }else {
            try{
                await db.query('BEGIN');
                const r = await db.query('update dental_data.yelp set no_geocode=1 where profile_url=$1 returning *', [url])
                await db.query('COMMIT');
                console.log(`geocodePostFacto: Set no_geocde for: ${r['rows'][0]['profile_url']}} -> dental_data.yelp`)
            } catch(e){
                await db.query('ROLLBACK');
                console.log(`geocodePostFacto: Failed to save no_geocode on ${url}: ${e}`)
                throw e
            }
            
        }
    }
    
    return;
}

async function scrapeGeom(pageURL, page){
    const _waitForCss = 'img[alt="Map"]';
    const r = await ScrapeTools.prepPage(pageURL, page, scrapeGeom, _waitForCss, recaptchaCss, recaptchaSubmitCss);
    if(r===-1){
        return -1;
    }
    return page.evaluate(()=>{ 
        var mapSrc = document.querySelectorAll('img[alt="Map"]')[0].getAttribute('srcset');
        var latLngRegex = /(-?\d{1,3}\.\d{3,})%2C(-?\d{1,3}\.\d{3,})/;
        var latLngMatch = latLngRegex.exec(mapSrc);
        let lngLat = null
        if (latLngMatch){
            lngLat = [latLngMatch[2], latLngMatch[1]]
        }
        return lngLat ? lngLat : -1;
    });
};

run();