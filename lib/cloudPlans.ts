import { NextResponse } from 'next/server';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from './supabaseAdmin';
import { validatePlan } from '../public/planner/planner-core.mjs';
export const table='community_plans';
export const fields='id,title,plan_json,updated_at';
export function failure(e: unknown){console.error('Cloud save failed',e instanceof Error?e.message:'unknown');return NextResponse.json({error:'Cloud saves are unavailable. Your current plan is still on screen. Please try again.'},{status:503});}
export async function payload(req: Request){const text=await req.text();if(text.length>1000000)throw Error('Plan is too large');const b=JSON.parse(text);if(typeof b.title!=='string'||!b.title.trim()||b.title.length>120)throw Error('Enter a plan name (maximum 120 characters)');return {title:b.title,plan:validatePlan(b.plan),expectedUpdatedAt:b.expectedUpdatedAt};}
export function hash(key:string){return 'sha256:'+createHash('sha256').update(key).digest('hex');}
export function authorised(req:Request,stored:string){const key=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(!key)return false;const a=Buffer.from(stored.startsWith('sha256:')?hash(key):key),b=Buffer.from(stored);return a.length===b.length&&timingSafeEqual(a,b);}
export function database(){return getSupabaseAdmin();}
export function secret(){return randomBytes(32).toString('base64url');}
export function validId(id:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);}
