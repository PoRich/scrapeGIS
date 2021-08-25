# https://raw.githubusercontent.com/censusreporter/census-postgres-scripts/master/12_download_blocks_2020.sh
# Download census-y TIGER data
# using https://census-backup.b-cdn.net/geo/tiger/TIGER2020/TABBLOCK20/
# Includes "Island areas" blocks which aren't relevant to our project but we'll take 'em for now
mkdir -p /tmp/census/blocks2020

wget --recursive --continue --accept=tl_2020_??_tabblock20.zip \
    --no-parent --cut-dirs=3 --no-host-directories \
     -e robots=off \
     --directory-prefix=/tmp/census/blocks2020 \
    https://census-backup.b-cdn.net/geo/tiger/TIGER2020/TABBLOCK20/
