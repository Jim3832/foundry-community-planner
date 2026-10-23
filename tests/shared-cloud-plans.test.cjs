const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('next/dist/build/swc');
const { NextResponse } = require('next/server');
const core = require('../public/planner/planner-core.mjs');
const emptyPlan=()=>({format:core.FORMAT,players:[],master:{},overrides:{p2:{},p3:{}},settings:core.blankSettings(),commander:null,input:''});

const root = path.join(__dirname, '..');
function loadTypeScript(file, imports) {
  const source = readFileSync(path.join(root, file), 'utf8');
  const { code } = transformSync(source, { filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2017' }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in imports ? imports[name] : require(name), module, module.exports);
  return module.exports;
}

function fixture(rows, error = null) {
  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    ilike(column, value) { calls.push(['ilike', column, value]); return this; },
    range(start, end) { calls.push(['range', start, end]); return Promise.resolve({ data: rows.slice(start, end + 1), error }); },
    eq() { return this; },
    maybeSingle() { return Promise.resolve({ data: rows[0], error }); },
    update() { throw Error('Unauthorised request reached an update'); },
  };
  const db = { from(table) { assert.equal(table, 'community_plans'); return query; } };
  const helpers = { ...loadTypeScript('lib/cloudPlans.ts', { './supabaseAdmin': { getSupabaseAdmin: () => db }, '../public/planner/planner-core.mjs': core }) };
  // Keep the test output quiet for the deliberately unavailable database case.
  helpers.failure = () => NextResponse.json({ error: 'Cloud storage is unavailable.' }, { status: 503 });
  return {
    calls,
    collection: loadTypeScript('app/api/cloud-plans/route.ts', { '@/lib/cloudPlans': helpers }),
    individual: loadTypeScript('app/api/cloud-plans/[id]/route.ts', { '@/lib/cloudPlans': helpers }),
    helpers,
  };
}

const saved = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'Example one', updated_at: '2026-10-23T15:00:00Z', edit_key: 'must-never-be-listed', plan_json: emptyPlan() },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Example two', updated_at: '2026-10-22T15:00:00Z', edit_key: 'also-private' },
  { id: '33333333-3333-4333-8333-333333333333', title: 'Practice', updated_at: '2026-10-21T15:00:00Z' },
];

test('a fresh visitor can list cloud saves without browser history or credentials', async () => {
  const { collection, calls } = fixture(saved);
  const response = await collection.GET(new Request('https://planner.test/api/cloud-plans'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.deepEqual(result.plans, saved.map(({ id, title, updated_at }) => ({ id, title, updated_at })));
  assert.equal(result.has_more, false);
  assert.equal(result.next_offset, null);
  assert.deepEqual(calls.slice(0, 3), [
    ['select', 'id,title,updated_at'],
    ['order', 'updated_at', { ascending: false }],
    ['order', 'id', { ascending: true }],
  ]);
  assert.ok(!JSON.stringify(result).includes('edit_key'));
  assert.ok(!JSON.stringify(result).includes('plan_json'));
});

test('pagination does not silently hide saves beyond the first page', async () => {
  const { collection } = fixture(saved);
  const first = await (await collection.GET(new Request('https://planner.test/api/cloud-plans?limit=2'))).json();
  assert.equal(first.plans.length, 2);
  assert.equal(first.has_more, true);
  assert.equal(first.next_offset, 2);
  const second = await (await collection.GET(new Request('https://planner.test/api/cloud-plans?limit=2&offset=2'))).json();
  assert.deepEqual(second.plans.map(p => p.id), [saved[2].id]);
  assert.equal(second.has_more, false);
});

test('search is performed on the cloud query and treats wildcard characters literally', async () => {
  const { collection, calls } = fixture([]);
  await collection.GET(new Request('https://planner.test/api/cloud-plans?q=' + encodeURIComponent('100%_Example\\test')));
  assert.ok(calls.some(([op, column, value]) => op === 'ilike' && column === 'title' && value === '%100\\%\\_Example\\\\test%'));
});

test('invalid pagination and overlong searches are rejected before reading cloud data', async () => {
  for (const query of ['offset=-1', 'offset=1.5', 'offset=NaN', 'limit=0', 'limit=101', 'q=' + 'a'.repeat(121)]) {
    const { collection, calls } = fixture(saved);
    const response = await collection.GET(new Request('https://planner.test/api/cloud-plans?' + query));
    assert.equal(response.status, 400, query);
    assert.equal(calls.length, 0, query);
  }
});

test('an empty cloud library is returned as an empty list', async () => {
  const { collection } = fixture([]);
  assert.deepEqual(await (await collection.GET(new Request('https://planner.test/api/cloud-plans'))).json(), { plans: [], has_more: false, next_offset: null });
});

test('cloud errors return a failure instead of a misleading empty library', async () => {
  const { collection } = fixture([], new Error('Database unavailable'));
  const response = await collection.GET(new Request('https://planner.test/api/cloud-plans'));
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
});

test('a listed plan can be loaded without its edit key', async () => {
  const { individual } = fixture(saved);
  const response = await individual.GET(new Request('https://planner.test/api/cloud-plans/' + saved[0].id), { params: Promise.resolve({ id: saved[0].id }) });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).plan_json, saved[0].plan_json);
});

