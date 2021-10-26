// const puppeteer = require('puppeteer'); 
const puppeteer = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
// const colors = require('colors/safe');
require('dotenv').config();
const db = require('../../db');
const ScrapeTools = require('../../modules/scrapeTools.js');

/* second command line argument is the regexp pattern to start with (e.g. all parcel_num starting in 60)
* # https://github.com/Unitech/pm2
 *  run from node_scraper folder 
 *  $ brew services start tor
 *  $ tor
 *  $ node county_scripts/42091_montgomery/03_scrape_42091_assessor.js 0
 *  $ pm2 start county_scripts/42091_montgomery/03_scrape_42091_assessor.js -- 60 
 *  $ pm2 logs 03_scrape_42091_assessor [--lines 1000]
 *  $ pm2 stop 0
 *  $ brew services stop tor
 */

puppeteer.use(StealthPlugin());  
puppeteer.use(
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

/*  
// SQL code to remove invalid records 
// (Need to redo records that are blocked for overlimit; 
// some parcels may ligitimately be N/A where they exist in the GIS database, but not the assessors database)

    DELETE FROM pcl_data.c42091_assessor
    WHERE raw_data #>> '{parcel}' IS NULL;
    
*/

// https://stackoverflow.com/questions/4351521/how-do-i-pass-command-line-arguments-to-a-node-js-program
// DONE 0, 10, 20, 30, 40, 50 
var re_start = process.argv[2] ? parseInt(process.argv[2]) : 0; // increment this by 10 for each run of the script 
var increment = 10;
// =================== RUN FUNCTION =================== 
// scrapes parcel numbers that match the re_pattern (to allow multi-threading)
async function run(_re_start){
    
    // Start browser, prep use-agent 
    //const args = ['--proxy-server=socks5://127.0.0.1:9050'];
    console.log(`Launching browser with regex start: ${_re_start}`);
    const browser = await puppeteer.launch({ headless: true, slowMo: 0 }); 
    // let [page] = await browser.pages(); //use existing tab 
        
        /**
        // check if Tor is running 
        await page.goto('https://check.torproject.org/');
        const isUsingTor = await page.$eval('body', el =>
            el.innerHTML.includes('Congratulations. This browser is configured to use Tor')
        );

        if (!isUsingTor){
            console.log(colors.red.bold('Not using Tor. Closing... '));
            return await browser.close();
        }
        console.log(colors.green.bold('Using Tor. Contuing... '))
        */
       
    // Launch multiple tabs each assigned a batch of parcel_numbers (based on regexp patterns) 
    for (i=_re_start; i<(_re_start+increment); i++){ // run 10 tabs/pages at once 
        let _re_string = i < 10 ? `^0${i}` : `^${i}`; // number -> string (add leading zero if < 10)
        // let re = new RegExp('^'+ _re_string, 'i'); // string -> regex pattern
        scrape_batch(_re_string, re_start, browser)
    }
    // close browser when all processes are finished 
    // browser.close();
};

async function scrape_batch(re_pattern, _re_start, browser){
    var parcel_numbers = ['foobar']; // placeholder to start while loop 
    // let period_regex = new RegExp('\\.$'); // Some parcel numbers incorrectly end in a period
    
        while (parcel_numbers.length > 0) {
            await ScrapeTools.sleep(ScrapeTools.rand_num(1000,3000));
            var page = await browser.newPage();
            
            page = await ScrapeTools.preparePageForTests(page);
            page = await ScrapeTools.blockResources(page, ['font', 'media', 'image', 'other']);
            await page.exposeFunction('zipObject', ScrapeTools.zipObject); // required for getTableData function
        
            // Get all parcel numbers in Bucks County, filter based on assigned regex pattern
            
            var parcel_num_query = await db.query('select array(select taxpin from pcl_data.c42091_gis where taxpin is not null \
                and taxpin ~* $1 except select parcel_num from pcl_data.c42091_assessor as a);', [re_pattern]); 

            
            parcel_numbers = parcel_num_query['rows'][0]['array'];
            // Filter parcel numbers (when multithreading)
            // parcel_numbers = parcel_numbers.filter(x => re_pattern.test(x)) // match regex pattern
            console.log(`Launching new browser tab ${re_pattern} | parcel_numbers length ${parcel_numbers.length}...`);    

            if (parcel_numbers.length === 0){
                console.log(`completed all parcel numbers in regex pattern: ${re_pattern}`)
                await page.close();
                return 0;
            }

            while (true){ // break statement in catch error logic; 
                try{
                    let parcel_number = parcel_numbers.pop();
                    var p = await scrape_42091_assessor(parcel_number, page);
                    
                    if (p === -1){ // -1 is error for when API is blocked due to Over Limit 
                        await browser.close();
                        await ScrapeTools.sleep(ScrapeTools.rand_num(3000, 5000));
                        run(_re_start);
                        break;
                    }

                    // save payload 
                    var r = await db.query(`INSERT INTO pcl_data.c42091_assessor(parcel_num, raw_data) \
                        VALUES ($1, $2::JSONB) ON CONFLICT (parcel_num) 
                        DO UPDATE set raw_data = EXCLUDED.raw_data
                        RETURNING parcel_num`, [parcel_number, p]);

                    if (p === null ){
                        console.log(`ERROR Scraping page. BREAKING LOOP... `);
                        break;
                    }
                    else if (p['parcel'] === null){ // if timeout error or some other error 
                        console.log(`ERROR scraping parcel number ${parcel_number}. Payload is null... `);
                        // await page.screenshot({path: `./screenshots/bucks_${ScrapeTools.getDateTime()}_${parcel_number}_null.png`, fullPage: true});
                    }
                    
                    // console.log(`${parcel_number} Payload - ${JSON.stringify(p)}`);     
                    console.log(`${ScrapeTools.getDateTime()} - Saved: ${p['parcel'] !== null} - Parcel Number: ${JSON.stringify(r['rows'][0]['parcel_num'], null, '\t')}`)
                    await ScrapeTools.sleep(ScrapeTools.rand_num(100,1000));
                } catch (e){
                    console.log(`scrape_batch error (browser probably closed) | error message: ${e}`)
                    break;
                }
            }
        }
        return 0; // successfully processed all parcel_numbers

}

async function scrape_42091_assessor(pcl_num, page){
    // Create and navigate to new page 
    // console.log(`Open target page for parcel_number: ${pcl_num}`);
    var url = `https://propertyrecords.montcopa.org/PT/Datalets/PrintDatalet.aspx?pin=${pcl_num}&gsp=PROFILEALL&taxyear=2021&jur=046&ownseq=0&card=1&roll=REAL&State=1&item=1&items=-1&all=all&ranks=Datalet`
    
    // console.log(`Open url: ${url}`);
    try{
        await page.goto(url,  {waitUntil: 'load', timeout: 30000})
        // console.log(`page loaded`);

        const actual_url = await page.url();
        // console.log(`actual_url ${actual_url}`);

        if (actual_url.includes('OverLimit.aspx')){
            console.log(`************************ API blocked on parcel number ${pcl_num} overlimit, restarting browser ************************`)
            return -1; 
        }
        // console.log(`Not overlimit...`)

        const _p = await page.evaluate(async () => {
            // Function needs to be defined here because it needs access to the DOM (document)
            function getTableData(css_id, cssHeader='DataletSideHeading', cssData='DataletData'){
                console.log(`processing css_id ${css_id}`);
                var _table = document.getElementById(css_id)
                if (_table === null){
                    return null;
                } // empty keys need to be idx
                var _keys = Array.from(_table.getElementsByClassName(cssHeader))
                    .map((e, idx)=> {return idx + '-' +e.innerText});
                var _vals = Array.from(_table.getElementsByClassName(cssData)).map(e => /^[\s|-]*$/.test(e.innerText) ? null : e.innerText);

                //return Object.filter(zipObject(_keys, _vals), val => val !== null);
                return zipObject(_keys, _vals);
            } 

            return {
                parcel: await getTableData('Parcel'),
                owner: await getTableData('Owner'),
                assessment: await getTableData('Current Assessment', 'DataletTopHeading'),
                tax: await getTableData('Estimated Taxes'), 
                saleDetail: await getTableData('Last Sale'),
                sales: await getTableData('Sales History', 'DataletTopHeading'),
                lot: await getTableData('Lot Information'),
                permits: await getTableData('Permits'),
                // RESIDENTIAL FEATURES
                residential: await getTableData('Residential Card Summary'), //
                // COMMERCIAL FEATURES 
                commercial: await getTableData('Commercial Parcel Summary'), // within div id = datalet_div_0
                // com_use: await getTableData('Commercial Parcel Summary'), // within div id = datalet_div_1
                com_card: await getTableData('Commercial Card Summary'), 
                assessmentHistory: await getTableData('Assessment History', 'DataletTopHeading'), 
                accessoryStructures: await getTableData('Accessory Structures', 'DataletTopHeading'), 
                
                }
            }); 
        _p['source'] = url;

        return _p;
    } catch(e){
        try{
            await page.screenshot({path: `./screenshots/42091_${ScrapeTools.getDateTime()}_${pcl_num}_request_err.png`, fullPage: true});
            console.log(`scrape_42091_assessor failed to scrape page on parcel number : ${pcl_num} | error_message: ${e}`)
            return null;
        } catch(e){
            console.log(`Unable to capture screenshot on parcel number : ${pcl_num} | error message: ${e}`) 
            return null;
        }
    }
}

run(re_start);

/**
 * note duplicates in pcl_data.c42091_gis:
 * select taxpin, count(taxpin) from pcl_data.c42091_gis group by taxpin having count(taxpin)>1 order by taxpin;
 * 
 */