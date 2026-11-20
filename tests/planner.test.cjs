const test=require('node:test');
const assert=require('node:assert/strict');
const {FORMAT,PHASES,BUILDINGS,blankSettings,defaultTarget,deriveAssignments,fillByPriority,phaseOutputs,validatePlan,splitCopyText}=require('../public/planner/planner-core.mjs');
function plan(){return {format:FORMAT,players:['One','Two','Three','Four','Five','Reserve [SUB]'].map((name,i)=>({id:'p'+i,name})),master:{},overrides:{p2:{},p3:{}},settings:blankSettings(),commander:null,input:''};}
function target(name,size,leads=1){return {...defaultTarget(name),size,leads};}
test('new phases are independent and contain no targets, assignments or transition map',()=>{
 const p=plan();
 assert.deepEqual(PHASES.map(ph=>p.settings[ph]),[1,2,3].map(i=>({label:'Phase '+i,source:null,zones:true,targets:[]})));
 for(const ph of PHASES)assert.deepEqual(deriveAssignments(p,ph),{});
 assert.equal(BUILDINGS.length,15);
});
test('user priorities and lead counts drive filling, with leads allocated first',()=>{
 const p=plan();p.settings.p1.targets=[target('Boiler',2),target('P2',3,2)];
 assert.deepEqual(fillByPriority(p,'p1'),{
  p0:{building:'Boiler',role:'lead1'},p1:{building:'P2',role:'lead1'},p2:{building:'P2',role:'lead2'},p3:{building:'Boiler',role:'join'},p4:{building:'P2',role:'join'}
 });
 p.settings.p1.targets.reverse();assert.equal(fillByPriority(p,'p1').p0.building,'P2');
});
test('autofill preserves manual assignments, skips substitutes and assumes no missing team size',()=>{
 const p=plan();p.settings.p1.targets=[target('Transit',3),target('R1',null)];p.master.p0={building:'Transit',role:'join'};
 const added=fillByPriority(p,'p1');assert.deepEqual(p.master.p0,{building:'Transit',role:'join'});
 assert.equal(added.p1.building,'Transit');assert.equal(Object.keys(added).length,2);assert.ok(!added.p5);
 assert.ok(Object.values(added).every(a=>a.building!=='R1'));
});
test('phase inheritance is opt-in, copies buildings unchanged and keeps overrides local',()=>{
 const p=plan();p.master.p0={building:'P2',role:'lead1'};assert.deepEqual(deriveAssignments(p,'p2'),{});
 p.settings.p2.source='p1';p.settings.p3.source='p1';assert.equal(deriveAssignments(p,'p2').p0.building,'P2');
 p.overrides.p2.p0={building:'Transit',role:'join'};p.master.p0={building:'R1',role:'lead1'};
 assert.equal(deriveAssignments(p,'p2').p0.building,'Transit');assert.equal(deriveAssignments(p,'p3').p0.building,'R1');
 p.overrides.p2.p0=null;assert.ok(!deriveAssignments(p,'p2').p0);assert.equal(p.master.p0.building,'R1');
});
test('local lead overrides win when an inherited base later changes into that slot',()=>{
 const p=plan();p.settings.p2.source='p1';p.master.p0={building:'R1',role:'lead1'};p.overrides.p2.p1={building:'R1',role:'lead1'};
 assert.deepEqual(deriveAssignments(p,'p2'),{p1:{building:'R1',role:'lead1'}});assert.ok(p.master.p0);
});
test('compact output uses target order, leads first, consistent icons and substitutes last',()=>{
 const p=plan();p.settings.p1.targets=[target('R1',4)];
 p.master={p5:{building:'R1',role:'join'},p3:{building:'R1',role:'join'},p1:{building:'R1',role:'lead2'},p0:{building:'R1',role:'lead1'}};
 const out=phaseOutputs(p,'p1');assert.equal(out.game,'Phase 1\n🟡 🔧 R1: One, Two, Four, Reserve (Sub)');
 assert.match(out.discord,/🟡 🔧 R1/);p.settings.p1.zones=false;assert.ok(!phaseOutputs(p,'p1').discord.includes('🟡'));
 p.settings.p2.source='p1';assert.match(phaseOutputs(p,'p2').game,/🔧 R1: One, Two, Four, Reserve \(Sub\)/);
});
test('saved plans round-trip chosen phase settings and strip unknown hidden configuration',()=>{
 const p=plan();p.settings.p2.source='p1';p.settings.p1.targets=[target('R1',4)];p.master.p0={building:'R1',role:'lead1'};
 p.routes={secret:'must not persist'};p.settings.p1.hidden='must not persist';p.master.p0.instruction='must not persist';
 const result=validatePlan(JSON.parse(JSON.stringify(p)));
 assert.equal(result.settings.p1.targets[0].size,4);assert.equal(result.settings.p2.source,'p1');assert.ok(!JSON.stringify(result).includes('must not persist'));
 assert.throws(()=>validatePlan({version:2,players:[],master:{},overrides:{}}),/community planner/);
});
test('malformed targets, duplicate lead slots and cyclic phase sources are rejected',()=>{
 const p=plan();p.settings.p1.targets=[target('R1',3)];p.settings.p1.targets[0].name='Unknown';assert.throws(()=>validatePlan(p),/target/);
 const q=plan();q.master={p0:{building:'R1',role:'lead1'},p1:{building:'R1',role:'lead1'}};assert.throws(()=>validatePlan(q),/occupied twice/);
 const r=plan();r.settings.p2.source='p3';assert.throws(()=>validatePlan(r),/phase settings/);
});
test('long copy output is split below Discord limits without losing names or Unicode pairs',()=>{
 const names=Array.from({length:450},(_,i)=>'Player '+i+' 🎯');const text='Phase 1\n🔧 R1: '+names.join(', ');
 const parts=splitCopyText(text);assert.ok(parts.length>1);assert.equal(parts.join(''),text.replace('\n',''));
 assert.ok(parts.every(s=>s.length<=3900&&!/[\uD800-\uDBFF]$/.test(s)&&! /^[\uDC00-\uDFFF]/.test(s)));
 for(const name of names)assert.ok(parts.join('').includes(name));
});

test('in-game lines use each phase saved support colour, including inherited assignments',()=>{
 const p=plan();p.players=[{id:'lead',name:'Jim2'},{id:'join',name:'Jake'},{id:'sub',name:'Pej [SUB]'}];
 p.master={sub:{building:'Boiler',role:'join'},lead:{building:'Boiler',role:'lead1'},join:{building:'Boiler',role:'join'}};
 for(const [i,ph] of PHASES.entries()){
  p.settings[ph].source=ph==='p1'?null:'p1';
  p.settings[ph].targets=[{...target('Boiler',3),zone:['y','r','b'][i]}];
 }
 const before=JSON.stringify(p);
 for(const [i,ph] of PHASES.entries()){
  const expected=['🟡','🔴','🔵'][i]+' 🔥 Boiler: Jim2, Jake, Pej (Sub)';
  assert.equal(phaseOutputs(p,ph).game,p.settings[ph].label+'\n'+expected);
 }
 assert.equal(JSON.stringify(p),before);
 p.settings.p3.zones=false;
 assert.equal(phaseOutputs(p,'p3').game,'Phase 3\n🔥 Boiler: Jim2, Jake, Pej (Sub)');
});
