import {postgresPool} from '../src/server/postgres';
import {IdentityStore} from '../src/server/identity';
const pool=postgresPool();
try{
 const user=process.env.PATENT_USERNAME,password=process.env.PATENT_PASSWORD;
 if(!user||!password)throw new Error('初始化需要PATENT_USERNAME与PATENT_PASSWORD');
 const result=await new IdentityStore(pool).initializeAdmin(user,password,'专利分析平台');
 console.log(JSON.stringify({userId:result.user!.id,organizationId:result.organizationId,projectId:result.projectId}));
}finally{await pool.end();}
