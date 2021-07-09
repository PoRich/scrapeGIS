//------ Version 1 
const { Client } = require('pg')
require('dotenv').config();

let client = new Client()

client.connect(err => {
  if (err) {
    console.error('connection error', err.stack)
  } else {
    console.log('connected')
  }
})

client.query(
    'select agent.get_a_id_person($1, $2, $3) as a_id', 
    ['Mr. George "Gob" Bluth III', 'owner', 'loopnet'],
     (err, res) => { 
        if (err){ throw err }
        console.log(res['rows'][0]['a_id']);   
});

client.query(
    'select agent.get_a_id_entity($1, $2, $3) as a_id', 
    ['Sitwell Housing LLC', 'Construction Company', 'loopnet'],
     (err, res) => { 
        if (err){ throw err }
        console.log(res['rows'][0]['a_id']);        
    });
    
client.end() 

//------ Version 2
    
const db = require('../db');
require('dotenv').config();

(async ()=>{
    const client = await db.getClient();
    try{
        let agent1_id, agent2_id, aAgent_id

        await client.query('BEGIN;');
        await client.query('select reiq.venv();'); // required for python modules used in postgreSQL functions

        const a1Query = await client.query(
            'select agent.get_a_id_person($1, $2, $3) as a_id', 
            ['Mr. George "Gob" Bluth III', 'owner', 'loopnet']);
        agent1_id = a1Query['rows'][0]['a_id'];

        const a2Query = await client.query(
            'select agent.get_a_id_entity($1, $2, $3) as a_id', 
            ['Sitwell Housing LLC', 'Construction Company', 'loopnet']);
        agent2_id = a2Query['rows'][0]['a_id'];

        console.log(`agent1_id ${agent1_id} | agent2_id ${agent2_id}`);
        if (agent1_id && agent2_id){
            const aaQuery = await client.query(
                'insert into agent.a_agent(agent1_id, relation, agent2_id, notes) \
                values ($1, $2, $3, $4) returning aa_id', [agent1_id, 'works for', agent2_id, 'per loopnet']);
            aAgent_id = aaQuery['rows'][0]['aa_id'];
        }
        await client.query('COMMIT;');
    } catch(e){
        await client.query('ROLLBACK;');
        console.log(`error saving to db ${e}`)
    }
    client.release();
})();

//------ Version 3 - 1 call (with venv embedded in the function)



(async ()=>{ 
	let r = await db.query('select agent.get_a_id_person($1, $2, $3)', 
				['Mr. George "Gob" Bluth III', 'owner', 'loopnet']); 
	console.log(`r ${JSON.stringify(r)}`);
})()

(async ()=>{ 
	let r = await db.query('select pcl_stg.geocode_api($1)', 
				['1757 West 2nd St, Brooklyn, NY 11223']); 
	console.log(`r ${JSON.stringify(r)}`);
})()


// -- offerred by as an array 
let x = {"offeredBy": [
    {
        "@type": "Person",
        "name": "Eric Myers",
        "jobTitle": "Commercial Real Estate Broker",
        "worksFor": {
            "@type": "Organization",
            "name": "Avison Young"
        }
    },
    {
        "@type": "Person",
        "name": "Kathleen Bertrand",
        "jobTitle": "Commercial Real Estate Broker",
        "worksFor": {
            "@type": "Organization",
            "name": "Avison Young"
        }
    },
    {
        "@type": "Person",
        "name": "John Nelson",
        "jobTitle": "Commercial Real Estate Broker",
        "worksFor": {
            "@type": "Organization",
            "name": "Avison Young"
        }
    }
]}

// -- offerred by as an object
let d = {"name": "311 South Wacker", "offeredBy": {"name": "John Vance", "@type": "Person", "jobTitle": "Commercial Real Estate Broker", "worksFor": {"name": "Stone Real Estate", "@type": "Organization"}}, "streetAddress": "311 S Wacker Dr"}

select loopnet_id, raw_jsonld -> 'offeredBy', listing_broker from hsing_data.loopnet where raw_jsonld is not null;
select loopnet_id, jsonb_pretty(raw_jsonld -> 'offeredBy') from hsing_data.loopnet where listing_broker is null and raw_jsonld is not null; 


update hsing_data.loopnet set (listing_broker, listing_brokers) = (11, case when listing_brokers is null then Array[11] else array_append(listing_brokers, '11'::int) end ) 
where loopnet_id='13278752' and listing_type='lease'
returning listing_broker, listing_brokers;


update hsing_data.loopnet set listing_brokers = array_append(listing_brokers, '11'::int)
where loopnet_id='13278752' and listing_type='lease' and listing_broker is not null  
returning listing_broker, listing_brokers;


update hsing_data.loopnet set (listing_broker, listing_brokers) = (11, Array[11]) 
where loopnet_id='13278752' and listing_type='lease' and listing_broker is null 
returning listing_broker, listing_brokers;
