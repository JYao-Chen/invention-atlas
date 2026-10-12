import {migratePostgres,postgresPool} from '../src/server/postgres';

const pool=postgresPool();
try{await migratePostgres(pool);console.log('PostgreSQL schema migrated');}
finally{await pool.end();}
