const agent = require('secret-agent');
const db = require('../db');
require('dotenv').config();

// define URL structure 
var target = {
  state: 'IL', // upper case 
  city: 'Chicago' // case sensitive
}
const listing_type = 'lease'; //['lease', 'sale'];


async function run(){
  await agent.goto('https://loopnet.com');
  const { document } = agent;

  const searchType = {
    'lease': 'li.search-types--for-lease button', 
    'sale': 'li.search-types--for-sale button', 
    'auction': 'li.search-types--auction button', 
    'business': 'li.search-types--BBS button'
  };

  const selectSearchType = await document.querySelector(searchType[listing_type]);
  agent.interact({click: selectSearchType});

  const selectSearchBar = await document.querySelector('input[name="geography"]');
  agent.interact({ click: selectSearchBar}, {type: `${target.city}, ${target.state}`});

  const selectSearchSubmit = await document.querySelector('button.do-search');
  agent.interact({click: selectSearchSubmit});
  
  //const selectTotalPages = await document.querySelector('div[class="total-results"] span[class="ng-binding"]');
  agent.interact({waitForMillis: 15000});
  
  const mapPins = await document.querySelectorAll('div#mapState div');
  let mapPinsArray = [];
  for (const d of await mapPins){
    if(d.id){
      mapPinsArray.push({
        id: d.id, 
        lngLat: [d.getAttribute('lon'), d.getAttribute('lat')]
      })
    }
  }
    
  // Save map pins to db
  mapPinsArray.forEach(async (d) => {
    // console.log(`attempting to save mapPins ${JSON.stringify(d)}`)
    try{  // href is temporarily set to loopnet_id because it cannot be null
        console.log(`mapPins attempt ${d.id}`)
        const queryText = 'insert into hsing_data.loopnet (loopnet_id, the_geom, href, target_plcidfp, listing_type, date_scraped) \
            values ($1, ST_SetSRID(ST_MakePoint($2::float, $3::float), 4269), $1, (select pcl.place_to_fp($4, $5)), $6, now()) \
            on conflict on constraint unique_loopnet_id do update set (the_geom, date_scraped) = (EXCLUDED.the_geom, EXCLUDED.date_scraped) returning *'; 
        await db.query('BEGIN');
        const queryResult =  await db.query(queryText, [d.id, Number(d.lngLat[0]), Number(d.lngLat[1]), 
                         target.city, target.state, listing_type]);
        await db.query('COMMIT');
        console.log(`scrapeMapPins saved loopnet_id: ${JSON.stringify(queryResult['rows'][0]['loopnet_id'])}`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.log(`saveMapPin error: ${e}`);
        throw e
    }
  })

  // const title = await document.title;
  agent.output = { mapPinsArray };
  await agent.close();

  console.log('Retrieved from https:loopnet.com:', agent.output);
}

// -------------------------- Function Call -------------------------- 
run();