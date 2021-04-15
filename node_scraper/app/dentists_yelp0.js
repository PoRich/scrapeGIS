const puppeteerExtra = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')  // Add adblocker plugin to block all ads and trackers (saves bandwidth)
require('dotenv').config();
const db = require('../db')
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

// Generates proxy api url 
function proxy_url(targetURL){
    // check scraperapi proxy account
    // curl "http://api.scraperapi.com/account?api_key=5fa9ed494209abb506dd2ccf7a61d4e2"
    return `http://api.scraperapi.com/?api_key=${process.env.SCRAPERAPI}&url=${targetURL}&country_code=us`;
}

// Random num generator (for throttling)
function rand_num(min, max) {  
    return Math.floor(
      Math.random() * (max - min) + min
    )
}

async function scrape(pageURL, page){
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
        yDistance: - rand_num(0,100),
        })

    try{
        await page.waitForSelector('a[class="css-166la90"]', {timeout: 48000});
    } catch (e) {
        console.log(`No results on page: ${e}`)
        return -1;
    }

    // NOTE: $eval is the same as document.querySelector; $$eval is the same as document.querySelectorAll
    // document.querySelectorAll('li[class="column-list__column__item"]').forEach(function(x){ console.log(x.innerText) })
    const payload = await page.evaluate(() => {
        var parentElement = Array.from(document.querySelectorAll('div[class=" scrollablePhotos__09f24__1PpB8 arrange__09f24__2v3uJ border-color--default__09f24__1eOdn"]'));
        // Gather desired elements
        var pre = parentElement.map(function (e, i){
            return {
                name: e.firstElementChild.querySelectorAll('a[class="css-166la90"]'), // [0].innerText, 
                desc: e.firstElementChild.querySelectorAll('p[class=" css-n6i4z7"]'), // [0].innerText,
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
                profile: e.name[0].href,
                desc: e.desc.length == 1 ? e.desc[0].innerText : null,
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
        yDistance: - rand_num(0,100),
        })

    try{
        await page.waitForSelector('p[class=" css-m6anxm"] > span', {timeout: 48000});
    } catch (e) {
        console.log(`No results on page: ${e}`)
        return -1;
    }

    const payload = await page.evaluate(() => {
        var fullAddr = document.querySelector('p[class=" css-1h1j0y3"] > p[class=" css-e81eai"]') ? document.querySelector('p[class=" css-1h1j0y3"] > p[class=" css-e81eai"]').innerText : -1;
        var location = document.querySelector('p[class=" css-m6anxm"] > span') ? document.querySelector('p[class=" css-m6anxm"] > span').innerText : -1; 
        return [fullAddr, location];

    })
    return payload;
    }


// database helper functions
async function saveBiz(payload, _target, url){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO biz.dentists(raw_biz, specialty, raw_phone, raw_st_addr, \
                            y_stars, y_reviews, city, district, state_abbrev, county, src, y_profile) \
                            VALUES($1, $2, $3, $4, $5, $6, initcap($7), initcap($8), upper($9), initcap($10), $11, $12) \
                            ON CONFLICT ON CONSTRAINT dentists_raw_biz_raw_st_addr \
                            DO UPDATE SET (y_stars, y_reviews, y_profile, last_update) = (EXCLUDED.y_stars, EXCLUDED.y_reviews, EXCLUDED.y_profile, now()) RETURNING d_id';
        await db.query(queryText, [payload['name'], payload['desc'], payload['phone'], 
                                  payload['addr'], payload['rating'], payload['numRatings'],
                                  _target['city'], _target['district'], 
                                  _target['state'], _target['county'], url, payload['profile']]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

async function updateMetaStatus(_currentPage, _totalPages, _target){
    try{
        await db.query('BEGIN');
        const queryText = 'update biz.dentists_meta set (y_status, y_max_pages) = ($1, $2) \
                           where state_abbrev=upper($3) and county=initcap($4) and city=initcap($5)';
        await db.query(queryText, [_currentPage, _totalPages, 
                                   _target['state'], _target['county'], _target['city'] ]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}


async function getTargetCity(){
    try{
        const queryText = 'select regexp_split_to_array((select concat_ws(\',\', city, state_abbrev, county) \
                           from biz.dentists_meta where city is not null and city <> \'[not_scraped]\' and \
                           (y_max_pages is null or y_status <> y_max_pages) limit 1), \',\') as target';
        var res = await db.query(queryText);
        return res['rows'][0]['target']
    } catch (e) {
        throw e
    }   
}


async function getProfileLinks(){
    try{
        const queryText = 'select d_id, y_profile from biz.dentists where raw_addr is null order by d_id';
        var res = await db.query(queryText);
        //console.log(res['rows'])
        return res['rows']
    } catch (e) {
        throw e
    }   
}


async function saveFullAddr(_d_id, _addrPayload){
    try{
        await db.query('BEGIN');
        const queryText = 'update biz.dentists set raw_addr = $1, raw_location = $2 \
                           where d_id=$3';
        await db.query(queryText, [_addrPayload[0], _addrPayload[1], _d_id]);
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}


async function getIncompleteURLs(){
/* Before using this function, run the following SQL code block to gather urls needing redo:
insert into biz.dentists_redo(url) select distinct src from biz.dentists where raw_st_addr is null and raw_biz is not null order by src;
*/
    try{
        const queryText = 'select array(select url from biz.dentists_redo where u_status is null order by url) as url';
        var res = await db.query(queryText);
        return res['rows'][0]['url']
    } catch (e) {
        throw e
    }   
}


// =================== STEP 1: INITIAL SCRAPE ===================

var target = {};
/*
(async () => {
    // prep chronium 
    let browser = await puppeteerExtra.launch({headless: true});
    let page = await browser.newPage();
    await preparePageForTests(page);
    
    // pull initial target from db
    var _target = await getTargetCity(); 

    while (_target){

    target['city'] =  _target[0];
    target['state'] = _target[1];
    target['county'] = _target[2];

    console.log(`========= SCRAPING city: ${target['city']}, state ${target['state']}, county ${target['county']}==============`);
    var url = `https://www.yelp.com/search?find_desc=Dentists&find_loc=${target['city']}%2C+${target['state']}`

    var p = await scrape(url, page)
    var bizData = p[1];
    var totalPages = p[0];

    for(let i=0; i<bizData.length; i=i+1){
        console.log(`profile ${bizData[i]['profile']}`)
        await saveBiz(bizData[i], target, url)
        console.log(`Saved ${bizData[i]['name']} to db`)
    }
    await updateMetaStatus(1, totalPages, target);

    for(let j=2; j<=totalPages; j=j+1){
        url = `https://www.yelp.com/search?find_desc=Dentists&find_loc=${target['city']}%2C+${target['state']}&start=${(j-1)*10}`
        p = await scrape(url, page)
        if (p == -1){ // no results detected
            continue 
        } 
        else if (p.length == 2) {
            bizData = p[1];    
            for(let k=0; k<bizData.length; k=k+1){
                await saveBiz(bizData[k], target, url)
                console.log(`Saved ${bizData[k]['name']} to db`)
            }
            await updateMetaStatus(j, totalPages, target);
        }

    }
    // get next target 
    _target = await getTargetCity(); 
    }

    await browser.close();
})();
*/
// =================== STEP 2: GET FULL ADDRESSES ===================
// reset 786 -1 addresses 3/20/21 9 AM EST

(async () => {
    let browser = await puppeteerExtra.launch({headless: true});
    let page = await browser.newPage();
    // pull initial targets from db
    var _targetList = await getProfileLinks();  // list of objects with keys d_id, and y_profile
    var targetObj
    while(_targetList.length > 0){
        targetObj = _targetList.pop();
        var addrPayload = await scrapeAddress(targetObj['y_profile'], page);
        await saveFullAddr(targetObj['d_id'], addrPayload);
        console.log(`saved ${addrPayload[0]} ${addrPayload[1]} --> d_id: ${targetObj['d_id']}`)
    }

    await browser.close();
})();



// =================== STEP X: GET MISSING ADDRESSES ===================
/*
// 2163 missing addresses 
 select distinct count(src) from biz.dentists where raw_st_addr is null and raw_biz is not null; 
 select array(select distinct src from biz.dentists where raw_st_addr is null and raw_biz is not null order by src); 

select raw_biz, 
--raw_st_addr, 
--raw_phone, specialty, 
-- y_stars, y_reviews,
src, last_update from biz.dentists 
where raw_st_addr is null and raw_biz is not null order by raw_biz, src;


select distinct city, county, state from biz.dentists where raw_st_addr is null and raw_biz is not null; 
*/
/*

(async () => {
    // prep chronium 
    let browser = await puppeteerExtra.launch({headless: true});
    let page = await browser.newPage();
    await preparePageForTests(page);
    
    // pull urls where address is missing from db
    var URLs = await getIncompleteURLs(); 
    var target_regex = /find_loc=(.*)%2C\+([A-Z]{2,2})/
    
    while (URLs.length > 0){
        var url = URLs.pop()
        console.log(`url: ${url}`)
        target['city'] =  target_regex.exec(url)[1];
        target['state'] = target_regex.exec(url)[2];
        var countyQueryText = 'select county from biz.dentists_meta where city ~* $1 and state_abbrev ~* $2;';
        target['county'] = db.query(countyQueryText, [ target['city'], target['state'] ]);

        var p = await scrape(url, page)
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