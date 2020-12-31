require('dotenv').config()

const hostname = process.env.PGHOST;
const database = process.env.PGDATABASE;
const port = process.env.PGPORT;

console.log(hostname);
console.log(database);
console.log(port);
