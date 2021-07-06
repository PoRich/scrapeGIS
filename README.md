# Scraper 
A web sraping micro service 
### DENTISTS 
1. ADA - gives list of locations [scraped DE, IL, partial PA]
    1. set target['state'] variable; TODO - scrape all states 
    2. `$ node app/dentists_ada.js` from node_scraper root folder 
2. YELP - IL, PA (202 no addr / 11,756 with address)
3. YELLOW PAGES -
    a. scrape directionsURL on first attempt
4. GOOGLE MAPS [LATER]
5. SECRETARY OF STATE [LATER]
6. BUSINESS LICENSING DATABASE [LATER] - https://delpros.delaware.gov/OH_VerifyLicense


----
# TODO 
### Not Urgent
1. add postal abbrev https://pe.usps.com/text/pub28/28apc_002.htm 
2. add National Address Database from Dept of Transportation: https://www.transportation.gov/gis/national-address-database/national-address-database-nad-disclaimer
3. http://us-cities.survey.okfn.org/dataset/property-transfers
___
# Misc. Reference 
## Third-Party API Cost Reference
* 2captcha is $0.50 for 1000 (5% of a cent per captcha) 
* scraperapi is $29 for 250K requests per month (1.16% of a cent per proxy)
## Insurance Providers
* Kaiser Permanente
* Blue Cross Blue Shield
* UnitedHealthCare -  https://dentalsearch.yourdentalplan.com/providersearch
* Aetna
* Cigna
* HCSC
* Molina Healthcare 
* Anthem 
* Centene
* Humana 
* CVS Health
* MCNA Health Care
* WellCare


---
Notes from https://www.youtube.com/watch?v=ITPDmVaOou0&t=932s
## Detection 
1. Proxy Server (Datacenter, Residential, Specialized, Super Proxy)
* proxy rotation and session management - should be sending the same cookie from the same IP; Can use residential proxies for high value targets and ignore everything else  
2. Headless browsers (JS rendering) - Puppeteer, Playwright, Secret Agent
3. Fingerprinting - browswer, operating system, browser extensions, audio/video hardware; fingerprint needs to match browswers and paired to sessions
## Methods 
1. Public API scraping (avoid parsing HTML, may require a session which can be created/refreshed from a browser)
2. Mobile API scrapign usign a man-in-the-middle proxy to reverse engineer mobile APIs - install custom certificate to phone and man-in-the-middle software to your laptop 
3. Solving Challenges/Recaptcha - 