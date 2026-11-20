// Generic map and assignment tools. Every target, priority and transition is chosen by the user.
export const FORMAT = 'foundry-community-map-v1';
export const PHASES = ['p1', 'p2', 'p3'];
export const BUILDINGS = [
  { name:'Boiler', x:14, y:12, zone:'y', icon:'🔥' },
  { name:'P1', x:14, y:42, zone:'y', icon:'🏰' },
  { name:'R1', x:14, y:72, zone:'y', icon:'🔧' },
  { name:'Mercenary', x:50, y:10, zone:'r', icon:'⚔️' },
  { name:'Middle', x:50, y:34, zone:'r', icon:'🎯' },
  { name:'Munition', x:50, y:58, zone:'r', icon:'💣' },
  { name:'R3', x:37, y:82, zone:'r', icon:'🔧' },
  { name:'Transit', x:63, y:82, zone:'r', icon:'🚉' },
  { name:'R4', x:86, y:12, zone:'b', icon:'🔧' },
  { name:'R2', x:86, y:42, zone:'b', icon:'🔧' },
  { name:'P2', x:86, y:72, zone:'b', icon:'🏰' },
  { name:'Workshop NW', x:29, y:24, zone:'y', icon:'🏭' },
  { name:'Workshop NE', x:71, y:24, zone:'b', icon:'🏭' },
  { name:'Workshop SW', x:29, y:60, zone:'r', icon:'🏭' },
  { name:'Workshop SE', x:71, y:60, zone:'r', icon:'🏭' },
];
const byName = new Map(BUILDINGS.map(b => [b.name,b]));
export const zoneIcon = z => ({y:'🟡',r:'🔴',b:'🔵'}[z] || '');
export const buildingIcon = name => byName.get(name)?.icon || '📍';
export const isSub = name => /(?:\(sub\)|\[sub\])\s*$/i.test(name);
export const displayName = name => String(name).replace(/\s*(?:\(sub\)|\[sub\])\s*$/i,' (Sub)');
export function blankSettings() {
  return Object.fromEntries(PHASES.map((ph,i) => [ph,{label:'Phase '+(i+1),source:null,zones:true,targets:[]} ]));
}
export function defaultTarget(name) {
  if(!byName.has(name)) throw Error('Unknown target building.');
  return {name,size:null,leads:1,zone:byName.get(name).zone};
}
export function deriveAssignments(state, ph) {
  if(ph==='p1') return structuredClone(state.master);
  const source=state.settings[ph].source;
  const out=source ? deriveAssignments(state,source) : {};
  for(const [id,a] of Object.entries(state.overrides[ph] || {})) {
    if(a===null) { delete out[id]; continue; }
    // A deliberate local override takes precedence over an inherited lead/mobile slot.
    if(a.role!=='join') for(const [other,b] of Object.entries(out)) {
      if(other!==id && b.building===a.building && b.role===a.role) delete out[other];
    }
    out[id]={building:a.building,role:a.role};
  }
  return out;
}
export function groupedAssignments(state,ph) {
  const names=new Map(state.players.map(p=>[p.id,p.name])),out={};
  for(const [id,a] of Object.entries(deriveAssignments(state,ph))) {
    if(!names.has(id) || a.building==='Mobile') continue;
    out[a.building] ||= {lead1:[],lead2:[],join:[]};
    out[a.building][a.role].push(id);
  }
  for(const g of Object.values(out)) for(const ids of Object.values(g)) ids.sort((a,b)=>Number(isSub(names.get(a)))-Number(isSub(names.get(b))));
  return out;
}
export function orderedTargets(state,ph) {
  const selected=state.settings[ph].targets.map(t=>({...t}));
  const used=new Set(selected.map(t=>t.name));
  for(const a of Object.values(deriveAssignments(state,ph))) {
    if(a.building!=='Mobile' && !used.has(a.building)) { selected.push(defaultTarget(a.building)); used.add(a.building); }
  }
  return selected;
}
export function fillByPriority(state,ph) {
  const assigned=deriveAssignments(state,ph),added={},queue=state.players.filter(p=>!assigned[p.id]&&!isSub(p.name));
  const targets=state.settings[ph].targets.filter(t=>t.size!==null);
  const count=name=>Object.values(assigned).filter(a=>a.building===name).length;
  const put=(t,role)=>{
    if(!queue.length || count(t.name)>=t.size) return;
    const p=queue.shift(),a={building:t.name,role}; assigned[p.id]=a; added[p.id]=a;
  };
  // Leads are allocated first, using only the user's target order and requested lead counts.
  for(const role of ['lead1','lead2']) for(const t of targets) {
    if(role==='lead2' && t.leads<2) continue;
    if(!Object.values(assigned).some(a=>a.building===t.name&&a.role===role)) put(t,role);
  }
  for(const t of targets) while(queue.length && count(t.name)<t.size) put(t,'join');
  return added;
}
export function phaseOutputs(state,ph) {
  const settings=state.settings[ph],groups=groupedAssignments(state,ph);
  const names=new Map(state.players.map(p=>[p.id,displayName(p.name)]));
  const name=id=>names.get(id)||'(unknown)';
  const discord=['**'+settings.label+'**',''];
  if(settings.targets.length) { discord.push('Priority: '+settings.targets.map((t,i)=>(i+1)+'. '+t.name).join(' → '),''); }
  const game=[settings.label];
  for(const t of orderedTargets(state,ph)) {
    const d=groups[t.name]; if(!d) continue;
    discord.push((settings.zones?zoneIcon(t.zone)+' ':'')+buildingIcon(t.name)+' '+t.name,'Rally 1: '+(d.lead1.map(name).join(', ')||'TBC'));
    if(d.lead2.length) discord.push('Rally 2: '+d.lead2.map(name).join(', '));
    if(d.join.length) discord.push('Joiners: '+d.join.map(name).join(' • '));
    discord.push('');
    const ids=[...d.lead1,...d.lead2,...d.join];
    ids.sort((a,b)=>Number(isSub(names.get(a)))-Number(isSub(names.get(b))));
    game.push((settings.zones?zoneIcon(t.zone)+' ':'')+buildingIcon(t.name)+' '+t.name+': '+ids.map(name).join(', '));
  }
  const mobile=Object.entries(deriveAssignments(state,ph)).filter(([,a])=>a.building==='Mobile').map(([id])=>name(id));
  if(mobile.length) { discord.push('MOBILE WHALE: '+mobile.join(', ')); game.push('🐋 Mobile: '+mobile.join(', ')); }
  if(names.has(state.commander)) { discord.push('BATTLE COMMANDER: '+name(state.commander)); game.push('📣 Commander: '+name(state.commander)); }
  return {discord:discord.join('\n').trim(),game:game.join('\n')};
}
export function splitCopyText(text,limit=3900) {
  const parts=[]; let part='';
  for(const line of text.split('\n')) {
    if(line.length<=limit) {
      if(part && part.length+1+line.length>limit) { parts.push(part); part=''; }
      part+=(part?'\n':'')+line; continue;
    }
    if(part) { parts.push(part); part=''; }
    // Split long roster lines at player separators; never split a Unicode code point.
    const tokens=line.split(/(?<=, | • )/u); let current='';
    for(const token of tokens) {
      if(current && current.length+token.length>limit) { parts.push(current); current=''; }
      for(const point of token) {
        if(current.length+point.length>limit) {parts.push(current);current='';}
        current+=point;
      }
    }
    part=current;
  }
  if(part) parts.push(part);
  return parts.length?parts:[''];
}
function object(value) { return value && typeof value==='object' && !Array.isArray(value); }
export function validatePlan(raw) {
  if(!object(raw) || raw.format!==FORMAT || !Array.isArray(raw.players) || raw.players.length>500) throw Error('Use a plan from this community planner.');
  const ids=new Set();
  const players=raw.players.map(p=>{
    if(!object(p)||typeof p.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(p.id)||['constructor','prototype','__proto__'].includes(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100) throw Error('Invalid or duplicate player.');
    ids.add(p.id); return {id:p.id,name:displayName(p.name.trim())};
  });
  if(!object(raw.settings)) throw Error('Missing phase settings.');
  const settings={};
  for(const [i,ph] of PHASES.entries()) {
    const s=raw.settings[ph];
    if(!object(s)||typeof s.label!=='string'||!s.label.trim()||s.label.length>80||typeof s.zones!=='boolean'||!Array.isArray(s.targets)||s.targets.length>BUILDINGS.length||(s.source!==null&&!PHASES.slice(0,i).includes(s.source))) throw Error('Invalid phase settings.');
    const targets=[],seen=new Set();
    for(const t of s.targets) {
      if(!object(t)||!byName.has(t.name)||seen.has(t.name)||!(t.size===null||(Number.isInteger(t.size)&&t.size>=1&&t.size<=500))||![1,2].includes(t.leads)||!['y','r','b'].includes(t.zone)) throw Error('Invalid target settings.');
      seen.add(t.name); targets.push({name:t.name,size:t.size,leads:t.leads,zone:t.zone});
    }
    settings[ph]={label:s.label.trim(),source:s.source,zones:s.zones,targets};
  }
  function assignments(map,nullable) {
    if(!object(map)||Object.keys(map).length>500) throw Error('Invalid assignments.');
    const result={},slots=new Set();
    for(const [id,a] of Object.entries(map)) {
      if(!ids.has(id)) throw Error('An assignment refers to a missing player.');
      if(a===null&&nullable) { result[id]=null; continue; }
      if(!object(a)||!(a.building==='Mobile'?a.role==='mobile':byName.has(a.building)&&['lead1','lead2','join'].includes(a.role))) throw Error('Invalid assignment slot.');
      const slot=a.building+':'+a.role;
      if(a.role!=='join'&&slots.has(slot)) throw Error('A lead or mobile slot is occupied twice.');
      slots.add(slot); result[id]={building:a.building,role:a.role};
    }
    return result;
  }
  if(!object(raw.overrides)) throw Error('Missing phase overrides.');
  const master=assignments(raw.master,false),overrides={p2:assignments(raw.overrides.p2,true),p3:assignments(raw.overrides.p3,true)};
  if(raw.commander!==null&&!ids.has(raw.commander)) throw Error('Invalid commander.');
  const input=typeof raw.input==='string'?raw.input:players.map(p=>p.name).join('\n');
  if(input.length>100000) throw Error('Roster input is too large.');
  return {format:FORMAT,players,master,overrides,settings,commander:raw.commander,input};
}
