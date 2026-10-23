import {FORMAT,PHASES,BUILDINGS,blankSettings,defaultTarget,deriveAssignments,groupedAssignments,orderedTargets,fillByPriority,phaseOutputs as outputs,validatePlan,displayName,isSub,zoneIcon,buildingIcon,splitCopyText} from './planner-core.mjs';

const $=s=>document.querySelector(s),phases=PHASES;
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let phase='p1',view='planner',players=[],selected=null,filterMissing=false,commander=null;
let master={},overrides={p2:{},p3:{}},settings=blankSettings(),history=[];
const current=()=>({format:FORMAT,players,master,overrides,settings,commander,input:$('#input').value});
const derive=ph=>deriveAssignments(current(),ph);
const groups=ph=>groupedAssignments(current(),ph);
const pname=id=>displayName(players.find(p=>p.id===id)?.name||'(unknown)');
const idExists=id=>players.some(p=>p.id===id);
const playerId=()=> 'p'+Math.random().toString(36).slice(2,11)+Date.now().toString(36);
function snapshot(){history.push(clone({master,overrides,settings,players,commander}));if(history.length>35)history.shift();}
function updateAssignment(id,assignment,ph=phase){
 if(!idExists(id))return;
 const map=derive(ph);
 if(assignment?.role!=='join'&&assignment){
  const other=Object.entries(map).find(([pid,a])=>pid!==id&&a?.building===assignment.building&&a.role===assignment.role);
  if(other){alert('That slot is occupied. Move or unassign '+pname(other[0])+' first.');return;}
 }
 snapshot();
 if(assignment&&assignment.building!=='Mobile'){
  let target=settings[ph].targets.find(t=>t.name===assignment.building);
  if(!target){target=defaultTarget(assignment.building);settings[ph].targets.push(target);}
  if(assignment.role==='lead2')target.leads=2;
 }
 if(ph==='p1'){if(assignment)master[id]=clone(assignment);else delete master[id];}
 else overrides[ph][id]=assignment?clone(assignment):null;
 selected=null;render();
}
function assign(b,role){if(selected)updateAssignment(selected,{building:b,role});}
function playerChip(id,small=false){
 const a=derive(phase)[id],el=document.createElement('button');el.type='button';
 el.className='chip'+(small?' assigned':'')+(selected===id?' selected':'')+' '+(a?(a.building==='Mobile'?'chip-mobile':'chip-green'):'chip-red');
 el.textContent=pname(id)+(small?'':a?' → '+(a.building==='Mobile'?'Mobile':a.building+' '+({lead1:'L1',lead2:'L2',join:'Join'}[a.role]||'')):' → Unassigned');
 el.title=a?`${pname(id)}: ${a.building} ${a.role}`:'Unassigned in this phase';
 el.draggable=true;
 el.onclick=e=>{e.stopPropagation();selected=selected===id?null:id;render()};
 el.ondragstart=e=>{selected=id;e.dataTransfer.setData('text/plain',id)};
 return el;
}
function renderRoster(){
 const r=$('#roster');r.replaceChildren();const data=derive(phase);
 let assigned=0,mobile=0,missing=0;
 for(const p of players){if(data[p.id]){if(data[p.id].building==='Mobile')mobile++;else assigned++;}else missing++;}
 $('#rosterSummary').textContent=`${assigned} assigned · ${mobile} mobile · ${missing} unassigned / ${players.length} players`;
 $('#rosterSummary').className='roster-summary'+(missing?' has-missing':'');
 for(const p of [...players].sort((a,b)=>Number(isSub(a.name))-Number(isSub(b.name)))){if(filterMissing&&data[p.id])continue;r.appendChild(playerChip(p.id));}
 $('#selection').innerHTML=selected?`Selected: <b>${esc(pname(selected))}</b><br><span class="small">Tap a target slot to move this player.</span>`:'Selected: <b>none</b><br><span class="small">Tap a player, then tap a target slot.</span>';
 $('#filterMissing').textContent=filterMissing?'Show all':'Unassigned only';
}
function renderSettings(){
 const s=settings[phase];$('#phaseName').value=s.label;$('#zonesEnabled').checked=s.zones;
 const base=$('#basePhase');base.replaceChildren(new Option('Independent (blank base)',''));
 for(const ph of phases.slice(0,phases.indexOf(phase)))base.add(new Option('Follow '+settings[ph].label,ph));
 base.value=s.source||'';base.disabled=phase==='p1';
 $('#resetOverrides').disabled=phase==='p1'||!s.source;
 const add=$('#targetBuilding');add.replaceChildren();
 for(const b of [...BUILDINGS].sort((a,b)=>a.name.localeCompare(b.name)))if(!s.targets.some(t=>t.name===b.name))add.add(new Option(buildingIcon(b.name)+' '+b.name,b.name));
 $('#addTarget').disabled=!add.options.length;
 const list=$('#targetSettings');list.replaceChildren();
 if(!s.targets.length){const hint=document.createElement('p');hint.className='small';hint.textContent='No target order set. Add targets here or assign a player on the map.';list.appendChild(hint);}
 for(const [i,t] of s.targets.entries()){
  const row=document.createElement('div');row.className='target-row';
  const title=document.createElement('strong');title.textContent=(i+1)+'. '+buildingIcon(t.name)+' '+t.name;
  const tools=document.createElement('div');tools.className='toolbar';
  for(const [text,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.className='btn';b.textContent=text;b.setAttribute('aria-label',`Move ${t.name} ${delta<0?'up':'down'}`);b.disabled=i+delta<0||i+delta>=s.targets.length;b.onclick=()=>{snapshot();[s.targets[i],s.targets[i+delta]]=[s.targets[i+delta],s.targets[i]];render()};tools.appendChild(b);}
  const remove=document.createElement('button');remove.className='btn';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+t.name);
  remove.onclick=()=>{if(Object.values(derive(phase)).some(a=>a.building===t.name))return alert('Move or unassign the players at '+t.name+' before removing this target.');snapshot();s.targets.splice(i,1);render()};tools.appendChild(remove);
  const fields=document.createElement('div');fields.className='target-fields';
  const sizeLabel=document.createElement('label');sizeLabel.textContent='Team size (optional)';const size=document.createElement('input');size.type='number';size.min='1';size.max='500';size.value=t.size??'';size.setAttribute('aria-label',t.name+' team size');
  size.oninput=()=>{const n=size.value===''?null:Number(size.value);if(n!==null&&(!Number.isInteger(n)||n<1||n>500))return;snapshot();t.size=n;renderMap()};sizeLabel.appendChild(size);
  const leadLabel=document.createElement('label');leadLabel.textContent='Rally lead slots';const leads=document.createElement('select');leads.setAttribute('aria-label',t.name+' rally lead slots');leads.add(new Option('1','1'));leads.add(new Option('2','2'));leads.value=String(t.leads);leads.onchange=()=>{snapshot();t.leads=Number(leads.value);render()};leadLabel.appendChild(leads);
  const zoneLabel=document.createElement('label');zoneLabel.className='zone-field';zoneLabel.textContent='Support group';const zone=document.createElement('select');zone.setAttribute('aria-label',t.name+' support group');for(const [v,label] of [['y','🟡 Yellow'],['r','🔴 Red'],['b','🔵 Blue']])zone.add(new Option(label,v));zone.value=t.zone;zone.onchange=()=>{snapshot();t.zone=zone.value;render()};zoneLabel.appendChild(zone);
  fields.append(sizeLabel,leadLabel,zoneLabel);row.append(title,tools,fields);list.appendChild(row);
 }
}
function renderMap(){
 const m=$('#map');m.replaceChildren();const s=settings[phase];
 $('#priority').innerHTML=s.targets.length?s.targets.map((t,i)=>`<span class="badge">${i+1}. ${buildingIcon(t.name)} ${esc(t.name)}${t.size?' · '+t.size+' players':''}</span>`).join(''):'<span class="small">Choose target buildings and priorities, or move players directly on the map.</span>';
 if(s.zones)for(const c of ['zy','zr','zb']){const z=document.createElement('div');z.className='zone '+c;m.appendChild(z)}
 const grouped=groups(phase);
 for(const item of BUILDINGS){
  const b=item.name,t=s.targets.find(t=>t.name===b),z=t?.zone||item.zone;
  const e=document.createElement('div');e.className='building'+(s.zones?' '+z:'')+(t?' anchor':'');e.dataset.building=b;
  e.style.left=item.x+'%';e.style.top=item.y+'%';
  e.innerHTML=`<h3>${t?'<span class="target-number">#'+(s.targets.indexOf(t)+1)+'</span> ':''}${s.zones?zoneIcon(z)+' ':''}${buildingIcon(b)} ${esc(b)}</h3>`;
  const g=grouped[b]||{lead1:[],lead2:[],join:[]};
  for(const role of ['lead1','lead2','join']){
   const slot=document.createElement('div');slot.className='slot'+(role!=='join'?' lead':'')+(selected?' tapready':'');slot.dataset.role=role;
   const label={lead1:'Rally Lead 1',lead2:'Rally Lead 2',join:'Joiners'}[role];const text=document.createElement('span');text.className='slot-label';text.textContent=label;slot.appendChild(text);slot.setAttribute('role','button');slot.tabIndex=0;slot.setAttribute('aria-label',b+' '+label);
   slot.onclick=ev=>{ev.stopPropagation();assign(b,role)};slot.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();assign(b,role)}};
   slot.ondragover=ev=>ev.preventDefault();slot.ondrop=ev=>{ev.preventDefault();selected=ev.dataTransfer.getData('text/plain');assign(b,role)};
   for(const id of g[role])slot.appendChild(playerChip(id,true));e.appendChild(slot);
  }
  if(t?.size){const count=g.lead1.length+g.lead2.length+g.join.length,st=document.createElement('div');st.className='status '+(count===t.size?'good':'warn');st.textContent=count+'/'+t.size+' players';e.appendChild(st);}
  m.appendChild(e);
 }
 const mob=document.createElement('div');mob.className='mobile';mob.innerHTML='🐋 <b>MOBILE WHALE</b>';
 const slot=document.createElement('div');slot.className='slot'+(selected?' tapready':'');slot.setAttribute('role','button');slot.tabIndex=0;slot.setAttribute('aria-label','Mobile Whale');
 const move=()=>{if(selected)updateAssignment(selected,{building:'Mobile',role:'mobile'})};
 slot.onclick=ev=>{ev.stopPropagation();move()};slot.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();move()}};
 slot.ondragover=ev=>ev.preventDefault();slot.ondrop=ev=>{ev.preventDefault();selected=ev.dataTransfer.getData('text/plain');move()};
 const ids=Object.entries(derive(phase)).filter(([,a])=>a?.building==='Mobile').map(([id])=>id);
 if(ids.length)for(const id of ids)slot.appendChild(playerChip(id,true));else slot.textContent='Tap here after selecting a player';mob.appendChild(slot);m.appendChild(mob);
 const lg=document.createElement('div');lg.className='legend';lg.textContent=s.zones?'🟡 Yellow support · 🔴 Red support · 🔵 Blue support':'Support zones hidden';m.appendChild(lg);
}
function commanderOptions(){const sel=$('#commander');sel.innerHTML='<option value="">None</option>'+players.map(p=>`<option value="${esc(p.id)}">${esc(displayName(p.name))}</option>`).join('');sel.value=commander||'';}
function render(){commanderOptions();renderRoster();renderSettings();renderMap();syncTabs();if(view==='board')renderBoard();if(view==='outputs')generateAll();}
function generateAll(){
 for(const ph of phases){const o=outputs(current(),ph);for(const kind of ['game','discord']){
  const el=$('#'+kind+'_'+ph);el.value=o[kind];const row=el.parentElement.querySelector('.copyrow');row.replaceChildren();
  const parts=splitCopyText(o[kind]);parts.forEach((text,i)=>{const b=document.createElement('button');b.className='btn'+(kind==='game'?' primary':'');b.textContent='Copy '+settings[ph].label+' '+(kind==='game'?'in-game':'Discord')+(parts.length>1?' ('+(i+1)+'/'+parts.length+')':'');b.onclick=()=>copy(text);row.appendChild(b)});
 }}
}
function renderBoard(){
 let html='<div class="boardtitle">FOUNDRY PLAN — OVERALL BOARD</div>';
 for(const ph of phases){const s=settings[ph],g=groups(ph);html+=`<div class="boardphase"><div class="boardphasehead"><div>${esc(s.label)}</div><div>Targets in priority order</div></div><div class="boardrow"><div class="boardlabel">${esc(s.label)}</div><div class="boardcards">`;
  for(const t of orderedTargets(current(),ph)){const d=g[t.name];if(!d)continue;
   html+=`<div class="boardcard ${s.zones?t.zone:'neutral'}"><div class="boardcardhead">${s.zones?zoneIcon(t.zone)+' ':''}${buildingIcon(t.name)} ${esc(t.name)}</div><div class="boardbody"><div class="r1">R1: ${esc(d.lead1.map(pname).join(', ')||'TBC')}</div><div class="r2">${d.lead2.length?'R2: '+esc(d.lead2.map(pname).join(', ')):''}</div><div class="joins">${d.join.map(id=>esc(pname(id))).join('<br>')}</div></div></div>`;
  }
  html+='</div></div>';
  const mobile=Object.entries(derive(ph)).filter(([,a])=>a.building==='Mobile').map(([id])=>pname(id));
  if(mobile.length)html+='<div class="boardmobile">🐋 Mobile: '+esc(mobile.join(', '))+'</div>';
  if(commander)html+='<div class="boardrules">📣 Commander: '+esc(pname(commander))+'</div>';
  html+='</div>';
 }$('#overallBoard').innerHTML=html;
}
function setView(v){view=v;for(const name of ['planner','outputs','board'])$('#'+name+'View').classList.toggle('hidden',name!==v);document.querySelectorAll('.viewtab').forEach(t=>t.classList.toggle('active',t.dataset.view===v));if(v==='outputs')generateAll();if(v==='board')renderBoard();}
function syncTabs(){document.querySelectorAll('.tab').forEach(t=>{t.classList.toggle('active',t.dataset.p===phase);t.textContent=settings[t.dataset.p].label});document.querySelectorAll('[data-phase-label]').forEach(t=>t.textContent=settings[t.dataset.phaseLabel].label);$('#transition').disabled=phase===phases.at(-1);}
function nextPhase(){const next=phases[phases.indexOf(phase)+1];if(next){phase=next;render();}}
function autoFill(){
 if(!players.length)return alert('Load a roster first.');
 if(!settings[phase].targets.some(t=>t.size!==null))return alert('Add target buildings and a team size for each target you want to fill.');
 const added=fillByPriority(current(),phase);if(!Object.keys(added).length)return alert('No unassigned main-roster players or empty requested slots. Existing assignments and substitutes were preserved.');
 snapshot();Object.assign(phase==='p1'?master:overrides[phase],added);render();
}
function loadRoster(){
 const names=$('#input').value.split(/\n|,/).map(s=>displayName(s.trim())).filter(Boolean);if(!names.length)return alert('Paste at least one player.');
 if(names.length>500||names.some(n=>n.length>100))return alert('Use up to 500 players, with names no longer than 100 characters.');
 const previous=new Map();for(const p of players){const a=previous.get(p.name)||[];a.push(p.id);previous.set(p.name,a)}
 const next=names.map(name=>({id:previous.get(name)?.shift()||null,name}));
 // Preserve the original app's stable IDs for a roster correction in the same position.
 const claimed=new Set(next.map(p=>p.id).filter(Boolean));
 next.forEach((p,i)=>{if(!p.id&&players[i]&&!claimed.has(players[i].id)){p.id=players[i].id;claimed.add(p.id);}});
 next.forEach(p=>{if(!p.id)p.id=playerId()});
 const removed=players.filter(p=>!next.some(q=>q.id===p.id));if(removed.length&&!confirm(`${removed.length} player(s) will be removed and their assignments deleted. Continue?`))return;
 snapshot();players=next;const ids=new Set(players.map(p=>p.id));for(const m of [master,overrides.p2,overrides.p3])for(const id of Object.keys(m))if(!ids.has(id))delete m[id];
 if(!ids.has(commander))commander=null;render();
}
function planData(){return validatePlan(current());}
function applyPlan(raw,shared=false){
 const d=validatePlan(raw);({players,master,overrides,settings,commander}=d);
 $('#input').value=d.input;selected=null;history=[];render();$('#sharedLoaded').classList.toggle('hidden',!shared);
}
function encode(o){const bytes=new TextEncoder().encode(JSON.stringify(o));let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(s){let v=s.replace(/-/g,'+').replace(/_/g,'/');while(v.length%4)v+='=';const raw=atob(v);return JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));}
async function copy(s){try{await navigator.clipboard.writeText(s);alert('Copied.')}catch(e){const t=document.createElement('textarea');t.value=s;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();alert('Copied, or select and copy manually if your browser blocked it.');}}
function save(){localStorage.setItem('communityFoundryMapV1',JSON.stringify(planData()));alert('Saved on this device.');}
function restore(){const s=localStorage.getItem('communityFoundryMapV1');if(!s)return alert('No saved plan found.');try{applyPlan(JSON.parse(s))}catch(e){alert('Could not read saved plan: '+e.message)}}
function share(){const base=location.href.split('#')[0].split('?')[0];$('#shareLink').value=base+'#plan='+encode(planData());$('#sharePanel').classList.remove('hidden');}
function undo(){if(!history.length)return;({master,overrides,settings,players,commander}=history.pop());$('#input').value=players.map(p=>p.name).join('\n');selected=null;render();}
$('#rosterBtn').onclick=loadRoster;$('#autoFill').onclick=autoFill;
$('#resetOverrides').onclick=()=>{if(phase!=='p1'&&settings[phase].source&&confirm('Clear this phase’s local overrides and follow its chosen base again?')){snapshot();overrides[phase]={};render();}};
$('#phaseName').oninput=()=>{const label=$('#phaseName').value.trim();if(!label)return;snapshot();settings[phase].label=label;syncTabs()};
$('#basePhase').onchange=()=>{snapshot();const source=$('#basePhase').value||null;settings[phase].source=source;if(source&&!settings[phase].targets.length)settings[phase].targets=clone(settings[source].targets);render()};
$('#zonesEnabled').onchange=()=>{snapshot();settings[phase].zones=$('#zonesEnabled').checked;render()};
$('#addTarget').onclick=()=>{const name=$('#targetBuilding').value;if(!name)return;snapshot();settings[phase].targets.push(defaultTarget(name));render()};
$('#transition').onclick=nextPhase;
$('#clear').onclick=()=>{if(!confirm('Clear assignments in this phase?'))return;snapshot();if(phase==='p1')master={};else{const ids=Object.keys(derive(phase));overrides[phase]={};for(const id of ids)overrides[phase][id]=null;}selected=null;render()};
$('#unassign').onclick=()=>{if(selected)updateAssignment(selected,null)};
$('#clearSelection').onclick=()=>{selected=null;render()};$('#filterMissing').onclick=()=>{filterMissing=!filterMissing;renderRoster()};$('#undo').onclick=undo;
$('#save').onclick=save;$('#load').onclick=restore;
$('#reset').onclick=()=>{if(confirm('Reset the entire plan and roster? Saved plans will remain available.')){snapshot();cloudPlan=null;window.history.replaceState(null,'',location.pathname);cloudMessage('New plan — save to cloud to create a new link.');players=[];master={};overrides={p2:{},p3:{}};settings=blankSettings();commander=null;$('#input').value='';selected=null;phase='p1';render()}};
$('#sharePlan').onclick=share;$('#copyShareLink').onclick=()=>copy($('#shareLink').value);$('#closeShare').onclick=()=>$('#sharePanel').classList.add('hidden');
$('#toOutputs').onclick=()=>setView('outputs');$('#generateAll').onclick=generateAll;$('#backPlanner').onclick=()=>setView('planner');
$('#refreshBoard').onclick=renderBoard;$('#backPlannerBoard').onclick=()=>setView('planner');$('#copyBoardText').onclick=()=>copy(phases.map(ph=>outputs(current(),ph).discord).join('\n\n'));
for(const t of document.querySelectorAll('.tab'))t.onclick=()=>{phase=t.dataset.p;render()};for(const t of document.querySelectorAll('.viewtab'))t.onclick=()=>setView(t.dataset.view);
$('#commander').onchange=()=>{snapshot();commander=$('#commander').value||null;render()};

