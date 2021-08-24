from runpy import run_path
SCRAPE_PATH = "/Users/Rich/CSprojects/scrapeGIS/python_scraper/app/scrape.py"
scrape = run_path(SCRAPE_PATH)

target_urls = {'properties': ['https://phl.carto.com/api/v2/sql?q=select%20*from%20opa_properties_public', 'json'],
                # assessments updated annually, market_value in properties dataset is the assessed value
                # best to update by year
                # 'assessments': ['https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20assessments%20where%20year%20=2021', 'json']  
               # 'assessments': ['https://opendata-downloads.s3.amazonaws.com/assessments.csv', 'csv']  # csv yielded fewer records and many blank records; unclear how reliable it is 
               }


# NOTE the property table upload can take ~60 mintues (581k rows)
COUNTY_CODE = '42101'
for k,v in target_urls.items():
    # define a class
    table = scrape['Table'](COUNTY_CODE, k, v[0], v[1])
    table.scrape()
