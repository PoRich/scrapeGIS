//  node county_scripts/42045_delaware/03_scrape_42045_assessor.js '01-01-'
const fetch = require('node-fetch');
const puppeteer = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
require('dotenv').config();
const db = require('../../db');
const ScrapeTools = require('../../modules/scrapeTools.js');
puppeteer.use(StealthPlugin());  

// Use Delco API to convert gisPin to pin
async function gisPinToPin(gisPin){
    const _body = `<?xml version='1.0' encoding='utf-8'?><soap:Envelope xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance '  xmlns:xsd='http://www.w3.org/2001/XMLSchema'  xmlns:soap='http://schemas.xmlsoap.org/soap/envelope/'><soap:Body><GetPinFromGISPin xmlns='http://tempuri.org/'><gisPin>${gisPin}</gisPin></GetPinFromGISPin></soap:Body></soap:Envelope>`;
    // console.log(`body ${_body}`);
  
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
  
    // console.log(`response ${JSON.stringify(r)}`);
    const regex_pattern = /<GetPinFromGISPinResult>\d{3}:(\d+):2021<\/GetPinFromGISPinResult>/
    // console.log(`pin ${r.body._outBuffer.toString().match(regex_pattern)[1]}`);
    const match = r.body._outBuffer.toString().match(regex_pattern);
    const pin = match.length >= 2 ? match[1] : null;
    if (pin===null) {console.log(`gisPinToPin Error: ${gisPin} returned no match on response: ${r.body._outBuffer.toString()}`)}
    return pin;
  }

// =================== Create Table (Run Once)=================== 
// db.query('Create Table pcl_data.c42045_assessor (gispin TEXT, parcel_num TEXT UNIQUE, raw_data JSONB);')

// re_start is the regexp pattern to apply to the identifier 
// 02-22-283:000
var re_start = process.argv[2] ? process.argv[2] : 0; // increment this by 10 for each run of the script 
var concurrent_tabs = 1;
// =================== RUN FUNCTION =================== 
// scrapes parcel numbers that match the re_pattern (to allow multi-threading)
async function run(_re_start){    
    // Start browser, prep use-agent 
    //const args = ['--proxy-server=socks5://127.0.0.1:9050'];
    console.log(`Launching browser with regex start: ${_re_start}`);
    const browser = await puppeteer.launch({ headless: true, slowMo: 0 }); 
    // let [page] = await browser.pages(); //use existing tab 
        
    scrape_batch(re_start, re_start, browser)
    /*
    // Launch multiple tabs each assigned a batch of parcel_numbers (based on regexp patterns) 
    for (i=0; i<(_re_start+concurrent_tabs); i++){ // run 10 tabs/pages at once 
        // let _re_string = i < 10 ? `^0${i}` : `^${i}`; // number -> string (add leading zero if < 10)
        _re_string = re_start;
        // let re = new RegExp('^'+ _re_string, 'i'); // string -> regex pattern
        scrape_batch(_re_string, re_start, browser)
    }
    */
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
        
            var gispin_query = await db.query('select array(select pin from pcl_data.c42045_gis where pin is not null \
                and pin ~* $1 except select gispin from pcl_data.c42045_assessor as a);', [re_pattern]); 
            
            gispins = gispin_query['rows'][0]['array'];
            // Filter parcel numbers (when multithreading)
            // parcel_numbers = parcel_numbers.filter(x => re_pattern.test(x)) // match regex pattern
            console.log(`Launching new browser tab ${re_pattern} | gispins length ${gispins.length}...`);    

            if (gispins.length === 0){
                console.log(`completed all gispins in regex pattern: ${re_pattern}`)
                await page.close();
                return 0;
            }

            while (true){ // break statement in catch error logic; 
                try{

                    let gispin = gispins.pop();
                    let parcel_number = await gisPinToPin(gispin);
                    // console.log(`re_pattern: ${re_pattern} -> gispin ${gispin} -> parcel_number ${parcel_number}`);
                    var p = await scrape_assessor(parcel_number, page);
                    
                    if (p === -1){ // -1 is error for when API is blocked due to Over Limit 
                        await browser.close();
                        await ScrapeTools.sleep(ScrapeTools.rand_num(3000, 5000));
                        run(_re_start);
                        break;
                    }

                    // save payload 
                    var r = await db.query(`INSERT INTO pcl_data.c42045_assessor(gispin, parcel_num, raw_data) \
                        VALUES ($1, $2, $3::JSONB) ON CONFLICT (parcel_num) 
                        DO UPDATE set raw_data = EXCLUDED.raw_data
                        RETURNING parcel_num`, [gispin, parcel_number, p]);

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

async function scrape_assessor(pcl_num, page){
    // Create and navigate to new page 
    // console.log(`Open target page for parcel_number: ${pcl_num}`);
    var url = `http://delcorealestate.co.delaware.pa.us/PT/Datalets/PrintDatalet.aspx?pin=${pcl_num}&gsp=PROFILEALL_PUB&taxyear=2021&jur=023&ownseq=0&card=1&roll=REAL&State=1&item=1&items=-1&all=all&ranks=Datalet`;
    
    console.log(`Open url: ${url}`);
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

                var _table = document.getElementById(css_id)
                if (_table === null){
                    return null;
                } // empty keys need to be idx
                if (_table.getElementsByClassName(cssHeader).length > 0){
                  var _keys = Array.from(_table.getElementsByClassName(cssHeader))
                    .map((e, idx)=> {return idx + '-' +e.innerText});
                  var _vals = Array.from(_table.getElementsByClassName(cssData)).map(e => /^[\s|-]*$/.test(e.innerText) ? null : e.innerText);

                  //return Object.filter(zipObject(_keys, _vals), val => val !== null);
                  return zipObject(_keys, _vals);
                } else {
                  return null;
                }
                
            } 

            return {
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
            }); 
        _p['source'] = url;

        return _p;
    } catch(e){
        try{
            await page.screenshot({path: `./screenshots/42045_${ScrapeTools.getDateTime()}_${pcl_num}_request_err.png`, fullPage: true});
            console.log(`scrape_assessor failed to scrape page on parcel number : ${pcl_num} | error_message: ${e}`)
            return null;
        } catch(e){
            console.log(`Unable to capture screenshot on parcel number : ${pcl_num} | error message: ${e}`) 
            return null;
        }
    }
}

run(re_start);


/**
 * select parcel_num, gispin, raw_data #>> '{parcel, 0, 4-Map Number:}' map_pin from pcl_data.c42045_assessor; 
 * select parcel_num, jsonb_pretty(raw_data) from pcl_data.c42045_assessor;
 * 
 */