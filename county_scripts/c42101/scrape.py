import datetime
import json
import logging
import pandas as pd
import pdb
import os
import requests
import shutil
from sqlalchemy import create_engine
import subprocess
import sys
import traceback

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - [%(lineno)d]  %(message)s')
#logging.basicConfig(filename='c42101_scraper_log.txt', level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
#logging.disable(logging.DEBUG)
app_dir = os.getenv('APPDIR') 
bash_scraper_dir = os.path.join(app_dir, 'bash_scraper')  # execute download_shp in parent directory
staging_dir=os.path.join(app_dir, 'tmp')
error_log = f'{bash_scraper_dir}/scraper_error_log.txt'
DATABASE_URL = os.environ.get('DATABASE_URL')

COUNTY_CODE='c42101'  # convention is 'c' (denoting county) + FSIP number   
SCHEMA = 'parcel_data'  # schema for staging raw data 
def table_name(key): return f"{COUNTY_CODE}_{key}"


csv_urls = {'properties': 'https://opendata-downloads.s3.amazonaws.com/opa_properties_public.csv',
            'assessments': 'https://opendata-downloads.s3.amazonaws.com/assessments.csv'}

json_urls = {'properties': 'https://phl.carto.com/api/v2/sql?q=select%20*from%20opa_properties_public',
             'assessments': 'https://phl.carto.com/api/v2/sql?q=select%20*%20from%20ASSESSMENTS'}

shp_urls =  {
    "land_use": "http://data-phl.opendata.arcgis.com/datasets/e433504739bd41049de5d8f4a22d34ba_0.zip",  
    "dept_of_records": "http://data-phl.opendata.arcgis.com/datasets/1c57dd1b3ff84449a4b0e3fb29d3cafd_0.zip", 
    "re_transfers": "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272020-01-01%27", 
    "re_tax_delinquencies": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+real_estate_tax_delinquencies&filename=real_estate_tax_delinquencies&format=shp&skipfields=cartodb_id",
    "business_licenses": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+business_licenses&filename=business_licenses&format=shp&skipfields=cartodb_id",
    "building_permits": "https://phl.carto.com/api/v2/sql?filename=permits&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20permits%20WHERE%20permitissuedate%20%3E=%20%272016-01-01%27",
    "li_violations": "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272019-01-01%27",
    "unsafe_violations": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+unsafe&filename=unsafe&format=shp&skipfields=cartodb_id", 
    "dangerous_violations": "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+imm_dang&filename=imm_dang&format=shp&skipfields=cartodb_id",
    }

bash_results =  {
    "land_use": [200, "ok"],
    "dept_of_records": [200, "ok"],
    "re_transfers": [500, "d/l terminated early"],
    "re_tax_delinquencies": [500, "d/l terminated early"],
    "business_licenses": [500, "failed to download"],
    "building_permits":  [500, "failed to download"],
    "li_violations":  [500, "failed to download"],
    "unsafe_violations":  [500, "failed to download"],
    "dangerous_violations":  [500, "failed to download"],
    }

archive_shp_urls = {
    're_transfers_18-19': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272018-01-01%27%20AND%20display_date%20%3C%20%272020-01-01%27",
    're_transfers_16-17': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272016-01-01%27%20AND%20display_date%20%3C%20%272018-01-01%27",
    're_transfers_14-15': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272014-01-01%27%20AND%20display_date%20%3C%20%272016-01-01%27",
    're_transfers_12-13': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272012-01-01%27%20AND%20display_date%20%3C%20%272014-01-01%27",
    're_transfers_10-11': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272010-01-01%27%20AND%20display_date%20%3C%20%272012-01-01%27",
    're_transfers_08-09': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272008-01-01%27%20AND%20display_date%20%3C%20%272010-01-01%27",
    're_transfers_06-07': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272006-01-01%27%20AND%20display_date%20%3C%20%272008-01-01%27",
    're_transfers_04-05': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272004-01-01%27%20AND%20display_date%20%3C%20%272006-01-01%27", 
    're_transfers_02-03': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3E=%20%272002-01-01%27%20AND%20display_date%20%3C%20%272004-01-01%27",
    're_transfers_prior-01': "https://phl.carto.com/api/v2/sql?filename=RTT_SUMMARY&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20RTT_SUMMARY%20WHERE%20display_date%20%3C%20%272002-01-01%27",
    'business_licenses_archive': "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+li_business_licenses&filename=li_business_licenses&format=shp&skipfields=cartodb_id",
    'building_permits_07-15': "https://phl.carto.com/api/v2/sql?filename=permits&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20permits%20WHERE%20permitissuedate%20%3E=%20%272007-01-01%27%20AND%20permitissuedate%20%3C%20%272016-01-01%27",
    'building_permits_archive': "https://phl.carto.com/api/v2/sql?q=SELECT+*+FROM+li_permits&filename=li_permits&format=shp&skipfields=cartodb_id",
    'li_violations_16-18': "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272016-01-01%27%20AND%20violationdate%20%3C%20%272019-01-01%27",
    'li_violations_13-15': "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272013-01-01%27%20AND%20violationdate%20%3C%20%272016-01-01%27",
    'li_violations_10-12': "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272010-01-01%27%20AND%20violationdate%20%3C%20%272013-01-01%27",
    'li_violations_07-09': "https://phl.carto.com/api/v2/sql?filename=violations&format=shp&skipfields=cartodb_id&q=SELECT%20*%20FROM%20violations%20WHERE%20violationdate%20%3E=%20%272007-01-01%27%20AND%20violationdate%20%3C%20%272010-01-01%27",
}


