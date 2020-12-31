/** NOTE: RUN THIS FILE FROM THE APP DIR AS 'node app/whitepages.js'
 * 
 * https://github.com/berstend/puppeteer-extra/wiki/Newbie-Guide-To-Scraping-With-Puppeteer
 * TODO - read about proxy and IP-based blocking rules, understand browser fingerprint
 */

// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality.
// Any number of plugins can be added through `puppeteer.use()`
const puppeteer = require('puppeteer-extra')
puppeteer.use(require('puppeteer-extra-plugin-repl')())
require('dotenv').config();
const db = require('../db')
// Add adblocker plugin to block all ads and trackers (saves bandwidth)
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
puppeteer.use(AdblockerPlugin({ blockTrackers: true }))

// User-Agent helper
const preparePageForTests = async (page) => {
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
await page.setUserAgent(userAgent);

// set screen resolution
await page.setViewport({
    width: 1366,
    height: 768   
 });
}

// database helper function
async function save(uri, f,m,l){
    try{
        await db.query('BEGIN');
        const queryText = 'INSERT INTO tools.whitepages(uri, f, m, l) VALUES($1, $2, $3, $4) RETURNING wp_id';
        const res = await db.query(queryText, [uri, f, m, l]);
        // add more queries here
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e
    }
}

// get top level links function
async function getDir(pageURL, page){
    // Find all links for each letter of the alphabet for whitepages.com/person
    try {
        // ty to go to URL
        await page.goto(pageURL, { waitUntil: 'networkidle2'} );
        console.log(`opened the page ${pageURL}`);
    } catch (error) {
        console.log(`failed to open the page: ${pageURL} with error: ${error}`);
    }
    
    // NOTE: puppeteer requires [ ] notation on CSS selectors (NOT: 'a.pearl--text.text-decoration-none')
    const linkDirectorySelector = 'a[class="pearl--text text-decoration-none"]' 
    await page.waitForSelector(linkDirectorySelector, {timeout: 0});
    
    // NOTE: $eval is the same as document.querySelector; $$eval is the same as document.querySelectorAll
    const links = await page.$$eval(linkDirectorySelector, dirLinks => {
        const topLinks = []    
        dirLinks = [...dirLinks] // convert to array
        dirLinks.forEach(function(l){
            if(l.innerText.match(/^\b[A-Z]\b$/) ){  //links innerHTML matches A B C etc...
                    topLinks.push(l.href);
                }
        });
        console.log(topLinks);        
        return topLinks;
    });
    return links
}


// scrape sub directory links; input is an array of urls for main top-level directory
async function getSubdir(url, page){
    
    // visit  page
    try {
        await page.goto(url, { waitUntil: 'networkidle2'} );
        console.log(`opened the page: ${url}`);
    } catch(error) {
        console.log(error);
        console.log(`failed to open the page ${url}`);
    }
    /// scroll a little for convincability 
    await page._client.send("Input.synthesizeScrollGesture", {
        x: 0,
        y: 0,
        xDistance: 0,
        yDistance: -100,
        })

    const subUrlSelector = 'ul[class="unstyled site-map-directory-listings"]';
    await page.waitForSelector(subUrlSelector, {timeout: 0});
    const payload = await page.$eval(subUrlSelector, subLinks => {
        let container = []; 
        let children = subLinks.childNodes;
        let len = children.length;
        for (let i=1; i<len; i=i+2){
            container.push(children[i].firstElementChild.href);
            console.log(`pushing url: ${children[i].firstElementChild.href}`);
        }    
        return container
    });
    return payload;
}

let browser = await puppeteer.launch({headless: true});
let page = await browser.newPage();

console.log(`connecting to database at ${process.env.PGHOST}:${process.env.PGPORT}`);
    //----------- load links from db; top level links saved in tools.whitepages with l='main_dir' 
    db.query('SELECT uri::text[] FROM tools.whitepages WHERE l=$1',['main_dir']).then(res =>{
        console.log(`res ${res}`);
        let links = res.rows[0]['uri'];
        console.log(`links loaded from database: ${links}`);
        // visit each link to find sub-directory links 
        for (let l of links) {
            (async () => { 
                var payload = await getSubdir(l);
                console.log(`saving ${payload}`)
                save(payload);
            })();

            
        }
        }).catch( (e) => console.log(`error ${e.stack}`));

/*        
(async () =>{
    // start browser & open new page 
    let browser = await puppeteer.launch({headless: true});
    let page = await browser.newPage();
    await preparePageForTests(page);

    // RUN THIS ONCE; aftwards, load from database 
    // get top-level directory links 
    var pageURL = 'https://www.whitepages.com/person';
    var links = await getDir(pageURL, page);
    console.log(`saving links ${links}`);
    await save(links, 'na', 'na', 'main_dir');

    await browser.close();
    process.exit()
    })();

    
    // PART III GET THE ACTUAL NAMES 
    await page.goto(subDir[1], { waitUntil: 'networkidle2'});
    
    const names = await page.evaluate(() => {
        
        let nChildren = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes;  // want text > baseURI
        const nLen = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes.length;
        console.log(nChildren)
        const payload = []
        console.log(nChildren)
        for (let i=1; i<nLen; i = i+2){
            payload.push(nChildren[i].firstElementChild.innerText)
        }
        await browser.close();
        return {payload}
    });

    console.log(names)
    */
    