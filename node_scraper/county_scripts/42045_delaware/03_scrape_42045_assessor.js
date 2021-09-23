//  node county_scripts/42045_delaware/03_scrape_42045_assessor.js 1 # increment in 10s
//  node county_scripts/42045_delaware/03_scrape_42045_assessor.js 10 # increment in 10s

const fetch = require('node-fetch');
const puppeteer = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
require('dotenv').config();
const db = require('../../db');
const ScrapeTools = require('../../modules/scrapeTools.js');
puppeteer.use(StealthPlugin());  

// Use Delco API to convert gisPin to pin
async function gisPinToPin(gisPin, maxTries = 5){
    var attempt = 1  // multiple attempts may be needed; API response is not reliable
    try{
        while (attempt <= maxTries){
            const _body = `<?xml version='1.0' encoding='utf-8'?><soap:Envelope xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance '  xmlns:xsd='http://www.w3.org/2001/XMLSchema'  xmlns:soap='http://schemas.xmlsoap.org/soap/envelope/'><soap:Body><GetPinFromGISPin xmlns='http://tempuri.org/'><gisPin>${gisPin}</gisPin></GetPinFromGISPin></soap:Body></soap:Envelope>`;
            const r = await fetch("http://delcorealestate.co.delaware.pa.us/pt/Search/Services/SearchServices.asmx", {
                "credentials": "include",
                "headers": {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:92.0) Gecko/20100101 Firefox/92.0",
                    "Accept": "*/*",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Content-Type": "text/xml;charset=UTF-8",
                    "SOAPAction": "http://tempuri.org/GetPinFromGISPin",
                    "Sec-GPC": "1"
                },
                "referrer": "http://delcorealestate.co.delaware.pa.us/pt/maps/mapadv.aspx",
                "body": _body,
                "method": "POST",
                "mode": "cors"
            });

            // const charsetMatch = detectCharacterEncoding(r.body._outBuffer);
            // console.log(`charsetMatch ${JSON.stringify(charsetMatch)}`); 
            const decodedBuffer = r.body._outBuffer.toString(); // 'UTF-16BE
            const regex_pattern = /<GetPinFromGISPinResult>\d{3}:(\d+):2021<\/GetPinFromGISPinResult>/
            
            const match = decodedBuffer.match(regex_pattern);
            const pin = match?.length >= 2 ? match[1] : null;
            if (pin !==null) {
                return pin;
            } 
            
            // console.log(`gisPinToPin Error: ${gisPin} returned no match on response`)
            await ScrapeTools.sleep(ScrapeTools.rand_num(100,1000));
            attempt+=1;
        }
        console.log(`gisPinToPin failed for pin ${gisPin} on max (${attempt}) attempts`)
        return null;
    } catch(e){
        console.log(`gisPinToPin error on gisPin ${gisPin}: ${e}`)
    }
  }


async function batch_process_parcel_nums(re_pattern){
    var gispin_query = await db.query('select array(select pin from pcl_data.c42045_gis where pin is not null \
        and pin ~* $1 and parcel_num is null);', [re_pattern]); 
    var gispins = gispin_query['rows'][0]['array'];
    
    // check valid response from db 
    if (gispins?.length === 0){
        console.log(`completed all gispins in regex pattern: ${re_pattern}`)

        return 0;
    } else if (gispins == null){
        console.log(`no in matches for regex pattern: ${re_pattern}`)

        return 0;
    }

    console.log(`starting batch_process_parcel_nums on re_pattern ${re_pattern} | ${gispins.length} entries`);
    while (gispins.length > 0) {
        var gispin = gispins.pop();
        var parcel_num = await gisPinToPin(gispin);
        var db_response = await db.query('UPDATE pcl_data.c42045_gis set parcel_num = $1 WHERE pin = $2 RETURNING pin', [parcel_num, gispin]);
        console.log(`saved pin ${gispin} -> parcel_num ${parcel_num}`);
    }
    console.log(`batch_process_parcel_nums COMPLETED JOB FOR re_patten`);
}



