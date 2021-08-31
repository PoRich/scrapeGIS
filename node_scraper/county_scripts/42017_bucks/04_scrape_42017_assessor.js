/** based on https://sdk.apify.com/docs/examples/forms
 *  run from node_scraper folder 
 *  $ brew services start tor
 *  $ tor
 *  $ node county_scripts/42017_bucks/04_scrape_42017_assessor.js
 *  $ brew services stop tor
 */

//const puppeteer = require('puppeteer'); 
const puppeteer = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')

const colors = require('colors/safe');
require('dotenv').config();
const db = require('../../db');
const ScrapeTools = require('../../modules/scrapeTools.js');
const { prepPage } = require('../../modules/scrapeTools.js');

/**
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
 */


// =================== RUN FUNCTION =================== 
// scrapes parcel numbers that match the re_pattern (to allow multi-threading)
async function run(re_pattern){
    var parcel_numbers = ['foobar'];
    while (parcel_numbers.length > 0) {
        // Get all parcel numbers in Bucks County
        var parcel_num_query = await db.query('select array(select parcel_num from pcl_data.c42107_gis except select parcel_num from pcl_data.c42107_assessor as a);'); 
        parcel_numbers = parcel_num_query['rows'][0]['array'];
        
        parcel_numbers = parcel_numbers.filter(x => re_pattern.test(x)) // match regex pattern
        // console.log(`parcel_numbers ${JSON.stringify(parcel_numbers)}`);

        // Start browser, prep use-agent 
            //const args = ['--proxy-server=socks5://127.0.0.1:9050'];
        const args = ['--headless=true'];
        await ScrapeTools.sleep(ScrapeTools.rand_num(700,1000));
        // console.log(`Launching browser | parcel_numbers length ${parcel_numbers.length}...`);
        console.log(`Launching browser ${re_pattern} | parcel_numbers length ${parcel_numbers.length}...`);
        const browser = await puppeteer.launch({ args });
        let [page] = await browser.pages();
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
        page = await ScrapeTools.preparePageForTests(page);
        page = await ScrapeTools.blockResources(page, ['font', 'media', 'image', 'other']);
        await page.exposeFunction('zipObject', ScrapeTools.zipObject); // required for getTableData function
        
        var blockedRequest = false;
        while (blockedRequest === false) {
            
            let parcel_number = parcel_numbers.pop();
            var p = await scrape_bucks_assessor(parcel_number, page);

            var r = await db.query(`INSERT INTO pcl_data.c42107_assessor(parcel_num, raw_data) \
                VALUES ($1, $2::JSONB) ON CONFLICT (parcel_num) 
                DO UPDATE set raw_data = EXCLUDED.raw_data
                RETURNING parcel_num`, [parcel_number, p]);

            if (p['parcel'] === null){
                console.log(`Request Blocked on Parcel Number ${parcel_number}. Payload is null, restarting browser... `);
                let currentTime = ScrapeTools.getDateTime();
                await page.screenshot({path: `./screenshots/bucks_${currentTime}_${parcel_number}_null.png`, fullPage: true});
                blockedRequest = true
                await browser.close();
                break;
            }
            else {
                // console.log(`${parcel_number} Payload - ${JSON.stringify(p)}`);
                console.log(`Saved Bucks County: ${p['parcel'] !== null} - Parcel Number: ${JSON.stringify(r['rows'][0]['parcel_num'], null, '\t')}`)
                await ScrapeTools.sleep(ScrapeTools.rand_num(100,1000));
            }
        }
    }    
};

async function scrape_bucks_assessor(pcl_num, page){
    // Create and navigate to new page 
    // console.log(`Open target page for parcel_number: ${pcl_num}`);
    var url = `http://www.buckscountyboa.org/Datalets/PrintDatalet.aspx?pin=${pcl_num}&gsp=PROFILEALL&taxyear=2021&jur=009&ownseq=0&card=1&roll=REAL&State=1&item=1&items=-1&all=all&ranks=Datalet`;
    try{
        await page.goto(url,  {waitUntil: 'load', timeout: 30000})

        const _p = await page.evaluate(async () => {
            // Function needs to be defined here because it needs access to the DOM (document)
            function getTableData(css_id, cssHeader='DataletSideHeading', cssData='DataletData'){
                var _table = document.getElementById(css_id)
                if (_table === null){
                    return null;
                } // empty keys need to be idx
                var _keys = Array.from(_table.getElementsByClassName(cssHeader))
                    .map((e, idx)=> {return /^\s*$/.test(e.innerText) ? idx : e.innerText});
                var _vals = Array.from(_table.getElementsByClassName(cssData)).map(e => /^[\s|-]*$/.test(e.innerText) ? null : e.innerText);

                //return Object.filter(zipObject(_keys, _vals), val => val !== null);
                return zipObject(_keys, _vals);
            }

            return {
                parcel: await getTableData('Parcel'),
                owner: await getTableData('Current Owner Details'), 
                land: await getTableData('Land'), 
                assessment: await getTableData('Values'),
                sales: await getTableData('Sales', 'DataletTopHeading'), 
                saleDetail: await getTableData('Sale Details'), 
                tax: await getTableData('Estimated Tax Information'),
                // RESIDENTIAL FEATURES
                homestead: await getTableData('Homestead', 'DataletTopHeading'),
                residential: await getTableData('Residential'), 
                // COMMERCIAL FEATURES 
                commercial: await getTableData('Commercial', 'DataletTopHeading'), 
                intExtDetails: await getTableData('Interior/Exterior Details'), 
                otherFeatures: await getTableData('Summary of All Other Features'),
                // REDUNDANT / IRRELEVANT FEATURES 
                mailing: await getTableData('Parcel Mailing Details'),  // included in owner
                ownerHistory: await getTableData('Owner History', 'DataletTopHeading'), // included in sales
                legal: await getTableData('Legal Description'),  // not useful 
                assessmentHistory: await getTableData('Assessment History', 'DataletTopHeading'), // not useful 
                exemptions: await getTableData('Exemptions', 'DataletTopHeading'), // not useful 
                additions: await getTableData('Additions', 'DataletTopHeading'),
                oby: await getTableData('OBY', 'DataletTopHeading'),
                obyDetails: await getTableData('OBY Details')
                }
            }); 
        _p['source'] = url;
        return _p;
    } catch(e){
        let currentTime = ScrapeTools.getDateTime();
        await page.screenshot({path: `./screenshots/bucks_${currentTime}_${parcel_number}_request_err.png`, fullPage: true});
        console.log(`error scraping page ${e}`)
    }
}

// Call function multiple times with different regexp patterns 
var re_start = 20 // increment this by 10 for each run of the script 
for (i=re_start; i<(re_start+10); i++){ // run 10 threads at once 
    let _re_string = i < 10 ? `0${i}` : `${i}`; // number -> string (add leading zero if < 10)
    let re = new RegExp('^'+ _re_string, 'i'); // string -> regex pattern
    run(re); // function call 
}
