import { NextResponse } from 'next/server';
import { database, failure, fields, table, hash, payload, secret } from '@/lib/cloudPlans';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// The shared catalogue is public; editing an existing plan still requires its edit key.
export async function GET(req:Request){
 const params=new URL(req.url).searchParams;
 const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||50);
 const search=(params.get('q')||'').trim();
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||search.length>120){
  return NextResponse.json({error:'Invalid plan search or page.'},{status:400});
 }
 try{
  let query=database().from(table).select('id,title,updated_at').order('updated_at',{ascending:false}).order('id',{ascending:true});
  if(search)query=query.ilike('title','%'+search.replace(/[\\%_]/g,'\\$&')+'%');
  const {data,error}=await query.range(offset,offset+limit);
  if(error)throw error;
  const rows=data||[],hasMore=rows.length>limit;
  const plans=rows.slice(0,limit).map(({id,title,updated_at})=>({id,title,updated_at}));
  return NextResponse.json({plans,has_more:hasMore,next_offset:hasMore?offset+limit:null},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}

export async function POST(req:Request){let body;try{body=await payload(req)}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid request'},{status:400});}try{const key=secret();const {data,error}=await database().from(table).insert({title:body.title.trim(),player_input:body.plan.input||'',plan_json:body.plan,settings_json:{},edit_key:hash(key)}).select(fields).single();if(error)throw error;return NextResponse.json({...data,edit_key:key},{status:201,headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