async function scrape_batch(re_pattern, _re_start, browser){
    var parcel_numbers = ['foobar']; // placeholder to start while loop 
    // let period_regex = new RegExp('\\.$'); // Some parcel numbers incorrectly end in a period
    
        while (parcel_numbers.length > 0) {
            await ScrapeTools.sleep(ScrapeTools.rand_num(1000,3000));
            var page = await browser.newPage();
            
            page.setJavaScriptEnabled(false) // disable javascript (open print dialogue window)

            page = await ScrapeTools.preparePageForTests(page);
            page = await ScrapeTools.blockResources(page, ['font', 'media', 'image', 'other']);
            await page.exposeFunction('zipObject', ScrapeTools.zipObject); // required for getTableData function
        
            var parcel_num_query = await db.query('select array(select parcel_num from pcl_data.c42045_gis where parcel_num is not null \
                and parcel_num ~* $1 except select parcel_num from pcl_data.c42045_assessor where raw_data is not null \
                and raw_data not in ($2, $3, $4));', [re_pattern, '-1', '-2', '-3']); 
            
            parcel_nums = parcel_num_query['rows'][0]['array'];
            
            if (parcel_nums?.length === 0){
                console.log(`completed all gispins in regex pattern: ${re_pattern}`)
                await page.close();
                return 0;
            } else if (parcel_nums == null){
                console.log(`no in matches for regex pattern: ${re_pattern}`)
                await page.close();
                return 0;
            }
            // Filter parcel numbers (when multithreading)
            // parcel_numbers = parcel_numbers.filter(x => re_pattern.test(x)) // match regex pattern
            console.log(`Launching new browser tab ${re_pattern} | parcel_nums length ${parcel_nums?.length}...`);    

            while (true){ // break statement in catch error logic; 
                try{
                    let parcel_number = parcel_nums.pop();
                    
                    if (typeof parcel_number === 'undefined'){
                        continue; 
                    }
                    
                    // console.log(`re_pattern: ${re_pattern} -> gispin ${gispin} -> parcel_number ${parcel_number}`);
                    var p = await scrape_assessor(parcel_number, page);
                    // console.log(`${parcel_number} Payload - ${JSON.stringify(p)}`);     

                    if (p === -1){ // -1 is error for when API is blocked due to Over Limit 
                        console.log(`scrape_assessor error code ${p} -> (parcel_number: ${parcel_number}). Restarting Browser`);
                        await browser.close();
                        await ScrapeTools.sleep(ScrapeTools.rand_num(3000, 5000));
                        run(_re_start, 'get_parcels');
                        break;
                    } else if (p === -2){
                        console.log(`Warning: scrape_assessor error code ${p} -> (parcel_number: ${parcel_number}). Closing Page`);
                    } else {
                        // save payload 
                        var r = await db.query(`INSERT INTO pcl_data.c42045_assessor(parcel_num, raw_data) \
                            VALUES ($1, $2::JSONB) ON CONFLICT (parcel_num) 
                            DO UPDATE set raw_data = EXCLUDED.raw_data
                            RETURNING parcel_num`, [parcel_number, p]);
                        
                        
                        console.log(`${ScrapeTools.getDateTime()} - Saved payload ${p?.parcel !== null && p?.parcel !== '-2' && p?.parcel !== '-3'} - Parcel Number: ${JSON.stringify(r['rows'][0]['parcel_num'], null, '\t')}`)
                    }
                    await ScrapeTools.sleep(ScrapeTools.rand_num(100,1000));
                } catch (e){
                    console.log(`Scrape_batch error -> Breaking Loop, Closing Page | error message: ${e}`)
                    await page.close();
                    break;
                }
            }
        }
        return 0; // successfully processed all parcel_numbers
}