def download_file(url, local_filename):
    with requests.get(url, stream=True) as r:
        with open(local_filename, 'wb') as f:
            shutil.copyfileobj(r.raw, f)
    return local_filename

     
def repeat_attempts(max_attempts, func, *args, **kwargs):
    # attempts a function max_attempts; function should return errror as -1
    attempts, outcome = 1, -1  #-1=error, 0=success
    while (outcome == -1) and (attempts <= max_attempts):
        logging.debug(f'Attempt {func}({args}) attempt #{attempts} of {max_attempts}')
        outcome = func(*args, **kwargs)
        if outcome == 0:
            logging.debug(f'{func}({args}) completed on {attempts} attempt')
            # should break the while loop
        elif outcome == -1 and attempts == max_attempts:
            # maximum attempts were unsuccessful
            err_message = f'{func}({args}) failed after {max_attempts} unsuccessful attempts'
            logging.error(err_message)
            with open(error_log, 'w') as err_log:
                err_log.write(err_message)
        attempts += 1


def handle_err(func, table, e, traceback):
    err_message = f'{COUNTY_CODE} - {func}({table}) failed with err {e}: {traceback}'
    logging.error(err_message)
    with open(error_log, 'w') as err_log:
        err_log.write(err_message)


# scrape assessment and opa property database
def scrape_properties_assessments(table):
    # downloads data into database, replaces existing database if exists
    if table == 'properties':
        func = scrape_json
    elif table == 'assessments':
        func = scrape_csv
    repeat_attempts(5, func, table)  


def scrape_json(table):
    try:
        logging.debug(f'Scraping {table} via api...')
        response = requests.get(json_urls[table])
        rjson = response.json()  # convert to json
        df = pd.DataFrame(rjson['rows'])  # load rows (not metadata) into dataframe
        save_df(df, table)
    except Exception as e:
        handle_err(scrape_json, table, e, traceback.format_exc())
        return -1
    return 


def scrape_csv(table):
    try:
        logging.debug(f'Scraping {table} via csv...')
        df = pd.read_csv(csv_urls[table])  # download csv
        save_df(df, table)
    except Exception as e:
        handle_err(scrape_csv, table, e, traceback.format_exc())
        return -1
    return 


def save_df(df, table):  # saves data to database
    logging.debug(f'Saving {table} to database...')
    engine = create_engine(DATABASE_URL)
    df['last_updated_utc'] = datetime.datetime.utcnow()  # add time stamp UTC
    df.to_sql(table_name(table), con=engine, schema=SCHEMA, if_exists='replace')  # dump into database
    return 


def scrape_shp(url_dict):
    for table, shp_url in url_dict.items():
        cmd = f"bash download_shp.sh {COUNTY_CODE}_{table} {shp_url}"
        logging.debug(f'executing cmd {cmd} bash directory:{bash_scraper_dir}')
        subprocess.Popen(cmd.split(), cwd=bash_scraper_dir)
    return 0


def wget_test():
    #works: land_use, dor_parcel, imm_danger
    #fails:
    for table, shp_url in shp_urls.items():
        cmd = f"bash wget_shp.sh {table} {shp_url}"
        subprocess.Popen(cmd.split(), cwd=bash_scraper_dir)


def req_downloader_test(staging_dir=None):
    if staging_dir is None:
        staging_dir=os.path.join(app_dir, 'tmp')
    os.chdir(staging_dir)
    #works
    #fails
    for table, shp_url in shp_urls.items():
        download_file(shp_url,f"{table}.zip")


if __name__ == "__main__":
    if len(sys.argv) == 1:  # if no arguments are passed in
        '''
        for t in ['properties', 'assessments']:
            scrape_properties_assessments(t)  # by default will scrape OPA property and assessments database
        '''
        #scrape_shp(shp_urls)  # to test
        #scrape_shp(archive_shp_urls)


# testing
scrape_shp({"dangerous_violations": shp_urls["dangerous_violations"]})
