# Download parcel map frop open addresses 
# https://blog.crunchydata.com/blog/loading-data-into-postgis-an-overview

# mkdir /Users/Rich/Downloads/c42017_buck_county
# DATADIR = /Users/Rich/Downloads/c42017_buck_county

# download parcel data (geojson)
cd /Users/Rich/Downloads
sudo ogr2ogr -f "PostgreSQL" PG:"host=localhost user=reiq password=13@13yc@k3s dbname=reiq" ./us_pa_bucks-parcels-county.geojson -nln pcl_data.c42107_open_addr -lco GEOMETRY_NAME=the_geom