test('listing a plan does not grant permission to overwrite the original', async () => {
  const { individual } = fixture([{ ...saved[0], edit_key: 'sha256:private' }]);
  const response = await individual.PUT(new Request('https://planner.test/api/cloud-plans/' + saved[0].id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Overwrite', plan: emptyPlan(), expectedUpdatedAt: saved[0].updated_at }),
  }), { params: Promise.resolve({ id: saved[0].id }) });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /cannot edit/);
});

function writableFixture() {
  const rows=[],calls=[]; let filters=[],operation=null,columns=[];
  const project=row=>row&&Object.fromEntries(columns.map(k=>[k,row[k]]));
  const query={
    select(value){columns=value.split(',');return this;},
    eq(k,v){filters.push([k,v]);return this;},
    insert(value){operation={type:'insert',value};return this;},
    update(value){operation={type:'update',value};calls.push('update');return this;},
    async maybeSingle(){
      const row=rows.find(r=>filters.every(([k,v])=>r[k]===v));
      if(operation?.type==='update'&&row)Object.assign(row,operation.value);
      return {data:project(row),error:null};
    },
    async single(){
      const row={id:'44444444-4444-4444-8444-444444444444',updated_at:'2026-10-23T10:00:00.000Z',...operation.value};
      rows.push(row);return {data:project(row),error:null};
    },
  };
  const db={from(name){assert.equal(name,'community_plans','only the new app table may be accessed');calls.push(name);filters=[];operation=null;return query;}};
  const helpers=loadTypeScript('lib/cloudPlans.ts',{'./supabaseAdmin':{getSupabaseAdmin:()=>db},'../public/planner/planner-core.mjs':core});
  return {rows,calls,helpers,collection:loadTypeScript('app/api/cloud-plans/route.ts',{'@/lib/cloudPlans':helpers}),individual:loadTypeScript('app/api/cloud-plans/[id]/route.ts',{'@/lib/cloudPlans':helpers})};
}
test('create and load stay in the separate table on the existing Supabase service',async()=>{
 const f=writableFixture();
 const created=await f.collection.POST(new Request('https://planner.test/api/cloud-plans',{method:'POST',body:JSON.stringify({title:' Example ',plan:emptyPlan()})}));
 assert.equal(created.status,201);const data=await created.json();assert.equal(data.title,'Example');assert.ok(data.edit_key);
 assert.notEqual(f.rows[0].edit_key,data.edit_key);assert.ok(f.rows[0].edit_key.startsWith('sha256:'));
 const loaded=await f.individual.GET(new Request('https://planner.test/api/cloud-plans/'+data.id),{params:Promise.resolve({id:data.id})});
 const view=await loaded.json();assert.deepEqual(view.plan_json,emptyPlan());assert.ok(!('edit_key' in view));
 assert.ok(f.calls.every(name=>name==='community_plans'));
});
test('correct edit key and matching version update a save; stale updates preserve it',async()=>{
 const f=writableFixture(),key='creator-only-key',id='44444444-4444-4444-8444-444444444444';
 f.rows.push({id,title:'Before',edit_key:f.helpers.hash(key),updated_at:'2026-10-23T10:00:00.000Z',plan_json:emptyPlan()});
 const put=expectedUpdatedAt=>f.individual.PUT(new Request('https://planner.test/api/cloud-plans/'+id,{method:'PUT',headers:{Authorization:'Bearer '+key},body:JSON.stringify({title:'After',plan:emptyPlan(),expectedUpdatedAt})}),{params:Promise.resolve({id})});
 const stale=await put('outdated');assert.equal(stale.status,409);assert.equal(f.rows[0].title,'Before');assert.ok(!f.calls.includes('update'));
 const success=await put(f.rows[0].updated_at);assert.equal(success.status,200);assert.equal(f.rows[0].title,'After');assert.ok(!('edit_key' in await success.json()));
});
test('a UUID belonging to another app is not looked up in an existing plan table',async()=>{
 const f=writableFixture(),id='11111111-1111-4111-8111-111111111111';
 const response=await f.individual.GET(new Request('https://planner.test/api/cloud-plans/'+id),{params:Promise.resolve({id})});
 assert.equal(response.status,404);assert.deepEqual(f.calls,['community_plans']);
});
test('old plan formats are rejected before creating cloud data',async()=>{
 const f=writableFixture();const response=await f.collection.POST(new Request('https://planner.test/api/cloud-plans',{method:'POST',body:JSON.stringify({title:'Incompatible',plan:{version:2,players:[],master:{},overrides:{}}})}));
 assert.equal(response.status,400);assert.deepEqual(f.calls,[]);assert.equal(f.rows.length,0);
});
