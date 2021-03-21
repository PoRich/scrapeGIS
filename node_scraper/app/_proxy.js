const puppeteerExtra = require('puppeteer-extra')  // Any number of plugins can be added through `puppeteer.use()`
require('dotenv').config();

(async () =>{
    let browser = await puppeteerExtra.launch({
        headless: false
    });
    let page = await browser.newPage();

    // =================== PART 1: get site map ===================
    let targetURL = 'http://icanhazip.com/';
    let ultimateURL = `http://api.scraperapi.com/?api_key=${process.env.SCRAPERAPI}&url=${targetURL}&country_code=us`
    
    // check scraperapi proxy account
    // curl "http://api.scraperapi.com/account?api_key=5fa9ed494209abb506dd2ccf7a61d4e2"
    
    try { 
        await page.goto(ultimateURL, { waitUntil: 'load', timeout: 9000} );
        console.log(`opened the page ${ultimateURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${ultimateURL} with error: ${error}`);
    }
    await page.screenshot({ path: 'response.png'})

    await browser.close();
    process.exit()
})();