let cloudPlan=null,cloudBusy=false;
function cloudMessage(s){$('#cloudStatus').textContent=s;}
function cloudURL(edit=false){const u=new URL(location.pathname,location.origin);u.searchParams.set('cloud',cloudPlan.id);if(edit)u.hash='edit='+cloudPlan.key;return u.href;}
function rememberCloud(){try{const saves=JSON.parse(localStorage.getItem('communityFoundryCloudPlansV1')||'{}');saves[cloudPlan.id]=cloudPlan;localStorage.setItem('communityFoundryCloudPlansV1',JSON.stringify(saves));}catch(e){}}
async function cloudRequest(url,options={}){const r=await fetch(url,{...options,cache:'no-store',headers:{'Content-Type':'application/json',...(options.headers||{})}});let d;try{d=await r.json()}catch(e){throw Error('Cloud service is unavailable. Your current plan is still on screen.');}if(!r.ok)throw Error(d.error||'Cloud request failed');return d;}
async function saveCloud(asCopy=false){if(cloudBusy)return;if(cloudPlan&&!cloudPlan.key&&!asCopy)return alert('This is a view link. Use Save Cloud Copy to create your own editable plan.');const title=prompt('Cloud plan name',cloudPlan?.title||'Foundry Plan');if(title===null)return;cloudBusy=true;cloudMessage('Saving to cloud…');try{const current=asCopy?null:cloudPlan;const body={title,plan:planData(),expectedUpdatedAt:current?.updated_at};const d=await cloudRequest('/api/cloud-plans'+(current?'/'+current.id:''),{method:current?'PUT':'POST',headers:current?{'Authorization':'Bearer '+current.key}:{},body:JSON.stringify(body)});cloudPlan={id:d.id,title:d.title,updated_at:d.updated_at,key:d.edit_key||current?.key};rememberCloud();window.history.replaceState(null,'',cloudURL(true));cloudMessage('Saved to cloud: '+d.title+' — available in Saved Plans — '+new Date(d.updated_at).toLocaleString());}catch(e){cloudMessage(e.message);alert(e.message);}finally{cloudBusy=false;}}
async function openCloud(link,ask=true){if(cloudBusy)return;let u;try{u=new URL(link,location.origin);if(u.origin!==location.origin)throw Error('Use a cloud plan link from this planner.');}catch(e){return alert(e.message);}const id=u.searchParams.get('cloud');if(!id)return alert('The link must contain a cloud plan ID.');if(ask&&!confirm('Replace the plan on screen with this cloud save? Save on Device first if needed.'))return;cloudBusy=true;cloudMessage('Loading cloud plan…');try{const d=await cloudRequest('/api/cloud-plans/'+encodeURIComponent(id));applyPlan(d.plan_json);let remembered={};try{remembered=JSON.parse(localStorage.getItem('communityFoundryCloudPlansV1')||'{}')[id]||{}}catch(e){}cloudPlan={id:d.id,title:d.title,updated_at:d.updated_at,key:new URLSearchParams(u.hash.slice(1)).get('edit')||remembered.key};rememberCloud();window.history.replaceState(null,'',cloudURL(!!cloudPlan.key));cloudMessage('Loaded '+d.title+(cloudPlan.key?' — editable':' — view link; save a copy to edit'));}catch(e){cloudMessage(e.message);alert(e.message);}finally{cloudBusy=false;}}
function showCloudLinks(){if(!cloudPlan)return alert('Save to Cloud first.');const view=cloudURL();const edit=cloudPlan.key?cloudURL(true):'';$('#shareLink').value='View latest saved plan:\n'+view+(edit?'\n\nEdit link — anyone with this link can update the plan:\n'+edit:'');$('#sharePanel').classList.remove('hidden');}
$('#cloudSave').onclick=()=>saveCloud();$('#cloudNew').onclick=()=>saveCloud(true);$('#cloudLinks').onclick=showCloudLinks;
function savedCloudPlans(){try{return Object.values(JSON.parse(localStorage.getItem('communityFoundryCloudPlansV1')||'{}')).filter(s=>s&&s.id).sort((a,b)=>(Date.parse(b.updated_at)||0)-(Date.parse(a.updated_at)||0));}catch(e){return [];}}
let sharedPlans=[],sharedPlansOffset=0,sharedPlansMore=false,sharedPlansLoading=false,sharedPlansError=false;
let savedPlansSearchTimer=null,savedPlansRequest=0;
function renderSavedPlans(){
 const list=$('#savedPlansList');list.replaceChildren();
 const remembered=new Map(savedCloudPlans().map(s=>[s.id,s]));
 if(!sharedPlans.length&&!sharedPlansLoading&&!sharedPlansError){const p=document.createElement('p');p.textContent=$('#savedPlansSearch').value.trim()?'No matching plans.':'No shared plans yet. Save to Cloud to add your first plan.';list.appendChild(p);}
 for(const s of sharedPlans){
 const b=document.createElement('button');b.className='btn';b.style.cssText='display:block;width:100%;text-align:left;margin:6px 0';
 const title=document.createElement('div');title.textContent=s.title||'Foundry Plan';
 const key=remembered.get(s.id)?.key;
 const detail=document.createElement('div');detail.className='small';detail.textContent=(s.updated_at?new Date(s.updated_at).toLocaleString():'')+' · '+(key?'Can update original':'Save changes as a copy');
 b.append(title,detail);
 b.onclick=()=>{if(cloudBusy)return;const u=new URL(location.pathname,location.origin);u.searchParams.set('cloud',s.id);if(key)u.hash='edit='+key;$('#savedPlansDialog').close();openCloud(u.href);};
 list.appendChild(b);
 }
 $('#moreSavedPlans').classList.toggle('hidden',!sharedPlansMore);
 $('#moreSavedPlans').disabled=sharedPlansLoading;
}
async function loadSavedPlans(append=false){
 const request=++savedPlansRequest,offset=append?sharedPlansOffset:0;
 sharedPlansLoading=true;sharedPlansError=false;
 if(!append){sharedPlans=[];sharedPlansOffset=0;sharedPlansMore=false;}
 $('#savedPlansStatus').textContent='Loading shared plans…';renderSavedPlans();
 try{
  const params=new URLSearchParams({q:$('#savedPlansSearch').value.trim(),offset:String(offset),limit:'50'});
  const data=await cloudRequest('/api/cloud-plans?'+params);
  if(request!==savedPlansRequest)return;
  if(!Array.isArray(data.plans))throw Error('Could not read shared plans. Try Refresh.');
  sharedPlans=Array.from(new Map([...sharedPlans,...data.plans].map(s=>[s.id,s])).values());
  sharedPlansOffset=data.next_offset;sharedPlansMore=!!data.has_more;
  $('#savedPlansStatus').textContent=sharedPlans.length?sharedPlans.length+' shared plan'+(sharedPlans.length===1?'':'s')+' shown.':'';
 }catch(e){
  if(request!==savedPlansRequest)return;
  sharedPlansError=true;$('#savedPlansStatus').textContent='Could not load shared plans. '+e.message+' Try Refresh.';
 }finally{
  if(request===savedPlansRequest){sharedPlansLoading=false;renderSavedPlans();}
 }
}
$('#cloudLoad').onclick=()=>{clearTimeout(savedPlansSearchTimer);$('#savedPlansSearch').value='';$('#savedPlansDialog').showModal();loadSavedPlans();};
$('#closeSavedPlans').onclick=()=>$('#savedPlansDialog').close();
$('#savedPlansDialog').onclose=()=>{clearTimeout(savedPlansSearchTimer);savedPlansRequest++;sharedPlansLoading=false;};
$('#refreshSavedPlans').onclick=()=>{clearTimeout(savedPlansSearchTimer);loadSavedPlans();};
$('#moreSavedPlans').onclick=()=>loadSavedPlans(true);
$('#savedPlansSearch').oninput=()=>{
 clearTimeout(savedPlansSearchTimer);savedPlansRequest++;sharedPlans=[];sharedPlansMore=false;sharedPlansLoading=true;sharedPlansError=false;
 $('#savedPlansStatus').textContent='Searching shared plans…';renderSavedPlans();
 savedPlansSearchTimer=setTimeout(()=>loadSavedPlans(),200);
};


try{if(location.hash.startsWith('#plan='))applyPlan(decode(location.hash.slice(6)),true);else render()}catch(e){alert('Shared link could not be read: '+e.message);render()}
syncTabs();
if(new URLSearchParams(location.search).has('cloud'))openCloud(location.href,false);
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
