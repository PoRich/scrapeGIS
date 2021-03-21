import geocoder
import os
import logging
from pprint import pprint
import requests
import sqlalchemy
from sqlalchemy.sql import text


logging.basicConfig(level=logging.DEBUG, format=' %(asctime)s - %(levelname)s\
- %(lineno)d - %(message)s')
# logging.disable(logging.CRITICAL)


def connect(database_url):
    '''Returns a connection and a metadata object'''
    # The return value of create_engine() is our connection object
    con = sqlalchemy.create_engine(database_url, client_encoding='utf8')
    # We then bind the connection to MetaData()
    meta = sqlalchemy.MetaData(bind=con, reflect=True)
    return con, meta

con, meta = connect(os.environ.get('DATABASE_URL'))


# Geocode: First Attempt 
# fetch data 
s = text("Select d_id, _raw_addr_no_unit from reiq.biz.dentists where _raw_addr_no_unit is not null and g_addr is null order by d_id;")
raw_addr = con.execute(s).fetchall()

geocoder_name = 'arcgis'
for r in raw_addr:
    # this is a toggle for multi-thredded implementation (one thread for even d_ids, another for odd)
    if r[0] % 2 == 1:   
        g = geocoder.arcgis(r[1]) 
        if g.status_code != 200:
            g_addr = '[http error: {}]'
            u = text("Update reiq.biz.dentists set _geocoder=:a, _g_quality=:b where d_id = :c")        
            con.execute(u, {"a": geocoder_name, "b": g_addr.format(g.status_code),  "c": r[0]} )
            print(f'd_id {r[0]} - Status Code Error: {g.status_code}')
        elif len(g) < 1:
            g_addr = '[no results]'
            u = text("Update reiq.biz.dentists set geocoder=:a, _g_quality=:b where d_id = :c")        
            con.execute(u, {"a": geocoder_name, "b": g[0].quality, "c": r[0]})
            print(f'd_id {r[0]} - ARCGIS returned no Geocoded Results')
        elif 'Address' not in g[0].quality:
            u = text("Update reiq.biz.dentists set g_addr=:a, _lng=:b, _lat=:c, _geocoder=:d, _g_quality=:e where d_id = :f")        
            con.execute(u, {"a": g[0].address, "b": g[0].lng, "c": g[0].lat, "d": geocoder_name, "e": g[0].quality, "f": r[0]})
            print(f'd_id {r[0]} - Non-Address Result')
        else: 
            u = text("Update reiq.biz.dentists set g_addr=:a, _lng=:b, _lat=:c, _geocoder=:d, _g_quality=:e where d_id = :f")        
            con.execute(u, {"a": g[0].address, "b": g[0].lng, "c": g[0].lat, "d": geocoder_name, "e": g[0].quality, "f": r[0]})
            print(f'd_id {r[0]} - Saved {g[0].address}')


'''


# Geocode: Second Attempt (OSM)
# fetch data that was not precisely geocoded
s = text("Select d_id, _raw_addr_no_unit \
         from reiq.biz.dentists \
         where _raw_addr_no_unit is not null and \
         (g_addr ~ '^\[' or g_addr !~ '^\d+')\
         order by d_id;")
raw_addr = con.execute(s).fetchall()

geocoder_name = 'osm'
for r in raw_addr:
    g = geocoder.osm(r[1]) 
    if g.status_code != 200:
        g_addr = '[http error: {}]'
        u = text("Update reiq.biz.dentists set _geocoder=:a, _g_quality=:b where d_id = :c")        
        con.execute(u, {"a": geocoder_name, "b": g_addr.format(g.status_code),  "c": r[0]} )
        print(f'd_id {r[0]} - Status Code Error: {g.status_code}')
    elif len(g) < 1:
        u = text("Update reiq.biz.dentists set _geocoder=:a, _g_quality=:b where d_id = :c")        
        con.execute(u, {"a": geocoder_name, "b": '[no results]', "c": r[0]})
        print(f'd_id {r[0]} - {geocoder_name} returned no Geocoded Results')
    elif 'house' not in g.quality:
        u = text("Update reiq.biz.dentists set g_addr=:a, _lng=:b, _lat=:c, _geocoder=:d, _g_quality=:e where d_id = :f")        
        con.execute(u, {"a": g.address, "b": g.lng, "c": g.lat, "d": geocoder_name, "e": g.quality, "f": r[0]})
        print(f'd_id {r[0]} - Non-Address Result')
    else: 
        u = text("Update reiq.biz.dentists set _addr_num=:a, _street=:b, _city=:c, _state=:d, _zip=:e, g_addr=:f, _lng=:g, _lat=:h, _geocoder=:i, _g_quality=:j where d_id = :k")        
        con.execute(u, {"a": g.raw['address']['house_number'], "b": g.raw['address']['road'], "c": g.raw['address']['city'] if 'city' in g.raw['address'].keys() else (g.raw['address']['town'] if 'town' in g.raw['address'].keys() else None), "d": g.raw['address']['state'], 
        "e": g.raw['address']['postcode'], "f": g.address, "g": g.lng, "h": g.lat, "i": geocoder_name, "j": g.quality, "k": r[0] })
        print(f'd_id {r[0]} - Saved {g[0].address}')



# ================== Geocode: THIRD Attempt (CENSUS) ==================
def tiger_geocode(addr):
    url = f'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?'
    fields = {}
    fields['address'] = addr
    fields['benchmark'] = 'Public_AR_Current'
    fields['vintage'] = 'Current_Current'
    fields['format'] = 'json'
    try:
        with requests.get(url, params=fields, timeout=30) as r:
            content = r.json()
            logging.debug(pprint(r.url))
            try:
                payload = content['result']['addressMatches'][0]
                return payload
            except IndexError:
                # raise ValueError("IndexError: Unable to parse response from Census")
                return -1
    except (ValueError, KeyError, requests.exceptions.ReadTimeout):
        # raise ValueError("Unable to parse response from Census")
        return -1

# fetch data that was not precisely geocoded
s = text("Select d_id, _raw_addr_no_unit \
         from reiq.biz.dentists \
         where _raw_addr_no_unit is not null and \
         (g_addr ~ '^\[' or g_addr !~ '^\d+')\
         order by d_id;")
raw_addr = con.execute(s).fetchall()

geocoder_name = 'tiger'

for r in raw_addr:
    g = tiger_geocode(r[1])
    if g == -1:
        u = text("Update reiq.biz.dentists set _geocoder=:a, _g_quality=:b where d_id = :c")        
        con.execute(u, {"a": geocoder_name, "b": '[no results]', "c": r[0]})
        print(f'd_id {r[0]} - {geocoder_name} returned no Geocoded Results')
    else: 
        u = text("Update reiq.biz.dentists set g_addr=:f, _lng=:g, _lat=:h, _geocoder=:i, _g_quality=:j where d_id = :k")        
        con.execute(u, {"f": g['matchedAddress'], "g": g['coordinates']['x'], "h": g['coordinates']['y'], "i": geocoder_name, "j": 'Address', "k": r[0] })
        print(f'd_id {r[0]} - Saved {g[0].address}')
'''