// This is the main Node.js source code file of your actor.

// Import Apify SDK. For more information, see https://sdk.apify.com/
const Apify = require('apify');
const db = require('../../../db');
require('dotenv').config();
const ScrapeTools = require('../../../modules/scrapeTools.js');


Apify.main(async () => {
    // Launch browser 
    const browser = await Apify.launchPuppeteer();

    // Create and navigate to new page 
    console.log('Open target page');
    const page = await browser.newPage();
    await page.goto('http://www.buckscountyboa.org/search/commonsearch.aspx?mode=parid')
    // agree to disclaimer
    await Promise.all([page.waitForNavigation(), page.click('#btAgree')]);
    // Fill form field
    console.log('Fill in search form');
    await page.type('#inpParid', '01-00')

    // Submit the form and wait for full load of next page
    console.log('Submit search form');
    await Promise.all([page.waitForNavigation(), page.click('#btSearch')]);
    await page.screenshot({ path: './screenshots/bucks-apify1.png', fullPage: true })
    
    await Promise.all([page.waitForNavigation(), page.click('.SearchResults')]);
    var url = await page.url();
    console.log(`Selected first search result: ${url}`);
    await page.screenshot({ path: './screenshots/bucks-apify2.png', fullPage: true })

    var resi_url = url.replace(/\/Datalet.aspx?/ig, '/Datalet.aspx?mode=residential&');
    console.log(`Navigate to Residential: ${resi_url}`);
    await page.goto(resi_url)
    await page.screenshot({ path: './screenshots/bucks-apify-resi.png', fullPage: true })

    var cre_url = url.replace(/\/Datalet.aspx?/ig, '/Datalet.aspx?mode=commercial&');
    console.log(`Navigate to Commercial: ${resi_url}`);
    await page.goto(resi_url)
    await page.screenshot({ path: './screenshots/bucks-apify-cre.png', fullPage: true })

    var sales_url = url.replace(/\/Datalet.aspx?/ig, '/Datalet.aspx?mode=sales&');
    console.log(`Navigate to Sales: ${sales_url}`);
    await page.goto(sales_url)
    await page.screenshot({ path: './screenshots/bucks-apify-sales.png', fullPage: true })

    console.log('Select second search result');
    await Promise.all([page.waitForNavigation(), page.click('#DTLNavigator_imageNext')]);
    await page.screenshot({ path: './screenshots/bucks-apify3.png', fullPage: true })
});

// http://www.buckscountyboa.org/Datalets/Datalet.aspx?sIndex=0&idx=1
// http://www.buckscountyboa.org/datalets/datalet.aspx?mode=residential&sIndex=8&idx=1&LMparent=20
// http://www.buckscountyboa.org/datalets/datalet.aspx?mode=commercial&sIndex=8&idx=1&LMparent=20
// http://www.buckscountyboa.org/datalets/datalet.aspx?mode=sales&sIndex=8&idx=1&LMparent=20