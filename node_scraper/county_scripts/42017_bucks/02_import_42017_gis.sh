#!/bin/bash
export PGHOST=localhost
export PGPORT=63333
export PGUSER=reiq
export PGPASSWORD=$1
export PGDATABASE=reiq
export STAGING_FOLDER='/Users/Rich/Downloads/scrape_temp'

if [ -z $PGPASSWORD ]; then
    echo "You must set PGPASSWORD environment variable to the hostname of the PostgreSQL server to operate on."
    exit 1
fi

# download ownership data (geojson)
cd ${STAGING_FOLDER}

#for i in `find ${STAGING_FOLDER} -name *.geojson`; do
for i in ${STAGING_FOLDER}/*.geojson 
do
    echo "loading $i"
    # echo "ogr2ogr -f \"PostgreSQL\" PG:\"host=${PGHOST} port=${PGPORT} user=${PGUSER} dbname=${PGDATABASE} password=${PGPASSWORD}\" $i -nln pcl_data.c42107_gis -lco GEOMETRY_NAME=the_geom"
    ogr2ogr -f "PostgreSQL" PG:"host=${PGHOST} port=${PGPORT} user=${PGUSER} dbname=${PGDATABASE} password=${PGPASSWORD}" $i -nln pcl_data.c42107_gis -nlt PROMOTE_TO_MULTI -lco GEOMETRY_NAME=the_geom -skipfailures
    if [ $? != 0 ]; then
        echo "Failed importing $i."
        exit 1
    fi
done

# ogr2ogr -f "PostgreSQL" PG:"host=localhost port=63333 user=reiq dbname=reiq password=13@13yc@k3s" /Users/Rich/Downloads/scrape_temp/c42017_gis_190000.geojson -nln pcl_data.c42107_gis -lco GEOMETRY_NAME=the_geom

# alter table pcl_data.c42107_gis alter column the_geom type geometry(MULTIPOLYGON, 3857) using ST_Multi(the_geom);