const puppeteer = require('puppeteer');

(async () =>{
    var targetURL = 'https://www.whitepages.com/ind/a-001';
    let browser = await puppeteer.launch({headless: false});
    let page = await browser.newPage();
    await page.goto(targetURL, { waitUntil: 'networkidle2'} )
    const subDir = await page.evaluate(() => {
        let children = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes;  // want text > baseURI
        const len = document.querySelector('ul[class="unstyled site-map-directory-listings"]').childNodes.length;
        const links = []
        console.log(children)

        for (let i=1; i<len; i = i+2){
            links.push(children[i].firstElementChild.href)
        }
        console.log(document)

    return{links}
    });


    /*
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
    console.log(subDir)
    await browser.close();

})();

