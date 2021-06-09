## How to download a shp file into psql
1. get the url of the shp file download, add it to node_scraper/county_scripts/c42101.js shp_urls object 
2. add function call to bottom of the file, county_code should start with a 'c'; this along with description will be  the table name in psql 
3. make sure the environmental variables are set for database connection- check node_scraper/.env for (PGHOST, PGSCHEMA, etc)
4. from the node_scraper directory, run 
''' javascript
    node county_scripts/c42101.js
'''


## node.js reference 

### repl 
'''
node
const repl = require('repl');
.editor
.load ./script.js
'''

### log (from cwd of the respective scripts)
node index.js > ./logs/log-file.txt 2> ./logs/error-file.txt
node c42101.js > ../logs/log-file.txt 2> ../logs/error-file.txt
