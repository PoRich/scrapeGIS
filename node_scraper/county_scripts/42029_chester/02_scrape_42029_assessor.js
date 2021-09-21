//  node county_scripts/42029_chester/02_scrape_42029_assessor.js 0
const fetch = require('node-fetch');
const puppeteer = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
require('dotenv').config();
const db = require('../../db');
const ScrapeTools = require('../../modules/scrapeTools.js');
puppeteer.use(StealthPlugin());  


async function scrape_batch(re_pattern, _re_start, browser){
    var parcel_numbers = ['foobar']; // placeholder to start while loop 
    // let period_regex = new RegExp('\\.$'); // Some parcel numbers incorrectly end in a period
    
        while (parcel_numbers.length > 0) {
            await ScrapeTools.sleep(ScrapeTools.rand_num(1000,3000));
            var page = await browser.newPage();
            
            page = await ScrapeTools.preparePageForTests(page);
            page = await ScrapeTools.blockResources(page, ['font', 'media', 'image', 'other']);
            await page.exposeFunction('zipObject', ScrapeTools.zipObject); // required for getTableData function
        
            var parcel_num_query = await db.query('select array(select parcel_num from pcl_data.c42029_gis \
                where parcel_num ~* $1 AND parcel_num is not null except\
                select parcel_num from pcl_data.c42029_assessor);', [re_pattern]); 
            parcel_nums = parcel_num_query['rows'][0]['array'];
            
            if (parcel_nums?.length === 0){
                console.log(`completed all parcel_nums in regex pattern: ${re_pattern}`)
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
                    if (typeof parcel_number === 'undefined' || parcel_number === 'null' || parcel_number === null){
                        console.log(`invalid parcel_num ${parcel_num} skipping... `);
                        continue;
                    }

                    // console.log(`re_pattern: ${re_pattern} -> gispin ${gispin} -> parcel_number ${parcel_number}`);
                    var p = await scrape_assessor(parcel_number, page);
                    
                    if (p === -1){ // -1 is error for when API is blocked due to Over Limit 
                        console.log(`scrape_assessor error code ${p} -> Restarting Browswer (parcel_number: ${parcel_number})`);
                        await browser.close();
                        await ScrapeTools.sleep(ScrapeTools.rand_num(3000, 5000));
                        run(_re_start);
                        break;
                    } else if (p < -1){
                        console.log(`Warning: scrape_assessor error code ${p} -> (parcel_number: ${parcel_number})`);
                    } else {
                        // save payload 
                        var r = await db.query(`INSERT INTO pcl_data.c42029_assessor(parcel_num, sale_history) VALUES \
                            ($1, $2::JSONB) ON CONFLICT (parcel_num) 
                            DO UPDATE set sale_history = EXCLUDED.sale_history
                            RETURNING parcel_num`, [parcel_number, p]);
                        
                        // console.log(`${parcel_number} Payload - ${JSON.stringify(p)}`);     
                        console.log(`${ScrapeTools.getDateTime()} - Saved payload ${p?.parcel !== null} - Parcel Number: ${JSON.stringify(r['rows'][0]['parcel_num'], null, '\t')}`)
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
    var url = `https://arcweb.chesco.org/LR_INFO/lr_info.aspx?PARID=${pcl_num}`;
    
    // console.log(`Open url: ${url}`);
    try{
        await page.goto(url,  {waitUntil: 'load', timeout: 360000})
        // console.log(`page loaded`);

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
            function getSaleHistory(css_id){
                var _table = document.getElementById(css_id) 
                if (_table === null){
                    return null;
                }
                  var _keys = Array.from(_table.querySelectorAll('th')).map((e, idx)=> {return idx + '-' +e.innerText});
                  var _vals = Array.from(_table.querySelectorAll('td')).map(e => /^[\s|-]*$/.test(e.innerText) ? null : e.innerText);
                  return zipObject(_keys, _vals);
            } 

            return {
                owner_history: await getSaleHistory('gvWCdata')
                }
            }); 
        _p['source'] = url;

        return _p;
    } catch(e){
        // await page.screenshot({path: `./screenshots/42029_${ScrapeTools.getDateTime()}_${pcl_num}_request_err.png`, fullPage: true});
        console.log(`scrape_assessor failed to scrape page on parcel number : ${pcl_num} | error_message: ${e}`)
        return -2;
    }
}



// =================== RUN FUNCTION =================== 
// scrapes parcel numbers that match the re_pattern (to allow multi-threading)
async function run(_re_start, ){    
    var concurrent_tabs = 10;
    const upper_limit = _re_start + concurrent_tabs;
    // Start browser, prep use-agent 
    console.log(`Launching browser with regex start: ${_re_start}`);
    const browser = await puppeteer.launch({ headless: true, slowMo: 0 }); 
    for (i=_re_start; i<(upper_limit); i++){ // run 10 tabs/pages at once 
        let _re_string = i < 10 ? `^0${i}` : `^${i}`; // number -> string (add leading zero if < 10)
        scrape_batch(_re_string, _re_start, browser)
    }
};

// =================== Create Table (Run Once)=================== 
// db.query('Alter table pcl_data.c42029_gis add column sale_history JSONB;')
// input is the argument given in the command line
// DONE 0, 10 
run(process.argv[2] ? parseInt(process.argv[2]) : 0); // increment this by 10 for each run of the script 




/**
SANDBOX - node ============================================================================================================

(async () => {
    const mapin = '05-03-348:000' // '08-03-706:000' // '06-04-019:000' '09-18-048:000' //  
    const r = await gisPinToPin(mapin); 
    console.log(`pin ${r}`);    
})();
*/

//  ============================================================================================================
