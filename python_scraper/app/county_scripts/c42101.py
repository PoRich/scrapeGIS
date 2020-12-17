from runpy import run_path
SCRAPE_PATH = "/Users/Rich/CSprojects/scrapeGIS/python_scraper/app/scrape.py"
scrape = run_path(SCRAPE_PATH)

target_urls = {'properties': ['https://phl.carto.com/api/v2/sql?q=select%20*from%20opa_properties_public', 'json'],
               'assessments': ['https://opendata-downloads.s3.amazonaws.com/assessments.csv', 'csv']}


COUNTY_CODE, table = '42101', 'properties'

for k,v in target_urls.items():
    # define a class
    table = scrape['Table'](COUNTY_CODE, k, v[0], v[1])
    table.scrape()
