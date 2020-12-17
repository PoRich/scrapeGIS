import datetime
import json
import logging
import pandas as pd
import pdb
import os
import re 
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

SCHEMA = 'parcel_data'  # schema for staging raw parcel data 


class Table: 
    def __init__(self, county_code, name, url, file_type, unzip=false):
        self.tableName = f"c{county_code}_{name}"
        self.url = url
        self.file_type = file_type
        self.unzip = unzip




def table_name(county_code, key): return f"c{county_code}_{key}"  # convention is 'c' (denoting county) + FSIP number   



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
def scrape_properties_assessments(county_code, description, url):
    # downloads data into database, replaces existing database if exists
    assert description in ['properties', 'assessments'], 'description m sut be in properties or assessments'
    tableName = table_name(county_code, description)
    if description == 'properties':
        func = scrape_json(url, tableName)
    elif description == 'assessments':
        func = scrape_csv(url, tableName)
    repeat_attempts(5, func, description)  


def scrape_json(url, table):
    try:
        logging.debug(f'Scraping {table} via api...')
        response = requests.get(url)
        rjson = response.json()  # convert to json
        df = pd.DataFrame(rjson['rows'])  # load rows (not metadata) into dataframe
        save_df(df, table)
    except Exception as e:
        handle_err(scrape_json, table, e, traceback.format_exc())
        return -1
    return 


def scrape_csv(url, table):
    try:
        logging.debug(f'Scraping {table} via csv...')
        df = pd.read_csv(url)  # download csv
        save_df(df, table)
    except Exception as e:
        handle_err(scrape_csv, table, e, traceback.format_exc())
        return -1
    return 


def save_df(df, table):  # saves data to database
    logging.debug(f'Saving {table} to database...')
    engine = create_engine(DATABASE_URL)
    df['last_updated_utc'] = datetime.datetime.utcnow()  # add time stamp UTC
    df.to_sql(table, con=engine, schema=SCHEMA, if_exists='replace')  # dump into database
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
#scrape_shp({"dangerous_violations": shp_urls["dangerous_violations"]})
