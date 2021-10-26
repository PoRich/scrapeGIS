from runpy import run_path
# path from macbookAir
SCRAPE_PATH = "/Users/Rich/CSprojects/scrapeGIS/python_scraper/app/scrape.py" 
# path from iMac
# SCRAPE_PATH = "/home/rsun/CSprojects/scrapegis/python_scraper/app/scrape.py" 

scrape = run_path(SCRAPE_PATH)

target_urls = {# 'properties_211010': ['https://phl.carto.com/api/v2/sql?q=select%20*from%20opa_properties_public', 'json'],
                # assessments updated annually, market_value in properties dataset is the assessed value
                # best to update by year
                'assessments_2021': ['https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20assessments%20where%20year%20=2021', 'json'],
                #'assessments_2020': ['https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20assessments%20where%20year%20=2020', 'json'],
                #'assessments_2019': ['https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20assessments%20where%20year%20=2019', 'json'],
                #'assessments_2018': ['https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20assessments%20where%20year%20=2018', 'json'],  
                #'assessments_2017': ['https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20assessments%20where%20year%20=2017', 'json'],  
                #'assessments_2016': ['https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20assessments%20where%20year%20=2016', 'json'],  
                # 'assessments_2015': ['https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20assessments%20where%20year%20=2015', 'json'],  
               # 'assessments': ['https://opendata-downloads.s3.amazonaws.com/assessments.csv', 'csv']  # csv yielded fewer records and many blank records; unclear how reliable it is 
               }


# NOTE the property table upload can take ~60 mintues (581k rows)
COUNTY_CODE = '42101'
for k,v in target_urls.items():
    # define a class
    table = scrape['Table'](COUNTY_CODE, k, v[0], v[1])
    table.scrape()
