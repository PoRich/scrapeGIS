require('dotenv').config();
const db = require('../../db');
const scrapeTools = require('../../modules/scrapeTools.js');
//const db = require('./db');
//const scrapeTools = require('./modules/scrapeTools.js');


function reformat(_parcel_num, _r, topLevel_key){
    var component = _r[topLevel_key];
    var _keys = Object.keys(component);
    var _vals = Object.values(component);
    var _hvals = [];
    
    // console.log(`REFORMAT key: ${topLevel_key} | component ${component} | _vals ${JSON.stringify(_vals)}`);
    if ((typeof _vals[0] !== 'object') || (_vals[0] === null)) { // if value is not an array    
        component['parcel_num'] = _parcel_num;
        _hvals.push(component)
        return _hvals;
    }

    for(i=0;i<_vals[0].length;i++){
        for(var k in component){
            _hvals.push(component[k][i])
        }
    }
    
    var payload = scrapeTools.zipObject(_keys, _hvals);
    payload.map(e => e['parcel_num'] = _parcel_num);
    return payload;
}

async function reformat_batch(re_pattern){
    const raw = await db.query('SELECT parcel_num, raw_data FROM pcl_data.c42017_assessor WHERE raw_data2 is NULL AND parcel_num ~* $1;', [re_pattern]);
    var raw_records_arr = raw['rows'];
    const todoKeys = ['sales', 'commercial', 'ownerHistory', 'assessmentHistory', 
        'exemptions', 'additions', 'oby']
    
    // console.log(`raw_records_arr ${JSON.stringify(raw_records_arr, null, '\t')}`)
    console.log(`regexp pattern ${re_pattern} | raw length ${raw_records_arr.length}`);
    
    for(l=0; l<raw_records_arr.length; l++){
        var record = raw_records_arr[l]['raw_data'];
        var parcel_num = raw_records_arr[l]['parcel_num'];
        // console.log(`l-${l} Processing parcel_num: ${parcel_num}`);
        
        // reformat each component that has multiple values per key 
        for(j=0;j<todoKeys.length;j++){
            if (record[todoKeys[j]] !== null){
                record[todoKeys[j]] = reformat(parcel_num, record, todoKeys[j])
            }
        }
    
        // save payload 
        try{
            var s = db.query(`UPDATE pcl_data.c42017_assessor SET raw_data2 = $1::JSONB \
                WHERE parcel_num=$2 RETURNING parcel_num`, [record, parcel_num]);
            console.log(`Regex thread: ${re_pattern} - Saved #${l} `) //- Parcel Number:${JSON.stringify(s['rows'][0]['parcel_num'])}`)
        }
        catch(e){
            console.log(`error saving record ${e}`)
        }
    }
}

async function run(_re_start){
    // Launch multiple tabs each assigned a batch of parcel_numbers (based on regexp patterns) 
    for (i=_re_start; i<(_re_start+100); i++){ // run 10 tabs/pages at once 
        let re_string = i < 10 ? `0${i}` : `${i}`; // number -> string (add leading zero if < 10)
        let re = `^${re_string}` // string -> regex pattern
        reformat_batch(re)
    }
}

run(0);