async function scrape_assessor(pcl_num, page){
    // Create and navigate to new page 
    // console.log(`Open target page for parcel_number: ${pcl_num}`);
    var url = `http://delcorealestate.co.delaware.pa.us/PT/Datalets/PrintDatalet.aspx?pin=${pcl_num}&gsp=PROFILEALL_PUB&taxyear=2021&jur=023&ownseq=0&card=1&roll=REAL&State=1&item=1&items=-1&all=all&ranks=Datalet`;
    
    await page.setRequestInterception(true);

    // console.log(`Open url: ${url}`);
    try{
        await page.goto(url, {
            waitUntil: 'networkidle2', //'load', // 'networkidle0', // 'domcontentloaded', 
            timeout: 30000});
        // await page.reload({waitUntil: 'networkidle2',  timeout: 0});  //'load', // 'networkidle0', // 'domcontentloaded',
        // await page.waitFor(() => document.querySelectorAll('table[id="Parcel"], table[id="Owner"], table[id="Current Owner"], table[id="Owner History"], table[id="Original Current Year Assessment"]').length);
        // await page.waitForSelector('table[id="Original Current Year Assessment"]', {timeout: 0});
        
        // await page.keyboard.press('Escape'); // escape print dialogue screen to force page to stop loading 

        const actual_url = await page.url();
        // console.log(`actual_url ${actual_url}`);

        if (actual_url.includes('OverLimit.aspx')){
            console.log(`************************ API blocked on parcel number ${pcl_num} overlimit, restarting browser ************************`)
            console.log(actual_url)
            return -1; 
        }
        // console.log(`Not overlimit...`)

        const _p = await page.evaluate(async () => {
            // Function needs to be defined here because it needs access to the DOM (document)
            function getTableData(css_id, cssHeader='DataletSideHeading', cssData='DataletData'){

                var _table = document.getElementById(css_id)
                if (_table === null){
                    return null;
                } // empty keys need to be idx
                if (_table.getElementsByClassName(cssHeader)?.length > 0){
                  var _keys = Array.from(_table.getElementsByClassName(cssHeader))
                    .map((e, idx)=> {return idx + '-' +e.innerText});
                  var _vals = Array.from(_table.getElementsByClassName(cssData)).map(e => /^[\s|-]*$/.test(e.innerText) ? null : e.innerText);

                  //return Object.filter(zipObject(_keys, _vals), val => val !== null);
                  return zipObject(_keys, _vals);
                } else {
                  return null;
                }
            } 
            var payload = {
                parcel: await getTableData('Parcel'),
                owner: await getTableData('Owner'),
                current_owner: await getTableData('Current Owner'),
                mortgage: await getTableData('Mortgage Company'),
                owner_history: await getTableData('Owner History', 'DataletTopHeading'),
                assessment: await getTableData('Original Current Year Assessment', 'DataletTopHeading'),
                tax: await getTableData('County Tax Receivable', 'DataletTopHeading'), 
                delinquent_tax: await getTableData('Delinquent Tax'), 
                tax_sale: await getTableData('Tax Sale Information'), 
                // RESIDENTIAL FEATURES
                residential: await getTableData('Residential'), //
                // COMMERCIAL FEATURES 
                commercial: await getTableData('Commercial'), // within div id = datalet_div_0
                }
            return payload;
            }); 
        _p['source'] = url;

        return _p;
    } catch(e){
        console.log(`scrape_assessor (parcel number : ${pcl_num}) error_message: ${e}`)
        return -1;
        /*
        if (e instanceof puppeteer?.errors?.TimeoutError){
            // await page.screenshot({path: `./screenshots/42045_${ScrapeTools.getDateTime()}_${pcl_num}_request_err.png`, fullPage: true});
            console.log(`scrape_assessor TimeoutError on parcel number : ${pcl_num}`)
            return -1;
        } else {
            console.log(`scrape_assessor failed to scrape page on parcel number : ${pcl_num} `)
            return -2;
        }
        */
    }
}



// =================== RUN FUNCTION =================== 
// scrapes parcel numbers that match the re_pattern (to allow multi-threading)
async function run(_re_start, stage){    
    var concurrent_tabs = 10;
    const upper_limit = _re_start + concurrent_tabs;
    if (stage === 'get_parcels'){
        // Start browser, prep use-agent 
        console.log(`Launching browser with regex start: ${_re_start}`);
        const browser = await puppeteer.launch({ headless: true, slowMo: 0 }); 
        for (i=_re_start; i<(upper_limit); i++){ // run 10 tabs/pages at once 
            let _re_string = i < 10 ? `^0${i}` : `^${i}`; // number -> string (add leading zero if < 10)
            scrape_batch(_re_string, _re_start, browser)
        }
    } else if (stage === 'get_parcel_nums') {
        for (i=_re_start; i<(upper_limit); i++){ // run 10 tabs/pages at once 
            let _re_string = i < 10 ? `^0${i}` : `^${i}`; // number -> string (add leading zero if < 10)
            batch_process_parcel_nums(_re_string)
        }
    }    
};

// =================== Create Table (Run Once)=================== 
// db.query('Alter table pcl_data.c42045_gis add column parcel_num TEXT;')
// db.query('Create Table pcl_data.c42045_assessor (gispin TEXT, parcel_num TEXT UNIQUE, raw_data JSONB);')

// input is the argument given in the command line

// STEP 1 - Get parcel numbers from gispins 
// run(process.argv[2] ? parseInt(process.argv[2]) : 0, 'get_parcel_nums'); // increment this by 10 for each run of the script 

// STEP 2 - Get parcel data from parcel numbers
run(process.argv[2] ? parseInt(process.argv[2]) : 0, 'get_parcels'); // increment this by 10 for each run of the script 




/* SQL Query Reference
 * select parcel_num, gispin, raw_data #>> '{parcel, 0, 4-Map Number:}' map_pin from pcl_data.c42045_assessor; 
 * select parcel_num, jsonb_pretty(raw_data) from pcl_data.c42045_assessor;
 * 
 */


/**
SANDBOX - node ============================================================================================================

(async () => {
    const mapin = '05-03-348:000' // '08-03-706:000' // '06-04-019:000' '09-18-048:000' //  
    const r = await gisPinToPin(mapin); 
    console.log(`pin ${r}`);    
})();
*/

//  ============================================================================================================

/*
scrape_assessor failed to scrape page on parcel number : 02000170101 | error_message: TimeoutError: Navigation timeout of 360000 ms exceeded
Warning: scrape_assessor error code -2 -> (parcel_number: 02000170101)


scrape_assessor failed to scrape page on parcel number : 02000145103 | error_message: Error: Protocol error (Page.navigate): Session closed. Most likely the page has been closed.
Warning: scrape_assessor error code -2 -> (parcel_number: 02000145103)
*/