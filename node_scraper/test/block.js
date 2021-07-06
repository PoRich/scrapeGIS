const puppeteer = require('puppeteer-extra'); //require('puppeteer');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')  // Add adblocker plugin to block all ads and trackers (saves bandwidth)
const ScrapeTools = require('../modules/scrapeTools.js');

// puppeteer.use(StealthPlugin());
// puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(RecaptchaPlugin({
        provider:{
            id: '2captcha', 
            token: process.env.TWOCAPTCHA,  
        },
        visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    })
)


async function run() {
    let browser = await puppeteer.launch({ headless: false });
    let page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if(req.resourceType() === 'image'){
            req.abort();
        }
        else {
            req.continue();
        }
    });

    await page.goto('https://www.ebay.com/');
    await page.waitFor(10000);
    await page.close();
    await browser.close();
}

run();
