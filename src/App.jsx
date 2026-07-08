import { useState, useEffect, useMemo, useRef } from "react";
import { useRealtimeLeads } from './components/RealtimeLeads';
import { supabase, leadFromDb, leadToDb, leaveFromDb, leaveToDb, bankPaymentFromDb, bankPaymentToDb, notifFromDb, notifToDb, profileFromDb, punchStateFromDb } from "./supabase.js";
import { syncLeadToSheet, syncAllLeadsToSheet, checkForNewLeads, rowToLead, isConfigured as isSheetsConfigured, MASTER_SHEET_ID, MASTER_SHEET_NAME } from "./sheets.js";
import { initPushNotifications, isPushSupported } from "./push.js";
import { notifyNewLead, notifyPayment, notifyCallLogged, notifyStageChange, notifyAssignment, notifyHotLead } from "./notifications.js";
const FONT="Satoshi,sans-serif",MONO="JetBrains Mono,monospace";
const T={bg:"#0A0A0A",s1:"#111111",s2:"#1A1A1A",s3:"#111111",bdr:"#1f1f1f",inp:"#1A1A1A",tx:"#F5F5F7",tx2:"#86868B",tx3:"#48484A",acc:"#C9A84C",accD:"#A8893A",accL:"#E8C96A",accBg:"#C9A84C1f",grn:"#32D74B",grnD:"#14532d",grnBg:"#32D74B10",red:"#FF453A",redD:"#7f1d1d",redBg:"#FF453A10",yel:"#eab308",yelD:"#713f12",yelBg:"#eab30810",blu:"#0A84FF",bluBg:"#0A84FF10",pur:"#a07cf5",purBg:"#a07cf510",cyn:"#22c3d6",cynBg:"#22c3d610"};
const TODAY="2026-05-02",uid=()=>Math.random().toString(36).slice(2,9);
const fmt=n=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
const fS=n=>n>=1e7?("₹"+(n/1e7).toFixed(1)+"Cr"):n>=1e5?("₹"+(n/1e5).toFixed(1)+"L"):n>=1e3?("₹"+(n/1e3).toFixed(0)+"K"):fmt(n);
const pc=(a,b)=>b?((a/b)*100).toFixed(1):0;
/* Persist a lead row to Supabase with VISIBLE error reporting.
   Silent .update() failures (most often a missing column like `pipeline`)
   were the reason edits appeared to "revert on refresh" — the local state
   changed but the write was rejected by Postgres and never reached the DB. */
const saveLead=(u)=>{
  const row=leadToDb(u);
  console.log('[saveLead] → writing',{id:u.id,pipeline:row.pipeline,setterStage:row.setter_stage,closerStage:row.closer_stage});
  /* .select('id') lets us catch the SILENT failure mode: an UPDATE that returns
     no error but touches 0 rows (RLS blocked, or the id doesn't exist) — which
     is exactly how "changes revert on refresh" looks when the DB never persisted. */
  return supabase.from('leads').update(row).eq('id',u.id).select('id').then(({data,error})=>{
    if(error){console.error('[saveLead] ✗ FAILED',{id:u.id,code:error.code,message:error.message,details:error.details,hint:error.hint});alert('Could not save changes to the database: '+(error.message||error.code||'unknown error'));return;}
    if(!data||data.length===0){console.warn('[saveLead] ⚠ 0 rows updated — not persisted (RLS blocked or id not found)',{id:u.id});alert('Save did not persist: no matching row, or blocked by a security policy.');return;}
    console.log('[saveLead] ✓ persisted',{id:u.id,rows:data.length});
  });
};
const dBtw=(a,b)=>Math.ceil((new Date(b)-new Date(a))/864e5);
const USERS=[];

/* ICONS - pure path strings, no JSX */
const ICON_PATHS={
dash:"M3,3h7v7H3ZM14,3h7v4H14ZM14,11h7v10H14ZM3,14h7v7H3Z",
sales:"M3,3v18h18 M7,16l4-6l4,4l5-8",
fin:"M2,6h20v14H2ZM2,10h20M6,14h2M12,14h6",
zap:"M13,2L3,14h9l-1,8l10-12h-9l1-8z",
task:"M9,11l3,3l8-8M3,3h18v18H3Z",
users:"M17,21v-2a4,4,0,0,0-4-4H5a4,4,0,0,0-4,4v2M9,11a4,4,0,1,0,0-8a4,4,0,0,0,0,8M23,21v-2a4,4,0,0,0-3-3.87M16,3.13a4,4,0,0,1,0,7.75",
phone:"M22,16.92v3a2,2,0,0,1-2.18,2a19.79,19.79,0,0,1-8.63-3.07a19.5,19.5,0,0,1-6-6A19.79,19.79,0,0,1,2.18,4.11A2,2,0,0,1,4.11,2h3a2,2,0,0,1,2,1.72c.13.81.36,1.6.7,2.35a2,2,0,0,1-.45,2.11L8.09,9.91a16,16,0,0,0,6,6l1.27-1.27a2,2,0,0,1,2.11-.45c.75.34,1.54.57,2.35.7A2,2,0,0,1,22,16.92z",
mail:"M2,4h20v16H2ZM22,4L12,12L2,4",
plus:"M12,5v14M5,12h14",
x:"M18,6L6,18M6,6l12,12",
bell:"M18,8A6,6,0,0,0,6,8c0,7-3,9-3,9h18s-3-2-3-9M13.73,21a2,2,0,0,1-3.46,0",
chk:"M20,6L9,17l-5-5",
dollar:"M12,1v22M17,5H9.5a3.5,3.5,0,0,0,0,7h5a3.5,3.5,0,0,1,0,7H6",
inv:"M14,2H6a2,2,0,0,0-2,2v16a2,2,0,0,0,2,2h12a2,2,0,0,0,2-2V8ZM14,2v6h6M8,13h8M8,17h8",
send:"M22,2L11,13M22,2l-7,20l-4-9l-9-4l20-7z",
clock:"M12,12m-10,0a10,10,0,1,0,20,0a10,10,0,1,0-20,0M12,6v6l4,2",
alert:"M10.29,3.86L1.82,18a2,2,0,0,0,1.71,3h16.94a2,2,0,0,0,1.71-3L13.71,3.86a2,2,0,0,0-3.42,0zM12,9v4M12,17h.01",
aUp:"M12,19V5M5,12l7-7l7,7",
aDown:"M12,5v14M19,12l-7,7l-7-7",
menu:"M3,12h18M3,6h18M3,18h18",
eye:"M1,12s4-8,11-8s11,8,11,8s-4,8-11,8s-11-8-11-8zM12,12m-3,0a3,3,0,1,0,6,0a3,3,0,1,0-6,0",
tgt:"M12,12m-10,0a10,10,0,1,0,20,0a10,10,0,1,0-20,0M12,12m-6,0a6,6,0,1,0,12,0a6,6,0,1,0-12,0M12,12m-2,0a2,2,0,1,0,4,0a2,2,0,1,0-4,0",
link:"M10,13a5,5,0,0,0,7.54.54l3-3a5,5,0,0,0-7.07-7.07l-1.72,1.71M14,11a5,5,0,0,0-7.54-.54l-3,3a5,5,0,0,0,7.07,7.07l1.71-1.71",
pct:"M6.5,6.5m-2.5,0a2.5,2.5,0,1,0,5,0a2.5,2.5,0,1,0-5,0M17.5,17.5m-2.5,0a2.5,2.5,0,1,0,5,0a2.5,2.5,0,1,0-5,0M20,4L4,20",
play:"M5,3L19,12L5,21Z",
pause:"M6,4h4v16H6ZM14,4h4v16H14Z",
repeat:"M17,1l4,4l-4,4M3,11V9a4,4,0,0,1,4-4h14M7,23l-4-4l4-4M21,13v2a4,4,0,0,1-4,4H3",
logout:"M9,21H5a2,2,0,0,1-2-2V5a2,2,0,0,1,2-2h4M16,17l5-5l-5-5M21,12H9",
punch:"M12,12m-10,0a10,10,0,1,0,20,0a10,10,0,1,0-20,0M12,6v6l4,2M8,1h8",
sheet:"M3,3h18v18H3ZM3,9h18M3,15h18M9,3v18M15,3v18",
whop:"M12,2L2,7l10,5l10-5ZM2,17l10,5l10-5M2,12l10,5l10-5",
bar:"M12,20V10M18,20V4M6,20v-4",
settings:"M12,15a3,3,0,1,0,0-6a3,3,0,0,0,0,6z M19.4,15a1.65,1.65,0,0,0,0.33,1.82l0.06,0.06a2,2,0,1,1-2.83,2.83l-0.06-0.06a1.65,1.65,0,0,0-1.82-0.33a1.65,1.65,0,0,0-1,1.51V21a2,2,0,1,1-4,0v-0.09a1.65,1.65,0,0,0-1.07-1.51a1.65,1.65,0,0,0-1.82,0.33l-0.06,0.06a2,2,0,1,1-2.83-2.83l0.06-0.06a1.65,1.65,0,0,0,0.33-1.82a1.65,1.65,0,0,0-1.51-1H3a2,2,0,1,1,0-4h0.09a1.65,1.65,0,0,0,1.51-1.07a1.65,1.65,0,0,0-0.33-1.82l-0.06-0.06a2,2,0,1,1,2.83-2.83l0.06,0.06a1.65,1.65,0,0,0,1.82,0.33H9a1.65,1.65,0,0,0,1-1.51V3a2,2,0,1,1,4,0v0.09a1.65,1.65,0,0,0,1,1.51a1.65,1.65,0,0,0,1.82-0.33l0.06-0.06a2,2,0,1,1,2.83,2.83l-0.06,0.06a1.65,1.65,0,0,0-0.33,1.82V9a1.65,1.65,0,0,0,1.51,1H21a2,2,0,1,1,0,4h-0.09a1.65,1.65,0,0,0-1.51,1z",
cal:"M3,4h18v18H3ZM3,10h18M8,2v4M16,2v4",
edit:"M11,4H4a2,2,0,0,0-2,2v14a2,2,0,0,0,2,2h14a2,2,0,0,0,2-2v-7M18.5,2.5a2.121,2.121,0,1,1,3,3L12,15l-4,1l1-4z",
trash:"M3,6h18M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2",
file:"M14,2H6a2,2,0,0,0-2,2v16a2,2,0,0,0,2,2h12a2,2,0,0,0,2-2V8z M14,2v6h6",
wa:"M17.472,14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94,1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198,0-.52.074-.792.372-.272.297-1.04,1.016-1.04,2.479,0,1.462,1.065,2.875,1.213,3.074.149.198,2.096,3.2,5.077,4.487.709.306,1.262.489,1.694.625.712.227,1.36.195,1.871.118.571-.085,1.758-.719,2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12,2a10,10,0,0,0-8.59,15.09L2,22l5.04-1.39A10,10,0,1,0,12,2z",
};

function Ic({t,s=18,c="currentColor"}){
  const d=ICON_PATHS[t];
  if(!d)return null;
  return(
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d}/>
    </svg>
  );
}

/* PRIMITIVES */
function Bd({text,color,solid}){
  const c=(solid?{grn:{bg:T.grn,fg:"#000"},red:{bg:T.red,fg:"#fff"},yel:{bg:T.yel,fg:"#000"},blu:{bg:T.blu,fg:"#fff"},pur:{bg:T.pur,fg:"#fff"},acc:{bg:T.acc,fg:"#000"},cyn:{bg:T.cyn,fg:"#000"},def:{bg:T.s2,fg:T.tx2}}
    :{grn:{bg:T.grnBg,fg:T.grn},red:{bg:T.redBg,fg:T.red},yel:{bg:T.yelBg,fg:T.yel},blu:{bg:T.bluBg,fg:T.blu},pur:{bg:T.purBg,fg:T.pur},acc:{bg:T.accBg,fg:T.acc},cyn:{bg:T.cynBg,fg:T.cyn},def:{bg:T.s2,fg:T.tx2}})[color||"def"]||{bg:T.s2,fg:T.tx2};
  return <span style={{display:"inline-flex",padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:600,background:c.bg,color:c.fg,letterSpacing:.4,whiteSpace:"nowrap",textTransform:"uppercase"}}>{text}</span>;
}
function Pill({l,active,onClick,n}){return <button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:7,fontSize:11,fontWeight:active?600:500,background:active?T.accBg:T.s1,color:active?T.acc:T.tx3,border:"1px solid "+(active?T.accD+"40":T.bdr),cursor:"pointer",fontFamily:FONT}}>{l}{n!==undefined&&<span style={{fontFamily:MONO,fontSize:9,opacity:.7}}>{n}</span>}</button>}
function Btn({children,onClick,v,icon,sm,full}){
  const styles={pri:{bg:T.acc,c:"#000",b:"none"},dan:{bg:T.red,c:"#fff",b:"none"},ok:{bg:T.grnBg,c:T.grn,b:"1px solid "+T.grnD+"30"},def:{bg:T.s2,c:T.tx,b:"1px solid "+T.bdr}};
  const s=styles[v||"def"]||styles.def;
  return <button onClick={onClick} onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.1)"}} onMouseLeave={e=>{e.currentTarget.style.filter="none"}} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:sm?"5px 10px":"8px 16px",borderRadius:8,fontSize:sm?11:13,fontWeight:600,background:s.bg,color:s.c,border:s.b,cursor:"pointer",fontFamily:FONT,width:full?"100%":"auto",whiteSpace:"nowrap",transition:"filter .15s ease"}}>{icon&&<Ic t={icon} s={sm?12:14}/>}{children}</button>;
}
function Inp({label,value,onChange,ph,type,mono,ta}){
  const sty={padding:"8px 12px",borderRadius:7,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:12,fontFamily:mono?MONO:FONT,outline:"none",width:"100%",boxSizing:"border-box"};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:3}}>
      {label&&<label style={{fontSize:10,color:T.tx3,fontWeight:500,textTransform:"uppercase",letterSpacing:.6}}>{label}</label>}
      {ta?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={3} style={{...sty,resize:"vertical"}}/>
        :<input type={type||"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={sty}/>}
    </div>
  );
}
function Sel({label,value,onChange,opts}){return(
  <div style={{display:"flex",flexDirection:"column",gap:3}}>
    {label&&<label style={{fontSize:10,color:T.tx3,fontWeight:500,textTransform:"uppercase",letterSpacing:.6}}>{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"8px 12px",borderRadius:7,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:12,fontFamily:FONT,outline:"none"}}>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
  </div>
)}
function St({label,value,sub,trend,icon,color}){
  const cl=color||T.acc;
  return(
    <div style={{background:T.s1,borderRadius:16,padding:20,border:"1px solid "+T.bdr,flex:1,minWidth:0,transition:"border-color .15s ease,transform .15s ease"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.16)";e.currentTarget.style.transform="translateY(-1px)"}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bdr;e.currentTarget.style.transform="translateY(0)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:11,color:T.tx3,fontWeight:500,textTransform:"uppercase",letterSpacing:.8}}>{label}</span>
        <div style={{width:32,height:32,borderRadius:8,background:cl+"1f",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t={icon||"tgt"} s={15} c={cl}/></div>
      </div>
      <div style={{fontSize:28,fontWeight:600,color:T.tx,letterSpacing:-.8}}>{value}</div>
      {(sub||trend!==undefined)&&<div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,marginTop:6}}>
        {trend!==undefined&&<span style={{color:trend>=0?T.grn:T.red,display:"flex",alignItems:"center",gap:2,fontWeight:600}}><Ic t={trend>=0?"aUp":"aDown"} s={11}/>{Math.abs(trend)}%</span>}
        {sub&&<span style={{color:T.tx2}}>{sub}</span>}
      </div>}
    </div>
  );
}
function Bar({v,max,color,h}){return <div style={{width:"100%",height:h||5,background:T.bdr+"50",borderRadius:99,overflow:"hidden"}}><div style={{width:Math.min((v/max)*100,100)+"%",height:"100%",background:color||T.acc,borderRadius:99,transition:"width .5s"}}/></div>}
function Crd({children,title,action,style:sx}){return(
  <div style={{background:T.s1,borderRadius:16,border:"1px solid "+T.bdr,overflow:"hidden",...sx}}>
    {(title||action)&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"15px 20px",borderBottom:"1px solid "+T.bdr,flexWrap:"wrap",gap:6}}><h3 style={{margin:0,fontSize:15,fontWeight:600,letterSpacing:-.2,color:T.tx}}>{title}</h3>{action}</div>}
    <div style={{padding:"18px 20px"}}>{children}</div>
  </div>
)}
function Mod({title,onClose,children,wide}){return(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1e3,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}} onClick={onClose}>
    <div style={{background:"#1C1C1E",borderRadius:16,width:"92%",maxWidth:wide?760:540,maxHeight:"86vh",display:"flex",flexDirection:"column",border:"1px solid "+T.bdr,boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 22px",borderBottom:"1px solid "+T.bdr}}><h2 style={{margin:0,fontSize:17,fontWeight:600,letterSpacing:-.3,color:T.tx}}>{title}</h2><button onClick={onClose} style={{width:28,height:28,borderRadius:99,background:T.s2,border:"none",color:T.tx2,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t="x" s={15}/></button></div>
      <div style={{padding:22,overflowY:"auto",flex:1}}>{children}</div>
    </div>
  </div>
)}
function TabBar({tabs,a,onChange}){return <div style={{display:"flex",gap:2,background:T.s1,borderRadius:8,padding:2,border:"1px solid "+T.bdr,flexWrap:"wrap"}}>{tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} style={{padding:"6px 14px",borderRadius:6,fontSize:11,fontWeight:a===t.id?600:500,background:a===t.id?T.s3:"transparent",color:a===t.id?T.tx:T.tx3,border:"none",cursor:"pointer",fontFamily:FONT}}>{t.l}</button>)}</div>}
function Av({name,sz,color}){const s=sz||32;return <div style={{width:s,height:s,borderRadius:99,background:color||"linear-gradient(135deg,"+T.accD+","+T.acc+")",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:s*.34,fontFamily:MONO,flexShrink:0}}>{(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>}

/* DATA */
/* Default SETTER pipeline stages */
const DEFAULT_SETTER_STAGES=[
{id:"new",l:"New Lead",c:T.blu},
{id:"call_booked",l:"Call Booked",c:T.cyn},
{id:"showup",l:"Show Up",c:T.acc},
{id:"no_showup",l:"No Show Up",c:"#f97316"},
{id:"follow_up",l:"Follow Up",c:T.yel},
{id:"qualified",l:"Qualified",c:T.pur},
{id:"not_qualified",l:"Not Qualified",c:T.red},
{id:"won",l:"Won",c:T.grn},
{id:"lost",l:"Lost",c:T.tx3},
];
/* Default CLOSER pipeline stages */
const DEFAULT_CLOSER_STAGES=[
{id:"new",l:"New Lead",c:T.blu},
{id:"showup",l:"Show Up",c:T.acc},
{id:"no_showup",l:"No Show Up",c:"#f97316"},
{id:"follow_up",l:"Follow Up",c:T.yel},
{id:"qualified",l:"Qualified",c:T.pur},
{id:"not_qualified",l:"Not Qualified",c:T.red},
{id:"won",l:"Won",c:T.grn},
{id:"lost",l:"Lost",c:T.tx3},
];

/* Default pipelines — each pipeline filters leads by source(s) */
const DEFAULT_PIPELINES=[
{id:"all",name:"All Leads",sources:[],color:T.tx,icon:"users"},
{id:"webinar",name:"Webinar",sources:["webinar","FACEBOOK","bio","sp_auto_dm","direct"],color:T.cyn,icon:"play"},
{id:"instagram-outbound",name:"Instagram Outbound",sources:["instagram-outbound"],color:"#e1306c",icon:"link"},
{id:"instagram-inbound",name:"Instagram Inbound",sources:["instagram-inbound"],color:"#833AB4",icon:"link"},
{id:"whop-leads",name:"Whop Leads",sources:["whop-course-buyer"],color:T.pur,icon:"whop"},
];

const SETTER_STAGES=DEFAULT_SETTER_STAGES;
const CLOSER_STAGES=DEFAULT_CLOSER_STAGES;
const STAGES=SETTER_STAGES;
const SOURCES=["webinar","FACEBOOK","bio","sp_auto_dm","direct","Whop (Course Buyer)","LinkedIn","Website","Referral","Cold Call","Cold Email","Google Ads","Instagram","Partner","Inbound Call"];const stL=(s,kind)=>(kind==="closer"?CLOSER_STAGES:SETTER_STAGES).find(x=>x.id===s)?.l||s;
const stC=(s,kind)=>(kind==="closer"?CLOSER_STAGES:SETTER_STAGES).find(x=>x.id===s)?.c||T.tx3;

/* Work hours: leads only count as "hot" between 10:00 and 19:00 local time.
   Outside hours, new leads are "cold" until the next workday window. */
const WORK_HOUR_START=10,WORK_HOUR_END=19;
const isWorkHours=(d=new Date())=>{const h=d.getHours();return h>=WORK_HOUR_START&&h<WORK_HOUR_END;};

/* Heat calculation:
   - Token paid → hot for 48h regardless of time-of-day (real money in)
   - New lead → hot ONLY if created within last 1 hour AND we are in work hours
   - Otherwise warm/cold based on age */
const calcHeat=(lead)=>{
  const now=Date.now();
  if(lead.tokenPaidAt){
    const dt=new Date(lead.tokenPaidAt).getTime();
    const hrs=(now-dt)/(1000*60*60);
    if(hrs<48) return "hot";
    return "cold";
  }
  if(lead.createdAt){
    const dt=new Date(lead.createdAt).getTime();
    const mins=(now-dt)/(1000*60);
    if(mins<60&&isWorkHours()) return "hot";
    if(mins<60*24) return "warm";
    return "cold";
  }
  return lead.priority||"warm";
};
const heatColor=h=>h==="hot"?"red":h==="warm"?"yel":"blu";
const fmtDT=ts=>{if(!ts)return"—";const d=new Date(ts);return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"})+" "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})};
const waUrl=(phone,name)=>{if(!phone)return null;const d=phone.replace(/\D/g,"");if(!d)return null;return"https://wa.me/"+d+"?text=Hi%20"+encodeURIComponent((name||"").split(" ")[0]||"there")};

/* COMPANY INFO — used in invoices */
const COMPANY={name:"HTSyndicate Pvt Ltd",address:"Mumbai, Maharashtra, India 400001",email:"billing@htsyndicate.com",phone:"+91 98765 43210",gstin:"27AABCH1234A1Z5",pan:"AABCH1234A",bank:{name:"HDFC Bank",account:"5012XXXXXXXX",ifsc:"HDFC0001234",upi:"htsyndicate@hdfc"}};


/* ═══ LOGIN ═══ */
function LoginPage(){
const[mode,setMode]=useState("signin");/* signin | signup */
const[em,setEm]=useState("");const[pw,setPw]=useState("");const[name,setName]=useState("");
const[role,setRole]=useState("sales");const[subrole,setSubrole]=useState("setter");
const[err,setErr]=useState("");const[loading,setLoading]=useState(false);const[showDemo,setShowDemo]=useState(false);
const[connStatus,setConnStatus]=useState("checking");/* checking | ok | error */

useEffect(()=>{
  supabase.auth.getSession().then(()=>{
    console.log("[LOGIN] Supabase connection OK");
    setConnStatus("ok");
  }).catch(e=>{
    console.log("[LOGIN] Supabase connection FAILED:",e);
    setConnStatus("error");
  });
},[]);

const handleSignIn=async()=>{
  console.log("[LOGIN] Sign in clicked — email:",em,"pw:",(pw?"(filled)":"(empty)"));
  setErr("");setLoading(true);
  if(!em||!pw){
    console.log("[LOGIN] Missing fields");
    setErr("Please enter your email and password.");setLoading(false);return;
  }
  console.log("[LOGIN] Calling Supabase auth...");
  try{
    const{data,error}=await supabase.auth.signInWithPassword({email:em.trim(),password:pw});
    console.log("[LOGIN] Response — data:",data,"error:",error);
    if(error){
      console.log("[LOGIN] Auth error:",error.message,error.status);
      setErr(error.message);
    }
    else if(!data?.session){
      console.log("[LOGIN] No session returned");
      setErr("Sign in failed — no session returned. Try again.");
    }
    else{
      console.log("[LOGIN] SUCCESS — user:",data.session.user.email);
    }
  }catch(e){
    console.log("[LOGIN] Exception:",e);
    setErr("Connection error: "+e.message+". Check internet/console.");
  }finally{
    setLoading(false);
  }
};

const handleSignUp=async()=>{
  setErr("");setLoading(true);
  if(!name||!em||!pw){setErr("Please fill all fields");setLoading(false);return}
  if(pw.length<6){setErr("Password must be at least 6 characters");setLoading(false);return}
  const dept=role==="admin"?"all":role==="sales"?"sales":role==="finance"?"finance":"tech";
  const finalSubrole=role==="sales"?subrole:role==="admin"?"admin":role;
  const displayName=role==="sales"?(name+" ("+(subrole==="setter"?"Setter":"Closer")+")"):name+(role==="admin"?" (Admin)":role==="finance"?" (Finance)":" (Tech)");
  console.log("[SIGNUP] Creating account:",em.trim(),"role:",role);
  /* Store role in Supabase user_metadata — persists without a profiles table */
  const{data,error}=await supabase.auth.signUp({
    email:em.trim(),password:pw,
    options:{data:{full_name:displayName,app_role:role,app_subrole:finalSubrole,app_dept:dept}}
  });
  if(error){setErr(error.message);setLoading(false);return}
  if(data.session){
    console.log("[SIGNUP] Signed in immediately — onAuthStateChange handles nav");
    /* No profile insert here — onAuthStateChange will fire and sync in background */
  }else{
    setErr("Check your email and click the confirmation link, then sign in here.");
    setMode("signin");
  }
  setLoading(false);
};

const handleGoogle=async()=>{
  setErr("");
  const{error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
  if(error)setErr(error.message);
};

return(
<div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT,padding:20}}>
<div style={{width:"100%",maxWidth:420,padding:32,background:T.s2,borderRadius:16,border:"1px solid "+T.bdr,boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>
{/* Logo */}
<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:26}}>
<img src="/logo.png" alt="HTSyndicate" style={{height:60,objectFit:"contain",display:"block"}}/>
<div style={{fontSize:12,color:T.tx3}}>{mode==="signin"?"Welcome back":"Create your account"}</div>
</div>

{/* Tab switcher */}
<div style={{display:"flex",gap:0,background:T.s1,borderRadius:8,padding:3,border:"1px solid "+T.bdr,marginBottom:20}}>
<button onClick={()=>{setMode("signin");setErr("")}} style={{flex:1,padding:"8px 12px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:12,fontWeight:mode==="signin"?700:500,background:mode==="signin"?T.s3:"transparent",color:mode==="signin"?T.tx:T.tx3}}>Sign In</button>
<button onClick={()=>{setMode("signup");setErr("")}} style={{flex:1,padding:"8px 12px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:12,fontWeight:mode==="signup"?700:500,background:mode==="signup"?T.s3:"transparent",color:mode==="signup"?T.tx:T.tx3}}>Sign Up</button>
</div>

{/* Google button */}
<button onClick={handleGoogle} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,width:"100%",padding:"11px 16px",borderRadius:8,border:"1px solid "+T.bdr,background:"#fff",color:"#3c4043",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:FONT,marginBottom:14}}>
<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
<span>{mode==="signin"?"Sign in with Google":"Sign up with Google"}</span>
</button>

<div style={{display:"flex",alignItems:"center",gap:10,margin:"4px 0 16px"}}>
<div style={{flex:1,height:1,background:T.bdr}}/>
<span style={{fontSize:10,color:T.tx3,textTransform:"uppercase",letterSpacing:.6,fontWeight:500}}>or</span>
<div style={{flex:1,height:1,background:T.bdr}}/>
</div>

{/* Form */}
<div style={{display:"flex",flexDirection:"column",gap:12}}>
{mode==="signup"&&<Inp label="Full Name" value={name} onChange={setName} ph="Your name"/>}
<Inp label="Email" value={em} onChange={setEm} ph="you@htsyndicate.com" type="email"/>
<Inp label="Password" value={pw} onChange={setPw} ph={mode==="signup"?"At least 6 characters":"Your password"} type="password"/>

{/* No role picker — every signup joins as a least-privilege Setter.
    Role can only be changed by an admin from the Team page. This is what
    keeps open self-signup safe (see 0c trigger, which also forces setter). */}
{mode==="signup"&&
<div style={{padding:10,background:T.s1,borderRadius:6,fontSize:10,color:T.tx3,lineHeight:1.6}}>
<div style={{fontWeight:600,color:T.tx2,marginBottom:3}}>Your access</div>
You'll join as a <b style={{color:T.tx2}}>Setter</b> — pipeline, lead sheet, calls, your tasks, and leaves. An admin can promote you (Closer / Admin) from the Team page after you sign in.
</div>}

{err&&<div style={{fontSize:13,fontWeight:600,color:err.startsWith("Account created")?T.grn:T.red,padding:"12px 14px",background:err.startsWith("Account created")?T.grnBg:T.redBg,borderRadius:8,lineHeight:1.5,border:"1px solid "+(err.startsWith("Account created")?T.grn+"40":T.red+"40")}}>{err}</div>}

<button
  onClick={mode==="signin"?handleSignIn:handleSignUp}
  disabled={loading}
  style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"12px 16px",borderRadius:8,border:"none",cursor:loading?"not-allowed":"pointer",fontFamily:FONT,fontSize:14,fontWeight:700,background:loading?"#555":"linear-gradient(135deg,"+T.accD+","+T.acc+")",color:"#000",opacity:loading?0.8:1,transition:"all .2s"}}
>
  {loading&&<span style={{display:"inline-block",width:14,height:14,border:"2px solid #000",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>}
  {loading?(mode==="signin"?"Signing in…":"Creating account…"):mode==="signin"?"Sign In":"Create Account"}
</button>
<style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
</div>

<div style={{marginTop:18,padding:10,background:connStatus==="error"?T.redBg:connStatus==="ok"?T.grnBg:T.s1,borderRadius:7,border:"1px solid "+(connStatus==="error"?T.red+"40":connStatus==="ok"?T.grn+"40":T.bdr),fontSize:11,color:connStatus==="error"?T.red:connStatus==="ok"?T.grn:T.tx3,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
<svg width="8" height="8" viewBox="0 0 24 24" fill={connStatus==="error"?T.red:connStatus==="ok"?T.grn:T.tx3}><circle cx="12" cy="12" r="10"/></svg>
{connStatus==="checking"&&"Connecting to Supabase…"}
{connStatus==="ok"&&"Supabase connected — open DevTools Console for debug logs"}
{connStatus==="error"&&"Cannot reach Supabase — check internet connection. Open DevTools Console (F12) for details."}
</div>
</div></div>
)}

/* ═══ PUNCH BAR ═══ */
function PunchBar({user,punch,setPunch}){const p=punch[user.name];if(!p)return null;
const go=()=>{const now=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});setPunch(pr=>({...pr,[user.name]:{...pr[user.name],in:!pr[user.name].in,inT:!pr[user.name].in?now:pr[user.name].inT,outT:pr[user.name].in?now:null}}))};
return(
<div style={{background:T.s3,borderRadius:10,border:"1px solid "+T.bdr,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
<div style={{width:36,height:36,borderRadius:8,background:p.in?T.grnBg:T.redBg,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t="punch" s={18} c={p.in?T.grn:T.red}/></div>
<div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:T.tx}}>{p.in?"Clocked In":"Not Clocked In"}</div><div style={{fontSize:10,color:T.tx3}}>{p.in?"Since "+p.inT:p.outT?"Out at "+p.outT:"Tap to start"}</div></div>
<Btn v={p.in?"dan":"ok"} icon={p.in?"pause":"play"} onClick={go}>{p.in?"Punch Out":"Punch In"}</Btn>
<div style={{textAlign:"center",paddingLeft:6,paddingRight:6}}><div style={{fontSize:15,fontWeight:700,color:T.acc,fontFamily:MONO}}>{p.hrs.toFixed(1)}h</div><div style={{fontSize:8,color:T.tx3}}>Today</div></div>
<div style={{textAlign:"center",paddingLeft:6,paddingRight:6}}><div style={{fontSize:15,fontWeight:700,color:p.prod>=80?T.grn:p.prod>=60?T.yel:T.red,fontFamily:MONO}}>{p.prod}%</div><div style={{fontSize:8,color:T.tx3}}>Prod</div></div>
</div>
)}

/* ═══ ATTENDANCE TRACKER (Admin) — Synced with Google Sheets ═══ */
function AttP({punch}){
const[tab,setTab]=useState("today");
const[sheetUrl,setSheetUrl]=useState("https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit");
const[selPerson,setSelPerson]=useState(null);

const allHist=Object.entries(punch).flatMap(([n,p])=>p.hist.map(h=>({...h,name:n,dept:p.dept})));
const presentToday=Object.values(punch).filter(p=>p.in).length;
const totalPeople=Object.keys(punch).length;
const avgProd=Math.round(Object.values(punch).filter(p=>p.hist.length).reduce((a,p)=>a+p.hist[0].p,0)/Math.max(Object.values(punch).filter(p=>p.hist.length).length,1));
const totalLate=Object.values(punch).reduce((a,p)=>a+p.hist.filter(h=>h.late).length,0);
const totalAbsent=Object.values(punch).reduce((a,p)=>a+p.hist.filter(h=>h.status==="absent"||h.status==="leave").length,0);
const avgHrs=(Object.values(punch).reduce((a,p)=>a+p.hist.filter(h=>h.h>0).reduce((b,h)=>b+h.h,0),0)/Math.max(Object.values(punch).reduce((a,p)=>a+p.hist.filter(h=>h.h>0).length,0),1)).toFixed(1);

const statusClr=s=>({present:T.grn,late:T.yel,absent:T.red,leave:T.pur,halfday:T.acc,weekend:T.tx3})[s]||T.tx3;
const statusBg=s=>({present:T.grnBg,late:T.yelBg,absent:T.redBg,leave:T.purBg,halfday:T.accBg,weekend:T.s2})[s]||T.s2;

return(
<div style={{display:"flex",flexDirection:"column",gap:14}}>
{/* KPIs */}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
<St label="Online Now" value={presentToday+"/"+totalPeople} icon="punch" color={T.grn}/>
<St label="Avg Productivity" value={avgProd+"%"} icon="bar" color={T.acc}/>
<St label="Avg Hours/Day" value={avgHrs+"h"} icon="clock" color={T.blu}/>
<St label="Late Arrivals" value={totalLate} sub="this month" icon="alert" color={T.yel}/>
<St label="Absences" value={totalAbsent} sub="this month" icon="x" color={T.red}/>
</div>

{/* Google Sheet Sync Banner */}
<div style={{background:T.s3,borderRadius:10,border:"1px solid "+T.bdr,padding:"14px 18px"}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
<div style={{display:"flex",alignItems:"center",gap:10}}>
<div style={{width:36,height:36,borderRadius:8,background:T.grnBg,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t="sheet" s={18} c={T.grn}/></div>
<div><div style={{fontSize:13,fontWeight:600,color:T.tx}}>Google Sheets Integration</div>
<div style={{fontSize:10,color:T.tx3}}>Attendance data synced bi-directionally. Sheet serves as backup.</div></div>
</div>
<div style={{display:"flex",gap:6,alignItems:"center"}}>
<Bd text="Live Sync" color="grn"/>
<a href={sheetUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:T.acc,textDecoration:"none",display:"flex",alignItems:"center",gap:3,padding:"5px 10px",background:T.accBg,borderRadius:5,border:"1px solid "+T.accD+"30"}}>
<Ic t="link" s={12} c={T.acc}/>Open Sheet
</a>
</div>
</div>
<div style={{marginTop:10}}>
<div style={{fontSize:10,color:T.tx3,marginBottom:4}}>Sheet URL (paste your Google Sheet link)</div>
<div style={{display:"flex",gap:6}}><input value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)} style={{flex:1,padding:"7px 12px",borderRadius:6,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:11,fontFamily:MONO,outline:"none"}}/><Btn sm v="ok" icon="chk">Save</Btn></div>
</div>
</div>

{/* Tabs */}
<TabBar tabs={[{id:"today",l:"Today"},{id:"history",l:"Full History"},{id:"calendar",l:"Calendar View"},{id:"monthly",l:"Monthly Summary"},{id:"person",l:"Per Person"}]} a={tab} onChange={setTab}/>

{/* TODAY */}
{tab==="today"&&<Crd title={"Today — "+TODAY}>
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["Employee","Dept","Status","Punch In","Punch Out","Hours","Tasks","Calls","Productivity","Late?"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{Object.entries(punch).map(([n,p])=><tr key={n} style={{borderBottom:"1px solid "+T.bdr+"12"}}>
<td style={{padding:8}}><div style={{display:"flex",alignItems:"center",gap:6}}><Av name={n} sz={24}/><span style={{fontWeight:500,color:T.tx,fontSize:11}}>{n}</span></div></td>
<td style={{padding:8}}><Bd text={p.dept} color={p.dept==="sales"?"acc":p.dept==="finance"?"blu":"cyn"}/></td>
<td style={{padding:8}}><Bd text={p.in?"Online":"Offline"} color={p.in?"grn":"red"}/></td>
<td style={{padding:8,fontFamily:MONO,color:T.tx2,fontSize:10}}>{p.inT||"—"}</td>
<td style={{padding:8,fontFamily:MONO,color:T.tx2,fontSize:10}}>{p.outT||"—"}</td>
<td style={{padding:8,fontFamily:MONO,fontWeight:600}}>{p.hrs.toFixed(1)}h</td>
<td style={{padding:8,fontFamily:MONO}}>{p.tasks}</td>
<td style={{padding:8,fontFamily:MONO}}>{p.calls}</td>
<td style={{padding:8}}><div style={{display:"flex",alignItems:"center",gap:5}}><Bar v={p.prod} max={100} color={p.prod>=80?T.grn:p.prod>=60?T.yel:T.red} h={5}/><span style={{fontFamily:MONO,fontSize:10,fontWeight:600,color:p.prod>=80?T.grn:p.prod>=60?T.yel:T.red}}>{p.prod}%</span></div></td>
<td style={{padding:8}}>{p.inT&&p.inT>"10:00"?<Bd text="Late" color="yel"/>:<Bd text="On time" color="grn"/>}</td>
</tr>)}</tbody></table></div>
<div style={{marginTop:10,padding:8,background:T.s1,borderRadius:5,fontSize:10,color:T.tx3,display:"flex",gap:5}}><Ic t="sheet" s={12} c={T.grn}/>This data auto-syncs to your Google Sheet. Format: Name | Date | In | Out | Hours | Tasks | Calls | Prod% | Status</div>
</Crd>}

{/* FULL HISTORY */}
{tab==="history"&&<Crd title="Attendance History (All Employees)">
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["Date","Employee","Dept","Status","In","Out","Hours","Tasks","Calls","Prod%","Late"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 7px",color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{allHist.sort((a,b)=>b.d.localeCompare(a.d)).map((h,idx)=><tr key={idx} style={{borderBottom:"1px solid "+T.bdr+"10",background:h.status==="absent"?T.redBg:h.status==="leave"?T.purBg:"transparent"}}>
<td style={{padding:"6px 7px",fontFamily:MONO,color:T.tx2,fontSize:10}}>{h.d}</td>
<td style={{padding:"6px 7px",fontWeight:500,color:T.tx}}>{h.name}</td>
<td style={{padding:"6px 7px"}}><Bd text={h.dept} color={h.dept==="sales"?"acc":h.dept==="finance"?"blu":"cyn"}/></td>
<td style={{padding:"6px 7px"}}><Bd text={h.status} color={h.status==="present"?"grn":h.status==="absent"?"red":h.status==="leave"?"pur":h.status==="halfday"?"acc":"def"}/></td>
<td style={{padding:"6px 7px",fontFamily:MONO,color:T.tx2,fontSize:10}}>{h.i||"—"}</td>
<td style={{padding:"6px 7px",fontFamily:MONO,color:T.tx2,fontSize:10}}>{h.o||"—"}</td>
<td style={{padding:"6px 7px",fontFamily:MONO,fontWeight:600}}>{h.h>0?h.h+"h":"—"}</td>
<td style={{padding:"6px 7px",fontFamily:MONO}}>{h.t||"—"}</td>
<td style={{padding:"6px 7px",fontFamily:MONO}}>{h.c||"—"}</td>
<td style={{padding:"6px 7px"}}>{h.p>0?<span style={{fontFamily:MONO,fontWeight:600,color:h.p>=80?T.grn:h.p>=60?T.yel:T.red}}>{h.p}%</span>:"—"}</td>
<td style={{padding:"6px 7px"}}>{h.late?<Bd text="Late" color="yel"/>:h.status==="present"?<Bd text="OK" color="grn"/>:""}</td>
</tr>)}</tbody></table></div>
</Crd>}

{/* CALENDAR VIEW */}
{tab==="calendar"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
{Object.entries(punch).map(([name,p])=><Crd key={name} title={name+" — Attendance Calendar"}>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
{p.hist.sort((a,b)=>a.d.localeCompare(b.d)).map((h,i)=>{
const day=h.d.split("-").pop();
return(
<div key={i} title={h.d+": "+h.status+(h.late?" (LATE)":"")+(h.h>0?" | "+h.h+"h | Prod: "+h.p+"%":"")} style={{width:36,height:36,borderRadius:6,background:statusBg(h.late&&h.status==="present"?"late":h.status),border:"1px solid "+(h.late?T.yelD+"40":T.bdr),display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
<div style={{fontSize:11,fontWeight:600,color:statusClr(h.late&&h.status==="present"?"late":h.status)}}>{day}</div>
<div style={{fontSize:7,color:T.tx3}}>{h.h>0?h.h+"h":h.status==="weekend"?"WE":h.status==="leave"?"LV":h.status==="absent"?"AB":""}</div>
</div>
)})}
</div>
<div style={{display:"flex",gap:10,marginTop:10,fontSize:10}}>
{[{l:"Present",c:"grn"},{l:"Late",c:"yel"},{l:"Leave",c:"pur"},{l:"Absent",c:"red"},{l:"Half Day",c:"acc"},{l:"Weekend",c:"def"}].map(x=><div key={x.l} style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:10,height:10,borderRadius:3,background:T[x.c==="def"?'s2':x.c+"Bg"]}}/><span style={{color:T.tx3}}>{x.l}</span></div>)}
</div>
</Crd>)}
</div>}

{/* MONTHLY SUMMARY */}
{tab==="monthly"&&<Crd title="Monthly Summary — April/May 2026">
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["Employee","Days Present","Late Count","Leaves","Absences","Half Days","Total Hours","Avg Hours/Day","Avg Productivity","Score"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{Object.entries(punch).map(([n,p])=>{
const present=p.hist.filter(h=>h.status==="present"||h.status==="halfday").length;
const late=p.hist.filter(h=>h.late).length;
const leaves=p.hist.filter(h=>h.status==="leave").length;
const absent=p.hist.filter(h=>h.status==="absent").length;
const halfdays=p.hist.filter(h=>h.status==="halfday").length;
const totalH=p.hist.reduce((a,h)=>a+h.h,0);
const workDays=p.hist.filter(h=>h.h>0).length;
const avgH=workDays>0?(totalH/workDays).toFixed(1):0;
const avgP=workDays>0?Math.round(p.hist.filter(h=>h.p>0).reduce((a,h)=>a+h.p,0)/workDays):0;
const score=Math.round(avgP*(1-late*0.03-absent*0.1));
return(<tr key={n} style={{borderBottom:"1px solid "+T.bdr+"12"}}>
<td style={{padding:8}}><div style={{display:"flex",alignItems:"center",gap:6}}><Av name={n} sz={24}/><span style={{fontWeight:500,color:T.tx,fontSize:11}}>{n}</span></div></td>
<td style={{padding:8,fontFamily:MONO,fontWeight:600,color:T.grn}}>{present}</td>
<td style={{padding:8,fontFamily:MONO,color:late>2?T.red:late>0?T.yel:T.grn,fontWeight:600}}>{late}</td>
<td style={{padding:8,fontFamily:MONO,color:T.pur}}>{leaves}</td>
<td style={{padding:8,fontFamily:MONO,color:absent>0?T.red:T.tx2,fontWeight:absent>0?600:400}}>{absent}</td>
<td style={{padding:8,fontFamily:MONO,color:T.acc}}>{halfdays}</td>
<td style={{padding:8,fontFamily:MONO,fontWeight:600}}>{totalH.toFixed(1)}h</td>
<td style={{padding:8,fontFamily:MONO}}>{avgH}h</td>
<td style={{padding:8}}><div style={{display:"flex",alignItems:"center",gap:4}}><Bar v={avgP} max={100} color={avgP>=80?T.grn:avgP>=60?T.yel:T.red} h={4}/><span style={{fontFamily:MONO,fontSize:10,fontWeight:600,color:avgP>=80?T.grn:avgP>=60?T.yel:T.red}}>{avgP}%</span></div></td>
<td style={{padding:8}}><span style={{fontFamily:MONO,fontWeight:700,fontSize:13,color:score>=80?T.grn:score>=60?T.yel:T.red}}>{score}</span></td>
</tr>)})}</tbody></table></div>
<div style={{marginTop:12,padding:10,background:T.s1,borderRadius:6,fontSize:10,color:T.tx3}}>
Score = Avg Productivity adjusted for late arrivals (-3% each) and absences (-10% each). Target: 80+
</div>
</Crd>}

{/* PER PERSON */}
{tab==="person"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
{Object.keys(punch).map(n=><Pill key={n} l={n} active={selPerson===n} onClick={()=>setSelPerson(selPerson===n?null:n)}/>)}
</div>
{(selPerson?[selPerson]:Object.keys(punch)).map(name=>{const p=punch[name];const workDays=p.hist.filter(h=>h.h>0);
return(<Crd key={name} title={name+" — Detailed Log"}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,marginBottom:14}}>
{[
{l:"Present",v:p.hist.filter(h=>h.status==="present"||h.status==="halfday").length,c:T.grn},
{l:"Late",v:p.hist.filter(h=>h.late).length,c:T.yel},
{l:"Leaves",v:p.hist.filter(h=>h.status==="leave").length,c:T.pur},
{l:"Absent",v:p.hist.filter(h=>h.status==="absent").length,c:T.red},
{l:"Avg Hours",v:workDays.length>0?(workDays.reduce((a,h)=>a+h.h,0)/workDays.length).toFixed(1)+"h":"—",c:T.blu},
{l:"Avg Prod",v:workDays.length>0?Math.round(workDays.reduce((a,h)=>a+h.p,0)/workDays.length)+"%":"—",c:T.acc},
].map(s=><div key={s.l} style={{background:T.s1,borderRadius:5,padding:8,textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:s.c,fontFamily:MONO}}>{s.v}</div><div style={{fontSize:8,color:T.tx3}}>{s.l}</div></div>)}
</div>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["Date","Status","In","Out","Hours","Tasks","Calls","Prod","Late"].map(h=><th key={h} style={{textAlign:"left",padding:"6px",color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{p.hist.sort((a,b)=>b.d.localeCompare(a.d)).map((h,i)=><tr key={i} style={{borderBottom:"1px solid "+T.bdr+"10",background:h.status==="absent"?T.redBg:h.status==="leave"?T.purBg:""}}>
<td style={{padding:6,fontFamily:MONO,color:T.tx2,fontSize:10}}>{h.d}</td>
<td style={{padding:6}}><Bd text={h.status} color={h.status==="present"?"grn":h.status==="absent"?"red":h.status==="leave"?"pur":h.status==="halfday"?"acc":"def"}/></td>
<td style={{padding:6,fontFamily:MONO,fontSize:10}}>{h.i||"—"}</td>
<td style={{padding:6,fontFamily:MONO,fontSize:10}}>{h.o||"—"}</td>
<td style={{padding:6,fontFamily:MONO,fontWeight:600}}>{h.h>0?h.h+"h":"—"}</td>
<td style={{padding:6,fontFamily:MONO}}>{h.t||"—"}</td>
<td style={{padding:6,fontFamily:MONO}}>{h.c||"—"}</td>
<td style={{padding:6}}>{h.p>0?<span style={{fontFamily:MONO,fontWeight:600,color:h.p>=80?T.grn:h.p>=60?T.yel:T.red}}>{h.p}%</span>:"—"}</td>
<td style={{padding:6}}>{h.late?<Bd text="Late" color="yel"/>:h.h>0?<Bd text="OK" color="grn"/>:""}</td>
</tr>)}</tbody></table>
</Crd>)})}
</div>}
</div>
)}

/* ═══ LEAVES ═══ */
function LeavesP({user,leaves,updateLeave,onRequest}){
const isAdmin=user.role==="admin";
const myLeaves=leaves.filter(l=>l.by===user.name);
const allLeaves=leaves;
const pending=leaves.filter(l=>l.status==="pending");
const approved=leaves.filter(l=>l.status==="approved");
const rejected=leaves.filter(l=>l.status==="rejected");

return(
<div style={{display:"flex",flexDirection:"column",gap:14}}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
<St label="Pending" value={pending.length} icon="clock" color={T.yel}/>
<St label="Approved" value={approved.length} icon="chk" color={T.grn}/>
<St label="Rejected" value={rejected.length} icon="x" color={T.red}/>
<St label={isAdmin?"All Requests":"My Requests"} value={isAdmin?leaves.length:myLeaves.length} icon="cal" color={T.blu}/>
</div>

<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<div style={{fontSize:13,color:T.tx2}}>{isAdmin?"All leave requests across the team":"Your leave requests"}</div>
<Btn v="pri" icon="plus" onClick={onRequest}>Request Leave</Btn>
</div>

{(isAdmin?allLeaves:myLeaves).length===0&&<div style={{padding:40,textAlign:"center",background:T.s3,borderRadius:10,border:"1px solid "+T.bdr,color:T.tx3,fontSize:13}}>No leave requests yet</div>}

<div style={{display:"flex",flexDirection:"column",gap:8}}>
{(isAdmin?allLeaves:myLeaves).sort((a,b)=>(b.submittedAt||"").localeCompare(a.submittedAt||"")).map(l=>{const days=l.from===l.to?1:Math.max(1,Math.ceil((new Date(l.to)-new Date(l.from))/864e5)+1);return(
<div key={l.id} style={{background:T.s3,borderRadius:10,border:"1px solid "+T.bdr,padding:"14px 18px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
<Av name={l.by} sz={36}/>
<div style={{flex:1,minWidth:200}}>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
<span style={{fontSize:13,fontWeight:600,color:T.tx}}>{l.by}</span>
<Bd text={l.type} color="def"/>
<Bd text={l.status} color={l.status==="approved"?"grn":l.status==="rejected"?"red":"yel"}/>
</div>
<div style={{fontSize:11,color:T.tx2}}>{l.from}{l.from!==l.to&&" → "+l.to} <span style={{fontFamily:MONO,color:T.tx3}}>({days} day{days>1?"s":""})</span></div>
{l.reason&&<div style={{fontSize:11,color:T.tx3,marginTop:3,fontStyle:"italic"}}>"{l.reason}"</div>}
<div style={{fontSize:9,color:T.tx3,marginTop:4,fontFamily:MONO}}>Submitted {fmtDT(l.submittedAt)}{l.decidedAt&&" · "+l.status+" by "+l.decidedBy+" "+fmtDT(l.decidedAt)}</div>
</div>
{isAdmin&&l.status==="pending"&&<div style={{display:"flex",gap:5}}>
<Btn sm v="ok" icon="chk" onClick={()=>updateLeave(l.id,"approved")}>Approve</Btn>
<Btn sm v="dan" icon="x" onClick={()=>updateLeave(l.id,"rejected")}>Reject</Btn>
</div>}
</div>)})}
</div>
</div>
)}

function LeaveRequestForm({onClose,onSubmit}){
const[from,setFrom]=useState("");
const[to,setTo]=useState("");
const[type,setType]=useState("casual");
const[reason,setReason]=useState("");
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
<Inp label="From Date" value={from} onChange={v=>{setFrom(v);if(!to)setTo(v)}} type="date"/>
<Inp label="To Date" value={to} onChange={setTo} type="date"/>
</div>
<Sel label="Leave Type" value={type} onChange={setType} opts={[{v:"casual",l:"Casual Leave"},{v:"sick",l:"Sick Leave"},{v:"earned",l:"Earned / Paid Leave"},{v:"unpaid",l:"Unpaid Leave"},{v:"halfday",l:"Half Day"}]}/>
<Inp label="Reason" value={reason} onChange={setReason} ph="Brief reason for leave..." ta/>
<div style={{padding:8,background:T.bluBg,borderRadius:5,fontSize:10,color:T.blu,display:"flex",gap:5}}><Ic t="bell" s={12}/>Sir will be notified immediately</div>
<div style={{display:"flex",justifyContent:"flex-end",gap:6}}>
<Btn onClick={onClose}>Cancel</Btn>
<Btn v="pri" icon="send" onClick={()=>{if(!from||!to)return;onSubmit({from:from,to:to,type:type,reason:reason})}}>Submit Request</Btn>
</div></div>)}

/* ═══ SALES ═══ */
function SalesP({user,leads,setLeads,pipelines,setPipelines,setterStages,setSetterStages,closerStages,setCloserStages,allUsers}){
const subrole=user?.subrole||"admin";
const isAdmin=subrole==="admin";
const isSetter=subrole==="setter";
const isCloser=subrole==="closer";
const canEdit=true;
/* Live stage label/color lookup — uses the dynamic (persisted) stage lists, not the
   module-level defaults, so custom stages render their name/color everywhere (table,
   detail badge, history, notifications), not just as kanban columns. */
const stL=(s,kind)=>(kind==="closer"?closerStages:setterStages).find(x=>x.id===s)?.l||s;
const stC=(s,kind)=>(kind==="closer"?closerStages:setterStages).find(x=>x.id===s)?.c||T.tx3;
/* Stage label/color WITH default fallback — used by the global search panel, where a
   matched lead may live in a pipeline whose custom stages aren't currently loaded.
   Stage ids are shared across pipelines, so the defaults resolve a sensible label/color. */
const stLd=(s,kind)=>(kind==="closer"?closerStages:setterStages).find(x=>x.id===s)?.l||(kind==="closer"?DEFAULT_CLOSER_STAGES:DEFAULT_SETTER_STAGES).find(x=>x.id===s)?.l||s;
const stCd=(s,kind)=>(kind==="closer"?closerStages:setterStages).find(x=>x.id===s)?.c||(kind==="closer"?DEFAULT_CLOSER_STAGES:DEFAULT_SETTER_STAGES).find(x=>x.id===s)?.c||T.tx3;
/* Default view by role */
const defaultView=isSetter?"setter":isCloser?"closer":"setter";
const[vw,setVw]=useState(defaultView);
const[sel,setSel]=useState(null);
const[showAdd,setShowAdd]=useState(false);
const[showLog,setShowLog]=useState(null);
const[showPay,setShowPay]=useState(null);
const[fSrc,setFSrc]=useState("All");
const[activePipeline,setActivePipeline]=useState("all");
/* Tracks which (table:pipeline) seeds are in-flight/done this session so the auto-seed
   below can't fire twice and create duplicate columns. See loadStagesForPipeline effect. */
const seedingRef=useRef(new Set());
const[showAddPipeline,setShowAddPipeline]=useState(false);
const[showAddStage,setShowAddStage]=useState(null);
const[showEditStage,setShowEditStage]=useState(null);/* {kind, stage} */
const[showPipelineDropdown,setShowPipelineDropdown]=useState(false);
const[viewMode,setViewMode]=useState("kanban");
const[showEdit,setShowEdit]=useState(null);
const[showImport,setShowImport]=useState(false);
const[selDetailTab,setSelDetailTab]=useState("overview");
/* For admin: which view to focus on (setter or closer side) */
const[adminView,setAdminView]=useState("setter");
/* Drag state — { kind: "lead"|"stage", id, fromStage, kind2 } */
const[drag,setDrag]=useState(null);
const[search,setSearch]=useState("");
/* Active call: {lead, startedAt} | null */
const[activeCall,setActiveCall]=useState(null);

/* Filter leads by active pipeline */
const curPipeline=pipelines.find(p=>p.id===activePipeline)||pipelines[0];
/* Stages are per-pipeline. "all" is an aggregate view → show the default set
   read-only (every lead uses shared stage ids like "new"/"won", so it still
   renders). Only a specific pipeline can add / edit / delete / reorder stages. */
const stagesEditable=activePipeline!=="all";
/* Diagnostic: surface pipeline/stage state on every change so the console
   shows exactly why the Add/Edit/Delete/Drag controls are or aren't enabled. */
useEffect(()=>{console.log('[stages diag]',{activePipeline,stagesEditable,curPipeline:curPipeline?.id,curPipelineName:curPipeline?.name,pipelinesLoaded:pipelines.length,hasAllInList:pipelines.some(p=>p.id==="all"),setterStagesCount:setterStages.length,closerStagesCount:closerStages.length})},[activePipeline,stagesEditable,pipelines,setterStages.length,closerStages.length]);
/* Load — and auto-seed — this pipeline's stages whenever the active pipeline changes.
   The seed is guarded so it runs at most once per (table, pipeline): React StrictMode
   double-invokes effects and rapid pipeline switches used to fire several concurrent
   inserts before the first finished, producing duplicate columns (e.g. 4× "New Lead"). */
useEffect(()=>{
  let cancelled=false;
  const pid=activePipeline;
  if(!pid||pid==="all"){setSetterStages(DEFAULT_SETTER_STAGES);setCloserStages(DEFAULT_CLOSER_STAGES);return;}
  const loadKind=async(tbl,defaults,setStages)=>{
    const{data,error}=await supabase.from(tbl).select('*').eq('pipeline_id',pid).order('sort_order');
    if(cancelled)return;
    if(error){console.error('[loadStagesForPipeline] load failed — using defaults',{tbl,pid,error});setStages(defaults);return;}
    if(data&&data.length){setStages(data.map(s=>({id:s.id,l:s.label,c:s.color})));return;}
    /* No stages saved for this pipeline yet → seed from the defaults so the board isn't blank. */
    setStages(defaults);
    /* Guard 1 — skip if a seed for this table+pipeline is already in flight / done this session. */
    const seedKey=tbl+':'+pid;
    if(seedingRef.current.has(seedKey))return;
    seedingRef.current.add(seedKey);
    /* Guard 2 — re-check the live row count right before inserting and only seed when it's
       exactly 0, so we never seed a pipeline another tab/client just populated. */
    const{count,error:cntErr}=await supabase.from(tbl).select('id',{count:'exact',head:true}).eq('pipeline_id',pid);
    if(cancelled)return;
    if(cntErr){console.error('[loadStagesForPipeline] count check failed — skipping seed',{tbl,pid,cntErr});seedingRef.current.delete(seedKey);return;}
    if(count&&count>0){
      const{data:fresh}=await supabase.from(tbl).select('*').eq('pipeline_id',pid).order('sort_order');
      if(!cancelled&&fresh&&fresh.length)setStages(fresh.map(s=>({id:s.id,l:s.label,c:s.color})));
      return;
    }
    const rows=defaults.map((s,i)=>({id:s.id,label:s.l,color:s.c,sort_order:i,pipeline_id:pid}));
    const{error:seedErr}=await supabase.from(tbl).insert(rows);
    if(seedErr){console.error('[loadStagesForPipeline] auto-seed failed — likely add-pipeline-id-to-stages.sql has not been run in Supabase yet (missing pipeline_id column)',{tbl,pid,seedErr});seedingRef.current.delete(seedKey);}
    else console.log('[loadStagesForPipeline] seeded defaults for pipeline',{tbl,pid,count:rows.length});
  };
  loadKind('setter_stages',DEFAULT_SETTER_STAGES,setSetterStages);
  loadKind('closer_stages',DEFAULT_CLOSER_STAGES,setCloserStages);
  return()=>{cancelled=true;};
},[activePipeline]);
const pipelineLeads=useMemo(()=>{
  if(!curPipeline||curPipeline.id==="all")return leads;
  const sources=curPipeline.sources||[];
  return leads.filter(l=>(l.pipeline||"").toLowerCase()===curPipeline.id.toLowerCase()||sources.includes(l.source));
},[leads,curPipeline]);

/* Compute live heat for each lead — uses pipelineLeads */
const leadsHydrated=useMemo(()=>pipelineLeads.map(l=>{
  const payments=l.payments||[];
  const callLogs=l.callLogs||[];
  /* Connected = call logs we have (every logged call had a conversation). 
     Dialed = total attempts including unanswered. Default: connected + ~30% unanswered estimate. */
  const connected=callLogs.length;
  const dialed=l.dialed!==undefined?l.dialed:connected+Math.round(connected*0.4);
  const cashCollected=payments.reduce((a,p)=>a+p.amount,0);
  const revenue=l.setterStage==="won"||l.closerStage==="won"?l.value:0;
  return{...l,heat:calcHeat(l),ltv:cashCollected,cashCollected:cashCollected,revenue:revenue,dialed:dialed,connected:connected};
}),[pipelineLeads]);

const filteredLeads=useMemo(()=>{
  if(!search.trim())return leadsHydrated;
  const q=search.toLowerCase();
  return leadsHydrated.filter(l=>(l.name||"").toLowerCase().includes(q)||(l.phone||"").toLowerCase().includes(q)||(l.email||"").toLowerCase().includes(q)||(l.company||"").toLowerCase().includes(q));
},[leadsHydrated,search]);
const filteredCloserLeads=useMemo(()=>filteredLeads.filter(l=>l.closerStage),[filteredLeads]);
/* Global search — matches across ALL leads/pipelines (not just the active one) so the
   results panel can surface which pipeline + stage each matched lead sits in. */
const globalResults=useMemo(()=>{
  const q=search.trim().toLowerCase();
  if(!q)return[];
  return leads.filter(l=>(l.name||"").toLowerCase().includes(q)||(l.phone||"").toLowerCase().includes(q)||(l.email||"").toLowerCase().includes(q)||(l.company||"").toLowerCase().includes(q))
    .map(l=>({lead:l,pipe:(pipelines||[]).find(p=>p.id!=="all"&&((l.pipeline||"").toLowerCase()===p.id.toLowerCase()||(p.sources||[]).includes(l.source))),cash:(l.payments||[]).reduce((a,p)=>a+(Number(p.amount)||0),0)}));
},[leads,pipelines,search]);
const won=leadsHydrated.filter(l=>l.setterStage==="won"),
      active=leadsHydrated.filter(l=>!["won","lost"].includes(l.setterStage)),
      whop=leadsHydrated.filter(l=>l.source==="Whop (Course Buyer)");

/* Time period filter for progress tracking */
const[period,setPeriod]=useState("month");/* day | week | month */
const periodStart=useMemo(()=>{
  const d=new Date();
  if(period==="day")return new Date(d.setHours(0,0,0,0)).getTime();
  if(period==="week"){const day=d.getDay();return new Date(d.setDate(d.getDate()-day)).setHours(0,0,0,0)}
  return new Date(d.getFullYear(),d.getMonth(),1).getTime();
},[period]);
const inPeriod=(ts)=>ts&&new Date(ts).getTime()>=periodStart;

/* Helper: count leads where stage X happened within period */
const stageHappenedInPeriod=(l,history,stage)=>(l[history]||[]).some(h=>h.stage===stage&&inPeriod(h.at));

/* SETTER METRICS */
const setterTotal=leadsHydrated.length;
const setterTotalP=leadsHydrated.filter(l=>inPeriod(l.createdAt)).length;
const setterDialed=leadsHydrated.reduce((a,l)=>a+l.dialed,0);
const setterConnected=leadsHydrated.reduce((a,l)=>a+l.connected,0);
const setterCallBooked=leadsHydrated.filter(l=>l.setterHistory.some(h=>h.stage==="call_booked")).length;
const setterCallBookedP=leadsHydrated.filter(l=>stageHappenedInPeriod(l,"setterHistory","call_booked")).length;
const setterShowup=leadsHydrated.filter(l=>l.setterHistory.some(h=>h.stage==="showup")).length;
const setterDisqualified=leadsHydrated.filter(l=>l.setterHistory.some(h=>h.stage==="not_qualified")).length;
const setterQualified=leadsHydrated.filter(l=>l.setterHistory.some(h=>h.stage==="qualified")).length;
/* SETTER RATIOS */
const ratioConnect=setterDialed>0?((setterConnected/setterDialed)*100).toFixed(1):0;
const ratioConnectedToBooked=setterConnected>0?((setterCallBooked/setterConnected)*100).toFixed(1):0;
const ratioConnectedToDQ=setterConnected>0?((setterDisqualified/setterConnected)*100).toFixed(1):0;
const ratioLeadToBooked=setterTotal>0?((setterCallBooked/setterTotal)*100).toFixed(1):0;
const ratioBookedToShowup=setterCallBooked>0?((setterShowup/setterCallBooked)*100).toFixed(1):0;

/* CLOSER METRICS */
const closerLeads=leadsHydrated.filter(l=>l.closerStage);
const closerCallBooked=closerLeads.length;/* every closer lead came from a call_booked */
const closerCallBookedP=closerLeads.filter(l=>inPeriod(l.closerHistory[0]?.at)).length;
const closerShowup=closerLeads.filter(l=>l.closerHistory.some(h=>h.stage==="showup")).length;
const closerNoShowup=closerLeads.filter(l=>l.closerHistory.some(h=>h.stage==="no_showup")).length;
const closerDQ=closerLeads.filter(l=>l.closerHistory.some(h=>h.stage==="not_qualified")).length;
const closerWon=closerLeads.filter(l=>l.closerStage==="won").length;
const closerWonP=closerLeads.filter(l=>l.closerStage==="won"&&l.closerHistory.some(h=>h.stage==="won"&&inPeriod(h.at))).length;

/* Among won closers: classify by payment status */
const wonLeads=closerLeads.filter(l=>l.closerStage==="won");
const completePayments=wonLeads.filter(l=>l.cashCollected>=l.value).length;
const partialPayments=wonLeads.filter(l=>l.cashCollected>0&&l.cashCollected<l.value&&l.cashCollected>=l.value*0.5).length;
const tokenOnly=wonLeads.filter(l=>l.cashCollected>0&&l.cashCollected<l.value*0.5).length;

/* CLOSER RATIOS */
const ratioBookedToShowupCloser=closerCallBooked>0?((closerShowup/closerCallBooked)*100).toFixed(1):0;
const ratioShowupToDQ=closerShowup>0?((closerDQ/closerShowup)*100).toFixed(1):0;
const ratioShowupToWonComplete=closerShowup>0?((completePayments/closerShowup)*100).toFixed(1):0;
const ratioShowupToWonPartial=closerShowup>0?((partialPayments/closerShowup)*100).toFixed(1):0;
const ratioShowupToWonToken=closerShowup>0?((tokenOnly/closerShowup)*100).toFixed(1):0;
const closerConvRate=closerShowup>0?((closerWon/closerShowup)*100).toFixed(1):0;

/* Stage move with history */
const moveSetter=(id,stg,by)=>{
  setLeads(p=>p.map(l=>{
    if(l.id!==id)return l;
    const newH=[...(l.setterHistory||[]),{stage:stg,at:new Date().toISOString(),by:by||"Manual"}];
    let updated={...l,setterStage:stg,setterHistory:newH};
    if(stg==="call_booked"&&!l.closerHistory.some(h=>h.stage==="new")){
      updated.closerStage="new";
      updated.closerHistory=[...(l.closerHistory||[]),{stage:"new",at:new Date().toISOString(),by:"System (handed off from "+by+")"}];
    }
    saveLead(updated);
    if(l.setterStage!==stg)notifyStageChange({name:l.name,stage:stL(stg,"setter"),leadId:l.id,pipeline:l.pipeline||l.source});
    /* Keep the open detail panel in sync so the stage selection registers visually. */
    if(sel?.id===id)setSel(prev=>({...prev,...updated}));
    return updated;
  }));
};
const moveCloser=(id,stg,by)=>{
  setLeads(p=>p.map(l=>{
    if(l.id!==id)return l;
    const newH=[...(l.closerHistory||[]),{stage:stg,at:new Date().toISOString(),by:by||"Manual"}];
    const updated={...l,closerStage:stg,closerHistory:newH};
    saveLead(updated);
    if(l.closerStage!==stg)notifyStageChange({name:l.name,stage:stL(stg,"closer"),leadId:l.id,pipeline:l.pipeline||l.source});
    /* Keep the open detail panel in sync so the stage selection registers visually. */
    if(sel?.id===id)setSel(prev=>({...prev,...updated}));
    return updated;
  }));
};
/* Reorder stages by dragging columns */
const reorderStages=(kind,fromId,toId)=>{
  if(!stagesEditable)return;
  const setter=kind==="setter";
  const list=setter?setterStages:closerStages;
  const fromIdx=list.findIndex(s=>s.id===fromId);
  const toIdx=list.findIndex(s=>s.id===toId);
  if(fromIdx<0||toIdx<0||fromIdx===toIdx)return;
  const newList=[...list];
  const[moved]=newList.splice(fromIdx,1);
  newList.splice(toIdx,0,moved);
  if(setter)setSetterStages(newList);else setCloserStages(newList);
  const tbl=setter?'setter_stages':'closer_stages';
  newList.forEach((s,i)=>supabase.from(tbl).update({sort_order:i}).eq('id',s.id).eq('pipeline_id',activePipeline).then(({error})=>{if(error)console.error('Stage reorder save failed',{tbl,id:s.id,error})}));
};
/* Edit a stage — change name and color */
const editStage=(kind,stageId,patch)=>{
  if(!stagesEditable)return;
  const tbl=kind==="setter"?'setter_stages':'closer_stages';
  if(kind==="setter")setSetterStages(prev=>prev.map(s=>s.id===stageId?{...s,...patch}:s));
  else setCloserStages(prev=>prev.map(s=>s.id===stageId?{...s,...patch}:s));
  /* patch has {l, c} — map to DB {label, color} */
  const dbPatch={};if(patch.l)dbPatch.label=patch.l;if(patch.c)dbPatch.color=patch.c;
  supabase.from(tbl).update(dbPatch).eq('id',stageId).eq('pipeline_id',activePipeline).then(({error})=>{if(error){console.error('[editStage] Supabase update FAILED',{tbl,stageId,pipeline:activePipeline,error});const m=(error.message||'')+(error.code?' ['+error.code+']':'');const hint=/pipeline_id|does not exist|42703/i.test(m)?'\n\nThe stages tables are missing the per-pipeline column. Run add-pipeline-id-to-stages.sql in Supabase.':'';alert('Could not save stage change: '+(error.message||error.code||'unknown error')+hint)}else console.log('[editStage] Supabase update OK',{tbl,stageId})});
};
/* Delete a stage — moves all its leads to the first remaining stage */
const deleteStage=(kind,stageId)=>{
  if(!stagesEditable)return;
  const setter=kind==="setter";
  const list=setter?setterStages:closerStages;
  if(list.length<=1){alert("Cannot delete the only stage. Add another stage first.");return}
  const remaining=list.filter(s=>s.id!==stageId);
  const fallback=remaining[0].id;
  const tbl=setter?'setter_stages':'closer_stages';
  setLeads(p=>p.map(l=>{
    if(setter&&l.setterStage===stageId){const u={...l,setterStage:fallback,setterHistory:[...(l.setterHistory||[]),{stage:fallback,at:new Date().toISOString(),by:"System (stage deleted)"}]};saveLead(u);return u;}
    if(!setter&&l.closerStage===stageId){const u={...l,closerStage:fallback,closerHistory:[...(l.closerHistory||[]),{stage:fallback,at:new Date().toISOString(),by:"System (stage deleted)"}]};saveLead(u);return u;}
    return l;
  }));
  if(setter)setSetterStages(remaining);else setCloserStages(remaining);
  console.log('[deleteStage] DELETE from Supabase',{tbl,stageId,pipeline:activePipeline});
  supabase.from(tbl).delete().eq('id',stageId).eq('pipeline_id',activePipeline).then(({error})=>{
    if(error){console.error('[deleteStage] Supabase delete FAILED — stage will reappear on refresh',{tbl,stageId,pipeline:activePipeline,error});const m=(error.message||'')+(error.code?' ['+error.code+']':'');const hint=/pipeline_id|does not exist|42703/i.test(m)?'\n\nThe stages tables are missing the per-pipeline column. Run add-pipeline-id-to-stages.sql in Supabase.':/relation.*does not exist|42P01/i.test(m)?'\n\nThe stages table is missing. Run fix-crm-persistence.sql then add-pipeline-id-to-stages.sql.':'\n\nIt will reappear after refresh — likely RLS on '+tbl+'.';alert('Could not delete the stage: '+(error.message||error.code||'unknown error')+hint);}
    else console.log('[deleteStage] Supabase delete OK',{tbl,stageId});
  });
};
/* Edit lead — admin only */
const updateLead=(id,patch)=>{
  setLeads(p=>p.map(l=>{
    if(l.id!==id)return l;
    const u={...l,...patch};
    saveLead(u);
    /* Activity pushes — only when the field actually changed to a real value. */
    if(patch.setter&&patch.setter!==l.setter)notifyAssignment({name:l.name,member:patch.setter,role:"setter",leadId:l.id,pipeline:u.pipeline||u.source});
    if(patch.closer&&patch.closer!==l.closer)notifyAssignment({name:l.name,member:patch.closer,role:"closer",leadId:l.id,pipeline:u.pipeline||u.source});
    if(patch.pipeline&&patch.pipeline!==l.pipeline)notifyStageChange({name:l.name,stage:patch.pipeline,leadId:l.id,pipeline:patch.pipeline});
    return u;
  }));
  if(sel?.id===id)setSel(p=>({...p,...patch}));
};
const addCall=(id,dur,out,by)=>{
  setLeads(p=>p.map(l=>{
    if(l.id!==id)return l;
    const u={...l,calls:l.calls+1,callLogs:[...l.callLogs,{date:new Date().toISOString(),dur:+dur,out:out,by:by||"Team"}]};
    supabase.from('leads').update({calls:u.calls,call_logs:u.callLogs}).eq('id',id).then(({error})=>{
      if(error){
        console.error('addCall save failed',{id,error});
        alert('Failed to save call to database: '+(error.message||'unknown error'));
        return;
      }
      console.log('addCall saved',{id,calls:u.calls,logs:u.callLogs.length});
    });
    notifyCallLogged({name:l.name,outcome:out,by:by||"Team",leadId:l.id,pipeline:l.pipeline||l.source});
    return u;
  }));
};
const addPayment=(id,amount,what,type)=>{
  setLeads(p=>p.map(l=>{
    if(l.id!==id)return l;
    const pmt={amount:+amount,date:new Date().toISOString(),what:what,type:type};
    const updated={...l,payments:[...(l.payments||[]),pmt]};
    if(type==="token"&&!l.tokenPaidAt)updated.tokenPaidAt=pmt.date;
    if(!l.firstPaidAt)updated.firstPaidAt=pmt.date;
    supabase.from('leads').update(leadToDb(updated)).eq('id',id);
    notifyPayment({name:l.name,amount:+amount,type:type,leadId:l.id,pipeline:l.pipeline||l.source});
    /* A token payment makes the lead hot for 48h (see calcHeat) — flag it. */
    if(type==="token")notifyHotLead({name:l.name,reason:"Token paid · hot for 48h",leadId:l.id,pipeline:l.pipeline||l.source});
    return updated;
  }));
};

return(
<div style={{display:"flex",flexDirection:"column",gap:16}}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
<St label="Total Leads" value={leadsHydrated.length} trend={15} icon="users" color={T.blu}/>
<St label="Hot Leads" value={leadsHydrated.filter(l=>l.heat==="hot").length} sub="needs attention NOW" icon="alert" color={T.red}/>
<St label="Won" value={won.length} sub={fS(won.reduce((a,l)=>a+l.value,0))} icon="chk" color={T.grn}/>
<St label="Total LTV" value={fS(leadsHydrated.reduce((a,l)=>a+l.ltv,0))} sub="cash collected" icon="dollar" color={T.grn}/>
<St label="Whop" value={whop.length} sub={whop.filter(l=>l.setterStage==="won").length+" won"} icon="whop" color={T.pur}/>
<St label="Calls" value={leadsHydrated.reduce((a,l)=>a+l.calls,0)} sub={leadsHydrated.reduce((a,l)=>a+l.callLogs.reduce((b,c)=>b+c.dur,0),0)+"m"} icon="phone" color={T.cyn}/>
</div>

{/* SEARCH BAR */}
<div style={{display:"flex",alignItems:"center",gap:8,height:36,background:T.s2,borderRadius:10,border:"1px solid "+(search?T.acc:T.bdr),padding:"0 12px",transition:"border-color .15s ease"}}>
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={search?T.acc:T.tx3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, phone, email, company…" style={{background:"transparent",border:"none",outline:"none",color:T.tx,fontSize:13,fontFamily:FONT,flex:1,minWidth:200}}/>
{search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:T.tx3,cursor:"pointer",padding:0,display:"flex",alignItems:"center",fontSize:14,lineHeight:1}}>×</button>}
{search&&<span style={{fontSize:10,color:T.acc,fontFamily:MONO,fontWeight:600,whiteSpace:"nowrap"}}>{globalResults.length} result{globalResults.length!==1?"s":""}</span>}
</div>

{/* GLOBAL SEARCH RESULTS — shows the pipeline + setter/closer stage for every match across all pipelines */}
{search.trim()&&<div style={{background:T.s2,borderRadius:10,border:"1px solid "+T.bdr,overflow:"hidden"}}>
<div style={{padding:"10px 14px",borderBottom:"1px solid "+T.bdr,display:"flex",alignItems:"center",gap:8}}>
<span style={{fontSize:12,fontWeight:600,color:T.tx}}>Search results</span>
<span style={{fontSize:10,fontFamily:MONO,color:T.tx3}}>{globalResults.length} across all pipelines</span>
</div>
<div style={{maxHeight:360,overflowY:"auto"}}>
{globalResults.length===0?<div style={{padding:"24px",textAlign:"center",fontSize:12,color:T.tx3}}>No leads match "{search}"</div>:globalResults.map(({lead:l,pipe,cash})=>(
<div key={l.id} onClick={()=>setSel(l)}
  style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid "+T.bdr+"30",cursor:"pointer",transition:"background .15s"}}
  onMouseEnter={e=>e.currentTarget.style.background=T.s3}
  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
<Av name={l.name} sz={28}/>
<div style={{flex:1,minWidth:0}}>
<div style={{fontSize:12,fontWeight:600,color:T.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.name}</div>
<div style={{fontSize:10,color:T.tx3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.email||l.phone||l.company||l.source||"—"}</div>
</div>
<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
{/* Pipeline badge */}
<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:5,fontSize:10,fontWeight:600,background:(pipe?.color||T.tx3)+"18",color:pipe?.color||T.tx3,border:"1px solid "+(pipe?.color||T.tx3)+"40",whiteSpace:"nowrap"}}>
{pipe&&<Ic t={pipe.icon} s={11} c={pipe.color||T.tx3}/>}{pipe?.name||"Unassigned"}
</span>
{/* Setter stage badge */}
{l.setterStage&&<span title="Setter stage" style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:5,fontSize:9,fontWeight:700,letterSpacing:.3,textTransform:"uppercase",background:stCd(l.setterStage,"setter")+"18",color:stCd(l.setterStage,"setter"),border:"1px solid "+stCd(l.setterStage,"setter")+"40",whiteSpace:"nowrap"}}><span style={{opacity:.55,fontSize:8}}>S</span>{stLd(l.setterStage,"setter")}</span>}
{/* Closer stage badge (only once handed off) */}
{l.closerStage&&<span title="Closer stage" style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:5,fontSize:9,fontWeight:700,letterSpacing:.3,textTransform:"uppercase",background:stCd(l.closerStage,"closer")+"18",color:stCd(l.closerStage,"closer"),border:"1px solid "+stCd(l.closerStage,"closer")+"40",whiteSpace:"nowrap"}}><span style={{opacity:.55,fontSize:8}}>C</span>{stLd(l.closerStage,"closer")}</span>}
{cash>0&&<span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:T.grn,whiteSpace:"nowrap"}}>{fS(cash)}</span>}
</div>
</div>))}
</div>
</div>}

{/* GHL-STYLE PIPELINE TOOLBAR */}
<div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
{/* Pipeline dropdown */}
<div style={{position:"relative"}}>
<button onClick={()=>setShowPipelineDropdown(!showPipelineDropdown)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderRadius:8,border:"1px solid "+(showPipelineDropdown?T.acc:T.bdr),background:T.s1,color:T.tx,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:FONT,minWidth:240,justifyContent:"space-between"}}>
<span style={{display:"flex",alignItems:"center",gap:8}}>
{curPipeline&&<Ic t={curPipeline.icon} s={14} c={curPipeline.color||T.acc}/>}
<span>{curPipeline?.name||"All Leads"}</span>
</span>
<Ic t={showPipelineDropdown?"aUp":"aDown"} s={12} c={T.tx3}/>
</button>
{showPipelineDropdown&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,minWidth:280,background:T.s2,border:"1px solid "+T.bdr,borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.4)",zIndex:50,overflow:"hidden"}}>
{pipelines.map(p=>{const sources=p.sources||[];const cnt=p.id==="all"?leads.length:leads.filter(l=>(l.pipeline||"").toLowerCase()===p.id.toLowerCase()||sources.includes(l.source)).length;const isActive=activePipeline===p.id;return(<button key={p.id} onClick={()=>{setActivePipeline(p.id);setShowPipelineDropdown(false)}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",width:"100%",background:isActive?T.accBg:"transparent",color:isActive?T.acc:T.tx,border:"none",borderBottom:"1px solid "+T.bdr+"40",cursor:"pointer",fontSize:12,fontFamily:FONT,fontWeight:isActive?600:500,textAlign:"left"}}>
<Ic t={p.icon} s={14} c={isActive?T.acc:p.color||T.tx3}/>
<span style={{flex:1}}>{p.name}</span>
<span style={{fontSize:10,fontFamily:MONO,color:T.tx3}}>{cnt}</span>
{isActive&&<Ic t="chk" s={12} c={T.acc}/>}
{p.id!=="all"&&!DEFAULT_PIPELINES.find(d=>d.id===p.id)&&<span onClick={e=>{e.stopPropagation();if(confirm("Delete pipeline "+p.name+"?")){setPipelines(prev=>prev.filter(x=>x.id!==p.id));supabase.from('pipelines').delete().eq('id',p.id);if(activePipeline===p.id)setActivePipeline("all")}}} style={{color:T.red,padding:"0 4px",cursor:"pointer"}} title="Delete">×</span>}
</button>)})}
<button onClick={()=>{setShowPipelineDropdown(false);setShowAddPipeline(true)}} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",width:"100%",background:"transparent",color:T.acc,border:"none",cursor:"pointer",fontSize:12,fontFamily:FONT,fontWeight:600,textAlign:"left"}}>
<Ic t="plus" s={14} c={T.acc}/>
<span>New pipeline</span>
</button>
</div>}
</div>

{/* Opportunity count */}
<span style={{fontSize:13,color:T.tx2,fontWeight:500}}>{pipelineLeads.length} {pipelineLeads.length===1?"opportunity":"opportunities"}</span>

<div style={{flex:1}}/>

{/* View toggle: kanban / list */}
<div style={{display:"flex",gap:0,background:T.s1,borderRadius:7,padding:3,border:"1px solid "+T.bdr}}>
<button onClick={()=>setViewMode("kanban")} title="Kanban view" style={{padding:"6px 10px",borderRadius:5,background:viewMode==="kanban"?T.s3:"transparent",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t="dash" s={14} c={viewMode==="kanban"?T.acc:T.tx3}/></button>
<button onClick={()=>setViewMode("list")} title="List view" style={{padding:"6px 10px",borderRadius:5,background:viewMode==="list"?T.s3:"transparent",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t="menu" s={14} c={viewMode==="list"?T.acc:T.tx3}/></button>
</div>

<Btn v="def" icon="aDown" onClick={()=>setShowImport(true)}>Import</Btn>
<Btn v="pri" icon="plus" onClick={()=>setShowAdd(true)}>Add opportunity</Btn>
</div>

{/* Admin-only Setter/Closer switcher */}
{isAdmin&&<div style={{display:"flex",gap:0,background:T.s3,borderRadius:10,padding:4,border:"1px solid "+T.bdr,width:"fit-content",alignSelf:"center"}}>
{[{id:"setter",l:"Setter View"},{id:"closer",l:"Closer View"}].map(v=><button key={v.id} onClick={()=>{setAdminView(v.id);setVw(v.id)}} style={{padding:"8px 22px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:12,fontWeight:adminView===v.id?700:500,background:adminView===v.id?T.acc:"transparent",color:adminView===v.id?"#000":T.tx2}}>{v.l}</button>)}
</div>}

<div style={{display:"flex",justifyContent:"flex-start",alignItems:"center",flexWrap:"wrap",gap:8}}>
<TabBar tabs={(()=>{
const allTabs=[
{id:"setter",l:"Pipeline",roles:["admin","setter"],view:"setter"},
{id:"closer",l:"Pipeline",roles:["admin","closer"],view:"closer"},
{id:"sheet",l:"Lead Sheet",roles:["admin","setter","closer"]},
{id:"calls",l:"Calls",roles:["admin","setter","closer"]},
{id:"daily",l:"Daily Report",roles:["admin"]},
{id:"team",l:"Team Stats",roles:["admin"]},
{id:"src",l:"Sources",roles:["admin","setter","closer"]}
];
return allTabs.filter(t=>{
  if(!t.roles.includes(subrole))return false;
  /* For admin, hide the other view's pipeline tab */
  if(isAdmin&&t.view&&t.view!==adminView)return false;
  return true;
}).map(({id,l})=>({id,l}));
})()} a={vw} onChange={setVw}/>
</div>

{/* SETTER PIPELINE */}
{vw==="setter"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
{/* Setter header with progress switcher */}
<div style={{background:T.s3,borderRadius:10,border:"1px solid "+T.bdr,padding:"14px 18px"}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
<div><div style={{fontSize:13,fontWeight:600,color:T.tx,marginBottom:2}}>{user?.subrole==="setter"&&user?.name?"Setter — "+user.name:"Setter Pipeline"}</div>
<div style={{fontSize:10,color:T.tx3}}>Books calls, qualifies, hands off to closer</div></div>
<div style={{display:"flex",gap:0,background:T.s1,borderRadius:7,padding:3,border:"1px solid "+T.bdr}}>
{[{id:"day",l:"Today"},{id:"week",l:"This Week"},{id:"month",l:"This Month"}].map(p=><button key={p.id} onClick={()=>setPeriod(p.id)} style={{padding:"5px 12px",borderRadius:5,fontSize:10,fontWeight:period===p.id?700:500,background:period===p.id?T.acc:"transparent",color:period===p.id?"#000":T.tx2,border:"none",cursor:"pointer",fontFamily:FONT}}>{p.l}</button>)}
</div></div>
{/* Period progress */}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:12}}>
<div style={{background:T.s1,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>New Leads</div><div style={{fontSize:18,fontWeight:700,color:T.tx,fontFamily:MONO,marginTop:3}}>{setterTotalP}</div></div>
<div style={{background:T.s1,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Calls Booked</div><div style={{fontSize:18,fontWeight:700,color:T.acc,fontFamily:MONO,marginTop:3}}>{setterCallBookedP}</div></div>
<div style={{background:T.s1,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Dialed</div><div style={{fontSize:18,fontWeight:700,color:T.tx,fontFamily:MONO,marginTop:3}}>{setterDialed}</div></div>
<div style={{background:T.s1,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Connected</div><div style={{fontSize:18,fontWeight:700,color:T.cyn,fontFamily:MONO,marginTop:3}}>{setterConnected}</div></div>
</div>
{/* Ratios row */}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:6,paddingTop:10,borderTop:"1px solid "+T.bdr}}>
<div style={{textAlign:"center",padding:"6px 8px"}}><div style={{fontSize:16,fontWeight:700,color:T.acc,fontFamily:MONO}}>{ratioConnect}%</div><div style={{fontSize:9,color:T.tx3,marginTop:2}}>Connect Ratio</div><div style={{fontSize:8,color:T.tx3+"99"}}>dialed → connected</div></div>
<div style={{textAlign:"center",padding:"6px 8px",borderLeft:"1px solid "+T.bdr}}><div style={{fontSize:16,fontWeight:700,color:T.cyn,fontFamily:MONO}}>{ratioConnectedToBooked}%</div><div style={{fontSize:9,color:T.tx3,marginTop:2}}>Connected → Booked</div><div style={{fontSize:8,color:T.tx3+"99"}}>conversion to call booked</div></div>
<div style={{textAlign:"center",padding:"6px 8px",borderLeft:"1px solid "+T.bdr}}><div style={{fontSize:16,fontWeight:700,color:T.red,fontFamily:MONO}}>{ratioConnectedToDQ}%</div><div style={{fontSize:9,color:T.tx3,marginTop:2}}>Connected → DQ</div><div style={{fontSize:8,color:T.tx3+"99"}}>disqualified rate</div></div>
<div style={{textAlign:"center",padding:"6px 8px",borderLeft:"1px solid "+T.bdr}}><div style={{fontSize:16,fontWeight:700,color:T.pur,fontFamily:MONO}}>{ratioLeadToBooked}%</div><div style={{fontSize:9,color:T.tx3,marginTop:2}}>Lead → Booked</div><div style={{fontSize:8,color:T.tx3+"99"}}>overall</div></div>
<div style={{textAlign:"center",padding:"6px 8px",borderLeft:"1px solid "+T.bdr}}><div style={{fontSize:16,fontWeight:700,color:T.grn,fontFamily:MONO}}>{ratioBookedToShowup}%</div><div style={{fontSize:9,color:T.tx3,marginTop:2}}>Booked → Show Up</div><div style={{fontSize:8,color:T.tx3+"99"}}>attendance</div></div>
</div>
</div>
<div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>
{setterStages.map(st=>{const sL=filteredLeads.filter(l=>l.setterStage===st.id);const stageVal=sL.reduce((a,l)=>a+l.value,0);return(
<div key={st.id}
  onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move"}}
  onDrop={e=>{e.preventDefault();if(drag?.type==="stage"&&drag.kind==="setter")reorderStages("setter",drag.id,st.id);else if(drag?.type==="lead"&&drag.kind==="setter")moveSetter(drag.id,st.id,user?.name?.split(" ")[0]||"Manual");setDrag(null)}}
  style={{minWidth:280,width:280,flexShrink:0,background:"transparent",borderRadius:12,border:"1px solid "+(drag?.type==="lead"&&drag?.kind==="setter"?T.acc:"transparent"),display:"flex",flexDirection:"column"}}>
{/* GHL-style stage header */}
<div
  draggable={stagesEditable}
  onDragStart={e=>{if(!stagesEditable)return;setDrag({type:"stage",kind:"setter",id:st.id});e.dataTransfer.effectAllowed="move"}}
  style={{padding:"14px 16px",borderBottom:"1px solid "+T.bdr,cursor:stagesEditable?"move":"default",position:"relative"}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
<span style={{display:"inline-flex",alignItems:"center",gap:8}}><span style={{fontSize:13,fontWeight:600,color:T.tx2,textTransform:"uppercase",letterSpacing:.8}}>{st.l}</span><span style={{fontSize:11,fontWeight:600,color:T.tx3,background:T.s2,borderRadius:10,minWidth:18,height:20,padding:"0 7px",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{sL.length}</span></span>
<div style={{display:"flex",alignItems:"center",gap:8}}>
{stagesEditable&&<><button onClick={e=>{e.stopPropagation();setShowEditStage({kind:"setter",stage:st})}} style={{background:"none",border:"none",color:T.tx3,cursor:"pointer",padding:0,display:"flex",alignItems:"center"}} title="Edit stage"><Ic t="edit" s={12} c={T.tx3}/></button>
<button onClick={e=>{e.stopPropagation();const cnt=leadsHydrated.filter(l=>l.setterStage===st.id).length;const msg=cnt>0?"Delete stage \""+st.l+"\"? "+cnt+" lead"+(cnt>1?"s":"")+" will be moved to the first stage.":"Delete stage \""+st.l+"\"?";if(confirm(msg))deleteStage("setter",st.id)}} style={{background:"none",border:"none",color:T.red+"99",cursor:"pointer",padding:0,display:"flex",alignItems:"center"}} title="Delete stage"><Ic t="trash" s={12} c={T.red+"99"}/></button></>}
<button title="Collapse" style={{background:"none",border:"none",color:T.tx3,cursor:"pointer",padding:0,display:"flex",alignItems:"center"}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
</div></div>
<div style={{fontSize:12,color:T.tx3,fontWeight:500}}>{sL.length} {sL.length===1?"Opportunity":"Opportunities"} <span style={{color:T.tx2,marginLeft:4}}>{fS(stageVal)}</span></div>
{/* color underline */}
<div style={{position:"absolute",bottom:-1,left:0,right:0,height:2,background:st.c}}/>
</div>
<div style={{padding:10,display:"flex",flexDirection:"column",gap:8,flex:1,overflowY:"auto",maxHeight:540}}>
{sL.length===0&&<div style={{padding:"24px 8px",textAlign:"center",fontSize:11,color:T.tx3+"99"}}>No opportunities</div>}
{sL.map(l=>{const lastMove=l.setterHistory[l.setterHistory.length-1];const wa=waUrl(l.phone,l.name);return(
<div key={l.id}
  draggable
  onDragStart={e=>{e.stopPropagation();setDrag({type:"lead",kind:"setter",id:l.id,fromStage:st.id});e.dataTransfer.effectAllowed="move"}}
  onClick={()=>setSel(l)}
  style={{background:T.s1,borderRadius:12,padding:14,border:"1px solid "+T.bdr,cursor:"grab",opacity:drag?.id===l.id?.3:1,transition:"border-color .15s ease,transform .15s ease,box-shadow .15s ease"}}
  onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.16)";e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.4)"}}
  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bdr;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none"}}>
{/* Stage tag + heat badge row */}
<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8,flexWrap:"wrap"}}>
<span style={{display:"inline-flex",padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:700,background:st.c+"18",color:st.c,letterSpacing:.3,border:"1px solid "+st.c+"40",textTransform:"uppercase"}}>{st.l}</span>
{l.heat==="hot"&&<Bd text="Hot" color="red" solid/>}
{l.heat==="warm"&&<Bd text="Warm" color="acc" solid/>}
{l.heat==="cold"&&<Bd text="Cold" color="def" solid/>}
{(l.tags||[]).map(t=><Bd key={t} text={t} color="pur"/>)}
</div>
{/* Lead name + person icon */}
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:600,color:T.tx}}>{l.name}</span>
<div style={{width:22,height:22,borderRadius:99,background:T.s3,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0116 0"/></svg>
</div></div>
{/* Value line */}
<div style={{fontSize:11,color:T.tx2,marginBottom:10}}>
{l.value>0?(<><span>Value: </span><span style={{color:T.tx,fontWeight:600}}>{fS(l.value)}</span>{l.cashCollected>0&&<span style={{color:T.grn,marginLeft:6,fontSize:10}}>· {fS(l.cashCollected)} paid</span>}</>):<span style={{color:T.tx3,fontSize:10}}>No payment set</span>}
</div>
{/* Action icons row */}
<div style={{display:"flex",alignItems:"center",gap:8,paddingTop:8,borderTop:"1px solid "+T.bdr+"60"}}>
<button onClick={e=>{e.stopPropagation();if(l.phone)setActiveCall({lead:l,startedAt:Date.now()})}} title={l.phone?"Call "+l.phone:"No phone number"} disabled={!l.phone} style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:4,background:l.phone?T.grnBg:"transparent",border:"none",cursor:l.phone?"pointer":"not-allowed",padding:0}}><Ic t="phone" s={13} c={l.phone?T.grn:T.tx3}/>{l.calls>0&&<span style={{position:"absolute",top:-4,right:-4,background:T.acc,color:"#000",fontSize:8,fontWeight:700,fontFamily:MONO,minWidth:12,height:12,borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 2px"}}>{l.calls}</span>}</button>
<div title="Messages" style={{display:"flex",alignItems:"center",cursor:"pointer"}}><Ic t="mail" s={13} c={T.tx3}/></div>
{wa&&<a href={wa} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} title="WhatsApp" style={{display:"flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:4,background:"#25D36618",cursor:"pointer",flexShrink:0,textDecoration:"none"}}><Ic t="wa" s={12} c="#25D366"/></a>}
<div title={l.source} style={{display:"flex",alignItems:"center",cursor:"pointer"}}><Ic t="link" s={13} c={T.tx3}/></div>
<div title="Notes" style={{position:"relative",display:"flex",alignItems:"center",cursor:"pointer"}}>
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="1.7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
{(l.followUps||[]).filter(f=>!f.done).length>0&&<span style={{position:"absolute",top:-4,right:-6,background:T.blu,color:"#fff",fontSize:8,fontWeight:700,fontFamily:MONO,minWidth:14,height:14,borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{(l.followUps||[]).filter(f=>!f.done).length}</span>}
</div>
<div title="Calendar" style={{display:"flex",alignItems:"center",cursor:"pointer"}}><Ic t="cal" s={13} c={T.tx3}/></div>
</div>
</div>)})}</div></div>)})}
{/* Add Stage button column */}
<div style={{minWidth:stagesEditable?120:180,width:stagesEditable?120:180,flexShrink:0,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:0}}>
{stagesEditable
?<button onClick={()=>{console.log('[Add Stage click] setter',{activePipeline,stagesEditable});setShowAddStage("setter")}} style={{width:"100%",height:60,background:"transparent",border:"2px dashed "+T.bdr,borderRadius:8,color:T.tx3,cursor:"pointer",fontFamily:FONT,fontSize:12,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.acc;e.currentTarget.style.color=T.acc}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bdr;e.currentTarget.style.color=T.tx3}}><Ic t="plus" s={14}/>Add Stage</button>
:<div style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px dashed "+T.bdr,color:T.tx3+"99",fontSize:10,lineHeight:1.4,textAlign:"center"}}>Stages are per pipeline. Switch to a specific pipeline to add or edit stages.</div>}
</div>
</div>
</div>}

{/* CLOSER PIPELINE */}
{vw==="closer"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{background:T.s3,borderRadius:10,border:"1px solid "+T.bdr,padding:"14px 18px"}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
<div><div style={{fontSize:13,fontWeight:600,color:T.tx,marginBottom:2}}>{user?.subrole==="closer"&&user?.name?"Closer — "+user.name:"Closer Pipeline"}</div>
<div style={{fontSize:10,color:T.tx3}}>Receives leads from setter, closes deals</div></div>
<div style={{display:"flex",gap:0,background:T.s1,borderRadius:7,padding:3,border:"1px solid "+T.bdr}}>
{[{id:"day",l:"Today"},{id:"week",l:"This Week"},{id:"month",l:"This Month"}].map(p=><button key={p.id} onClick={()=>setPeriod(p.id)} style={{padding:"5px 12px",borderRadius:5,fontSize:10,fontWeight:period===p.id?700:500,background:period===p.id?T.acc:"transparent",color:period===p.id?"#000":T.tx2,border:"none",cursor:"pointer",fontFamily:FONT}}>{p.l}</button>)}
</div></div>
{/* Period progress */}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:12}}>
<div style={{background:T.s1,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Calls Booked</div><div style={{fontSize:18,fontWeight:700,color:T.acc,fontFamily:MONO,marginTop:3}}>{closerCallBookedP}</div></div>
<div style={{background:T.s1,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Show Ups</div><div style={{fontSize:18,fontWeight:700,color:T.cyn,fontFamily:MONO,marginTop:3}}>{closerShowup}</div></div>
<div style={{background:T.s1,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Won (Period)</div><div style={{fontSize:18,fontWeight:700,color:T.grn,fontFamily:MONO,marginTop:3}}>{closerWonP}</div></div>
<div style={{background:T.s1,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Cash Collected</div><div style={{fontSize:16,fontWeight:700,color:T.grn,fontFamily:MONO,marginTop:3}}>{fS(leadsHydrated.reduce((a,l)=>a+l.cashCollected,0))}</div></div>
</div>
{/* Funnel ratios */}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:6,paddingTop:10,borderTop:"1px solid "+T.bdr}}>
<div style={{textAlign:"center",padding:"6px 8px"}}><div style={{fontSize:16,fontWeight:700,color:T.acc,fontFamily:MONO}}>{closerCallBooked}</div><div style={{fontSize:9,color:T.tx3,marginTop:2}}>Calls Booked</div><div style={{fontSize:8,color:T.tx3+"99"}}>total received</div></div>
<div style={{textAlign:"center",padding:"6px 8px",borderLeft:"1px solid "+T.bdr}}><div style={{fontSize:16,fontWeight:700,color:T.cyn,fontFamily:MONO}}>{ratioBookedToShowupCloser}%</div><div style={{fontSize:9,color:T.tx3,marginTop:2}}>Lead → Show Up</div><div style={{fontSize:8,color:T.tx3+"99"}}>attendance rate</div></div>
<div style={{textAlign:"center",padding:"6px 8px",borderLeft:"1px solid "+T.bdr}}><div style={{fontSize:16,fontWeight:700,color:T.red,fontFamily:MONO}}>{ratioShowupToDQ}%</div><div style={{fontSize:9,color:T.tx3,marginTop:2}}>Show Up → DQ</div><div style={{fontSize:8,color:T.tx3+"99"}}>disqualified</div></div>
</div>
{/* Show Up → 3 outcomes */}
<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+T.bdr}}>
<div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5,marginBottom:8,fontWeight:600}}>Show Up → Won, by payment tier</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
<div style={{background:T.grnBg,borderRadius:6,padding:10,border:"1px solid "+T.grnD+"30"}}>
<div style={{fontSize:18,fontWeight:700,color:T.grn,fontFamily:MONO}}>{ratioShowupToWonComplete}%</div>
<div style={{fontSize:10,color:T.grn,fontWeight:600,marginTop:2}}>Complete Won</div>
<div style={{fontSize:9,color:T.tx3,marginTop:1}}>{completePayments} leads · 100% paid</div></div>
<div style={{background:T.yelBg,borderRadius:6,padding:10,border:"1px solid "+T.yelD+"30"}}>
<div style={{fontSize:18,fontWeight:700,color:T.yel,fontFamily:MONO}}>{ratioShowupToWonPartial}%</div>
<div style={{fontSize:10,color:T.yel,fontWeight:600,marginTop:2}}>Partial Payment</div>
<div style={{fontSize:9,color:T.tx3,marginTop:1}}>{partialPayments} leads · ≥50% paid</div></div>
<div style={{background:T.accBg,borderRadius:6,padding:10,border:"1px solid "+T.accD+"30"}}>
<div style={{fontSize:18,fontWeight:700,color:T.acc,fontFamily:MONO}}>{ratioShowupToWonToken}%</div>
<div style={{fontSize:10,color:T.acc,fontWeight:600,marginTop:2}}>Token Only</div>
<div style={{fontSize:9,color:T.tx3,marginTop:1}}>{tokenOnly} leads · &lt;50% paid</div></div>
</div></div>
</div>
<div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>
{closerStages.map(st=>{const sL=filteredCloserLeads.filter(l=>l.closerStage===st.id);const stageVal=sL.reduce((a,l)=>a+l.value,0);return(
<div key={st.id}
  onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move"}}
  onDrop={e=>{e.preventDefault();if(drag?.type==="stage"&&drag.kind==="closer")reorderStages("closer",drag.id,st.id);else if(drag?.type==="lead"&&drag.kind==="closer")moveCloser(drag.id,st.id,user?.name?.split(" ")[0]||"Manual");setDrag(null)}}
  style={{minWidth:280,width:280,flexShrink:0,background:"transparent",borderRadius:12,border:"1px solid "+(drag?.type==="lead"&&drag?.kind==="closer"?T.acc:"transparent"),display:"flex",flexDirection:"column"}}>
<div
  draggable={stagesEditable}
  onDragStart={e=>{if(!stagesEditable)return;setDrag({type:"stage",kind:"closer",id:st.id});e.dataTransfer.effectAllowed="move"}}
  style={{padding:"14px 16px",borderBottom:"1px solid "+T.bdr,cursor:stagesEditable?"move":"default",position:"relative"}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
<span style={{display:"inline-flex",alignItems:"center",gap:8}}><span style={{fontSize:13,fontWeight:600,color:T.tx2,textTransform:"uppercase",letterSpacing:.8}}>{st.l}</span><span style={{fontSize:11,fontWeight:600,color:T.tx3,background:T.s2,borderRadius:10,minWidth:18,height:20,padding:"0 7px",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{sL.length}</span></span>
<div style={{display:"flex",alignItems:"center",gap:8}}>
{stagesEditable&&<><button onClick={e=>{e.stopPropagation();setShowEditStage({kind:"closer",stage:st})}} style={{background:"none",border:"none",color:T.tx3,cursor:"pointer",padding:0,display:"flex",alignItems:"center"}} title="Edit stage"><Ic t="edit" s={12} c={T.tx3}/></button>
<button onClick={e=>{e.stopPropagation();const cnt=closerLeads.filter(l=>l.closerStage===st.id).length;const msg=cnt>0?"Delete stage \""+st.l+"\"? "+cnt+" lead"+(cnt>1?"s":"")+" will be moved to the first stage.":"Delete stage \""+st.l+"\"?";if(confirm(msg))deleteStage("closer",st.id)}} style={{background:"none",border:"none",color:T.red+"99",cursor:"pointer",padding:0,display:"flex",alignItems:"center"}} title="Delete stage"><Ic t="trash" s={12} c={T.red+"99"}/></button></>}
<button title="Collapse" style={{background:"none",border:"none",color:T.tx3,cursor:"pointer",padding:0,display:"flex",alignItems:"center"}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
</div></div>
<div style={{fontSize:12,color:T.tx3,fontWeight:500}}>{sL.length} {sL.length===1?"Opportunity":"Opportunities"} <span style={{color:T.tx2,marginLeft:4}}>{fS(stageVal)}</span></div>
<div style={{position:"absolute",bottom:-1,left:0,right:0,height:2,background:st.c}}/>
</div>
<div style={{padding:10,display:"flex",flexDirection:"column",gap:8,flex:1,overflowY:"auto",maxHeight:540}}>
{sL.length===0&&<div style={{padding:"24px 8px",textAlign:"center",fontSize:11,color:T.tx3+"99"}}>No opportunities</div>}
{sL.map(l=>{const lastMove=l.closerHistory[l.closerHistory.length-1];const wa=waUrl(l.phone,l.name);return(
<div key={l.id}
  draggable
  onDragStart={e=>{e.stopPropagation();setDrag({type:"lead",kind:"closer",id:l.id,fromStage:st.id});e.dataTransfer.effectAllowed="move"}}
  onClick={()=>setSel(l)}
  style={{background:T.s1,borderRadius:12,padding:14,border:"1px solid "+T.bdr,cursor:"grab",opacity:drag?.id===l.id?.3:1,transition:"border-color .15s ease,transform .15s ease,box-shadow .15s ease"}}
  onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.16)";e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.4)"}}
  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bdr;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none"}}>
{/* Stage tag + heat badge row */}
<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8,flexWrap:"wrap"}}>
<span style={{display:"inline-flex",padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:700,background:st.c+"18",color:st.c,letterSpacing:.3,border:"1px solid "+st.c+"40",textTransform:"uppercase"}}>{st.l}</span>
{l.heat==="hot"&&<Bd text="Hot" color="red" solid/>}
{l.heat==="warm"&&<Bd text="Warm" color="acc" solid/>}
{l.heat==="cold"&&<Bd text="Cold" color="def" solid/>}
{(l.tags||[]).map(t=><Bd key={t} text={t} color="pur"/>)}
</div>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:600,color:T.tx}}>{l.name}</span>
<div style={{width:22,height:22,borderRadius:99,background:T.s3,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0116 0"/></svg>
</div></div>
<div style={{fontSize:11,color:T.tx2,marginBottom:10}}>
{l.value>0?(<><span>Value: </span><span style={{color:T.tx,fontWeight:600}}>{fS(l.value)}</span>{l.cashCollected>0&&<span style={{color:T.grn,marginLeft:6,fontSize:10}}>· {fS(l.cashCollected)} paid</span>}</>):<span style={{color:T.tx3,fontSize:10}}>No payment set</span>}
</div>
<div style={{display:"flex",alignItems:"center",gap:8,paddingTop:8,borderTop:"1px solid "+T.bdr+"60"}}>
<button onClick={e=>{e.stopPropagation();if(l.phone)setActiveCall({lead:l,startedAt:Date.now()})}} title={l.phone?"Call "+l.phone:"No phone number"} disabled={!l.phone} style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:4,background:l.phone?T.grnBg:"transparent",border:"none",cursor:l.phone?"pointer":"not-allowed",padding:0}}><Ic t="phone" s={13} c={l.phone?T.grn:T.tx3}/>{l.calls>0&&<span style={{position:"absolute",top:-4,right:-4,background:T.acc,color:"#000",fontSize:8,fontWeight:700,fontFamily:MONO,minWidth:12,height:12,borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 2px"}}>{l.calls}</span>}</button>
<div title="Messages" style={{display:"flex",alignItems:"center",cursor:"pointer"}}><Ic t="mail" s={13} c={T.tx3}/></div>
{wa&&<a href={wa} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} title="WhatsApp" style={{display:"flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:4,background:"#25D36618",cursor:"pointer",flexShrink:0,textDecoration:"none"}}><Ic t="wa" s={12} c="#25D366"/></a>}
<div title={l.source} style={{display:"flex",alignItems:"center",cursor:"pointer"}}><Ic t="link" s={13} c={T.tx3}/></div>
<div title="Notes" style={{position:"relative",display:"flex",alignItems:"center",cursor:"pointer"}}>
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="1.7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
{(l.followUps||[]).filter(f=>!f.done).length>0&&<span style={{position:"absolute",top:-4,right:-6,background:T.blu,color:"#fff",fontSize:8,fontWeight:700,fontFamily:MONO,minWidth:14,height:14,borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{(l.followUps||[]).filter(f=>!f.done).length}</span>}
</div>
<div title="Calendar" style={{display:"flex",alignItems:"center",cursor:"pointer"}}><Ic t="cal" s={13} c={T.tx3}/></div>
</div>
</div>)})}</div></div>)})}
<div style={{minWidth:stagesEditable?120:180,width:stagesEditable?120:180,flexShrink:0,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:0}}>
{stagesEditable
?<button onClick={()=>{console.log('[Add Stage click] closer',{activePipeline,stagesEditable});setShowAddStage("closer")}} style={{width:"100%",height:60,background:"transparent",border:"2px dashed "+T.bdr,borderRadius:8,color:T.tx3,cursor:"pointer",fontFamily:FONT,fontSize:12,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.acc;e.currentTarget.style.color=T.acc}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bdr;e.currentTarget.style.color=T.tx3}}><Ic t="plus" s={14}/>Add Stage</button>
:<div style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px dashed "+T.bdr,color:T.tx3+"99",fontSize:10,lineHeight:1.4,textAlign:"center"}}>Stages are per pipeline. Switch to a specific pipeline to add or edit stages.</div>}
</div>
</div>
</div>}

{/* LEAD SHEET */}
{vw==="sheet"&&<Crd title="Lead Sheet" action={<select value={fSrc} onChange={e=>setFSrc(e.target.value)} style={{padding:"3px 8px",borderRadius:5,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:9}}><option value="All">All Sources</option>{SOURCES.map(s=><option key={s}>{s}</option>)}</select>}>
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["Name","Company","Source","Heat","Setter Stage","Closer Stage","Value","LTV","Calls","Called?"].map(h=><th key={h} style={{textAlign:"left",padding:7,color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{(fSrc==="All"?leadsHydrated:leadsHydrated.filter(l=>l.source===fSrc)).map(l=><tr key={l.id} onClick={()=>setSel(l)} onMouseEnter={e=>{e.currentTarget.style.background=T.s1}} onMouseLeave={e=>{e.currentTarget.style.background="transparent"}} style={{borderBottom:"1px solid "+T.bdr+"08",cursor:"pointer",transition:"background .12s ease"}}>
<td style={{padding:7,color:T.tx,fontWeight:500}}>{l.name}</td><td style={{padding:7,color:T.tx2}}>{l.company}</td>
<td style={{padding:7}}><Bd text={l.source.includes("Whop")?"Whop":l.source} color={l.source.includes("Whop")?"pur":"def"}/></td>
<td style={{padding:7}}><Bd text={l.heat} color={heatColor(l.heat)}/></td>
<td style={{padding:7}}><Bd text={stL(l.setterStage,"setter")} color={l.setterStage==="won"?"grn":l.setterStage==="lost"?"red":"acc"}/></td>
<td style={{padding:7}}>{l.closerStage?<Bd text={stL(l.closerStage,"closer")} color={l.closerStage==="won"?"grn":l.closerStage==="lost"?"red":"blu"}/>:<span style={{fontSize:9,color:T.tx3}}>—</span>}</td>
<td style={{padding:7,fontFamily:MONO,fontWeight:600}}>{fS(l.value)}</td>
<td style={{padding:7,fontFamily:MONO,color:l.ltv>0?T.grn:T.tx3,fontWeight:600}}>{l.ltv>0?fS(l.ltv):"—"}</td>
<td style={{padding:7,fontFamily:MONO}}>{l.calls}</td>
<td style={{padding:7}}>{l.calls>0?<Bd text="Yes" color="grn"/>:<Bd text="No" color="red"/>}</td>
</tr>)}</tbody></table></div></Crd>}

{/* CALLS */}
{vw==="calls"&&<Crd title="Call Log" action={<Btn sm v="pri" icon="plus" onClick={()=>setShowLog({})}>Log Call</Btn>}>
{leadsHydrated.flatMap(l=>l.callLogs.map(c=>({...c,lead:l.name,co:l.company}))).sort((a,b)=>b.date.localeCompare(a.date)).map((c,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid "+T.bdr+"10",fontSize:11}}>
<span style={{fontFamily:MONO,color:T.tx3,width:120,fontSize:9}}>{fmtDT(c.date)}</span>
<span style={{fontWeight:500,color:T.tx,width:120}}>{c.lead}</span>
<Bd text={c.dur+"m"} color={c.dur>=15?"grn":"def"}/>
<span style={{color:T.tx2,flex:1,fontSize:10}}>{c.out}</span>
<span style={{color:T.tx3,fontSize:9}}>{c.by}</span></div>)}</Crd>}

{/* DAILY REPORT */}
{vw==="daily"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
<Crd title={"Daily Report — "+TODAY}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
{(allUsers||[]).filter(u=>u.subrole==="setter"||u.subrole==="closer").map(p=>{const pL=leadsHydrated.filter(l=>l.setter===p.name||l.closer===p.name);const tc=pL.flatMap(l=>l.callLogs).filter(c=>c.date>=TODAY);
return(<div key={p.id} style={{background:T.s1,borderRadius:8,padding:14,border:"1px solid "+T.bdr}}>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><Av name={p.name} sz={32}/><div><div style={{fontSize:13,fontWeight:600,color:T.tx}}>{p.name}</div><div style={{fontSize:10,color:T.tx3}}>{p.subrole==="setter"?"Setter":"Closer"}</div></div></div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
{[{v:pL.length,l:"Leads",c:T.tx},{v:tc.length,l:"Calls Today",c:T.cyn},{v:pL.filter(l=>l.heat==="hot").length,l:"Hot Now",c:T.red}].map(s=><div key={s.l} style={{background:T.s2,borderRadius:5,padding:8,textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:s.c,fontFamily:MONO}}>{s.v}</div><div style={{fontSize:8,color:T.tx3}}>{s.l}</div></div>)}</div></div>)})}</div></Crd>
<Crd title="Productivity Check" action={<Bd text="AI Assessment" color="pur"/>}>
{(allUsers||[]).filter(u=>u.subrole==="setter"||u.subrole==="closer").map(u=>{const pL=leadsHydrated.filter(l=>l.setter===u.name||l.closer===u.name);const sc=pL.length===0?0:Math.min(100,Math.round((pL.filter(l=>l.calls>0).length/pL.length)*100));const r=sc>=80?"low":sc>=60?"medium":"high";return(<div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid "+T.bdr+"12"}}>
<span style={{fontSize:12,fontWeight:500,color:T.tx,width:130}}>{u.name}</span>
<div style={{flex:1}}><Bar v={sc} max={100} color={sc>=80?T.grn:T.yel} h={4}/></div>
<Bd text={r+" risk"} color={r==="low"?"grn":r==="medium"?"yel":"red"}/><span style={{fontFamily:MONO,fontWeight:700,color:sc>=80?T.grn:T.yel}}>{sc}%</span></div>)})}</Crd></div>}

{/* TEAM STATS */}
{vw==="team"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
{(allUsers||[]).filter(u=>u.subrole==="setter"||u.subrole==="closer").map(u=>{const isSetter=u.subrole==="setter";const p={n:u.name,r:isSetter?"Setter":"Closer",ratios:isSetter?[{l:"Lead → Booked",v:ratioLeadToBooked+"%",c:T.acc},{l:"Booked → Show Up",v:ratioBookedToShowup+"%",c:T.cyn}]:[{l:"Show Up → Won",v:closerConvRate+"%",c:T.grn},{l:"Closer Pipeline",v:closerLeads.length,c:T.acc}]};
const pL=leadsHydrated.filter(l=>p.r==="Setter"?l.setter===p.n:l.closer===p.n);const pW=pL.filter(l=>p.r==="Setter"?l.setterStage==="won":l.closerStage==="won");
return(<Crd key={u.id} title={p.n}>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
{[{v:pL.length,l:"Total Leads",c:T.tx},{v:pW.length,l:"Won",c:T.grn},{v:pL.reduce((a,l)=>a+l.calls,0),l:"Calls",c:T.cyn},{v:fS(pW.reduce((a,l)=>a+l.ltv,0)),l:"LTV Generated",c:T.acc}].map(s=><div key={s.l} style={{background:T.s1,borderRadius:5,padding:8,textAlign:"center"}}><div style={{fontSize:14,fontWeight:700,color:s.c,fontFamily:MONO}}>{s.v}</div><div style={{fontSize:8,color:T.tx3}}>{s.l}</div></div>)}</div>
<div style={{display:"flex",gap:6}}>{p.ratios.map(r=><div key={r.l} style={{flex:1,background:T.s2,borderRadius:5,padding:8,textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:r.c,fontFamily:MONO}}>{r.v}</div><div style={{fontSize:8,color:T.tx3}}>{r.l}</div></div>)}</div>
</Crd>)})}</div>}

{/* SOURCES */}
{vw==="src"&&<Crd title="Sources">{SOURCES.map(s=>{const sL=leadsHydrated.filter(l=>l.source===s);if(!sL.length)return null;return(<div key={s} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid "+T.bdr+"10"}}>
<div style={{width:32,height:32,borderRadius:7,background:s.includes("Whop")?T.purBg:T.accBg,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t={s.includes("Whop")?"whop":"link"} s={14} c={s.includes("Whop")?T.pur:T.acc}/></div>
<div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:T.tx}}>{s}</div><div style={{fontSize:9,color:T.tx3}}>{sL.length} leads | {sL.filter(l=>l.setterStage==="won").length} won | Cash {fS(sL.reduce((a,l)=>a+l.cashCollected,0))} | Rev {fS(sL.reduce((a,l)=>a+l.revenue,0))}</div></div>
<span style={{fontFamily:MONO,fontWeight:600,color:T.tx}}>{fS(sL.reduce((a,l)=>a+l.value,0))}</span></div>)}).filter(Boolean)}</Crd>}

{/* LEAD DETAIL */}
{sel&&<Mod title={sel.name} onClose={()=>{setSel(null);setSelDetailTab("overview")}} wide>
<div style={{display:"flex",flexDirection:"column",gap:14}}>
{/* Header */}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
<div>
<div style={{fontSize:11,color:T.tx3,marginBottom:3}}>{sel.company}{sel.city?" · "+sel.city:""}{sel.industry?" · "+sel.industry:""}</div>
<div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
<Bd text={sel.heat} color={heatColor(sel.heat)}/>
<span style={{display:"inline-flex",padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:700,background:stC(sel.setterStage,"setter")+"18",color:stC(sel.setterStage,"setter"),border:"1px solid "+stC(sel.setterStage,"setter")+"40",textTransform:"uppercase"}}>{stL(sel.setterStage,"setter")}</span>
{sel.closerStage&&<span style={{display:"inline-flex",padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:700,background:stC(sel.closerStage,"closer")+"18",color:stC(sel.closerStage,"closer"),border:"1px solid "+stC(sel.closerStage,"closer")+"40",textTransform:"uppercase"}}>{stL(sel.closerStage,"closer")}</span>}
{(sel.tags||[]).map(t=><Bd key={t} text={t} color="pur"/>)}
</div>
</div>
<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
{canEdit&&<Btn sm icon="edit" onClick={()=>setShowEdit(sel)}>Edit</Btn>}
<Btn sm v="pri" icon="phone" onClick={()=>setShowLog({leadId:sel.id})}>Log Call</Btn>
{waUrl(sel.phone,sel.name)&&<a href={waUrl(sel.phone,sel.name)} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 9px",borderRadius:7,fontSize:10,fontWeight:600,background:"#25D36618",color:"#25D366",border:"1px solid #25D36630",textDecoration:"none",fontFamily:FONT}}><Ic t="wa" s={12} c="#25D366"/>WhatsApp</a>}
</div>
</div>

{/* Duplicate warning */}
{(()=>{const dups=leads.filter(l=>l.id!==sel.id&&((sel.phone&&l.phone&&l.phone.replace(/\D/g,"").slice(-10)===sel.phone.replace(/\D/g,"").slice(-10))||(sel.email&&l.email&&l.email.toLowerCase()===sel.email.toLowerCase())));return dups.length>0&&(<div style={{background:T.yelBg,border:"1px solid "+T.yelD+"30",borderRadius:7,padding:"10px 14px",fontSize:11,color:T.yel,display:"flex",alignItems:"center",gap:8}}><Ic t="alert" s={14} c={T.yel}/><span>Duplicate: {dups.length} other lead{dups.length>1?"s":""} with same phone/email</span><button onClick={()=>setSel(dups[0])} style={{marginLeft:"auto",background:"none",border:"1px solid "+T.yelD+"40",borderRadius:4,color:T.yel,fontSize:10,cursor:"pointer",fontFamily:FONT,padding:"2px 8px"}}>View</button></div>);})()}

{/* Stats row */}
<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
{[
{l:"Deal Value",v:sel.value>0?fS(sel.value):"Not set",c:sel.value>0?T.acc:T.tx3},
{l:"Cash Collected",v:(sel.cashCollected||0)>0?fS(sel.cashCollected||0):"No payments",c:(sel.cashCollected||0)>0?T.grn:T.tx3},
{l:"Revenue",v:(sel.revenue||0)>0?fS(sel.revenue||0):"—",c:(sel.revenue||0)>0?T.pur:T.tx3},
{l:"Calls Logged",v:sel.calls,c:T.cyn}
].map(s=><div key={s.l} style={{background:T.s2,borderRadius:5,padding:8,textAlign:"center"}}><div style={{fontSize:15,fontWeight:700,color:s.c,fontFamily:MONO}}>{s.v}</div><div style={{fontSize:8,color:T.tx3}}>{s.l}</div></div>)}
</div>

{/* Tabs */}
<TabBar tabs={[{id:"overview",l:"Overview"},{id:"stages",l:"Stages"},{id:"payments",l:"Payments"},{id:"history",l:"History"}]} a={selDetailTab} onChange={setSelDetailTab}/>

{/* Tab: Overview */}
{selDetailTab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:12}}>
<div style={{background:T.s2,borderRadius:6,padding:12}}>
<div style={{fontSize:9,color:T.tx3,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Contact</div>
<div style={{color:T.tx,marginBottom:3}}>{sel.email||<span style={{color:T.tx3}}>No email</span>}</div>
<div style={{color:T.tx}}>{sel.phone||<span style={{color:T.tx3}}>No phone</span>}</div>
</div>
<div style={{background:T.s2,borderRadius:6,padding:12}}>
<div style={{fontSize:9,color:T.tx3,marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Team Assignment</div>
{(()=>{
  const setters=allUsers?allUsers.filter(u=>u.subrole==="setter"||u.role==="admin"):[];
  const closers=allUsers?allUsers.filter(u=>u.subrole==="closer"||u.role==="admin"):[];
  const selStyle={padding:"5px 8px",borderRadius:5,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:11,fontFamily:FONT,outline:"none",width:"100%"};
  return(<div style={{display:"flex",flexDirection:"column",gap:6}}>
  <div style={{display:"flex",alignItems:"center",gap:6}}>
    <span style={{fontSize:11,color:T.tx3,width:46,flexShrink:0}}>Setter</span>
    {setters.length>0?<select value={sel.setter||""} onChange={e=>updateLead(sel.id,{setter:e.target.value})} style={selStyle}>
      <option value="">Unassigned</option>
      {setters.map(u=><option key={u.id} value={u.name}>{u.name}</option>)}
    </select>:<span style={{color:T.acc,fontSize:11,fontWeight:500}}>{sel.setter||"Unassigned"}</span>}
  </div>
  <div style={{display:"flex",alignItems:"center",gap:6}}>
    <span style={{fontSize:11,color:T.tx3,width:46,flexShrink:0}}>Closer</span>
    {closers.length>0?<select value={sel.closer||""} onChange={e=>updateLead(sel.id,{closer:e.target.value})} style={selStyle}>
      <option value="">Unassigned</option>
      {closers.map(u=><option key={u.id} value={u.name}>{u.name}</option>)}
    </select>:<span style={{color:T.blu,fontSize:11,fontWeight:500}}>{sel.closer||"Unassigned"}</span>}
  </div>
  </div>);
})()}
</div>
</div>
{sel.notes&&<div style={{background:T.s2,borderRadius:6,padding:12,fontSize:11,color:T.tx2,lineHeight:1.6}}>
<div style={{fontSize:9,color:T.tx3,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Notes</div>
{sel.notes}
</div>}
{sel.callLogs.length>0&&<div>
<div style={{fontSize:9,color:T.tx3,marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Recent Calls</div>
{sel.callLogs.slice(-3).reverse().map((c,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:T.s2,borderRadius:5,marginBottom:3,fontSize:10}}><span style={{fontFamily:MONO,color:T.tx3,width:110}}>{fmtDT(c.date)}</span><Bd text={c.dur+"m"} color={c.dur>=15?"grn":"def"}/><span style={{color:T.tx2,flex:1}}>{c.out}</span><span style={{color:T.tx3,fontSize:9}}>{c.by}</span></div>)}
</div>}
</div>}

{/* Tab: Stages */}
{selDetailTab==="stages"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div><div style={{fontSize:9,color:T.tx3,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Setter Pipeline Stage</div>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{setterStages.map(s=><button key={s.id} onClick={()=>moveSetter(sel.id,s.id,(sel.setter||"").split(" ")[0]||"Manual")} style={{padding:"6px 10px",borderRadius:5,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:FONT,border:sel.setterStage===s.id?"2px solid "+s.c:"1px solid "+T.bdr,background:sel.setterStage===s.id?s.c+"18":"transparent",color:sel.setterStage===s.id?s.c:T.tx3,transition:"all .15s"}}>{s.l}</button>)}</div></div>
<div><div style={{fontSize:9,color:T.tx3,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Closer Pipeline Stage {!sel.closerStage&&<span style={{color:T.yel}}>(not handed off yet)</span>}</div>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{closerStages.map(s=><button key={s.id} onClick={()=>moveCloser(sel.id,s.id,((sel.closer||"Closer")).split(" ")[0])} style={{padding:"6px 10px",borderRadius:5,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:FONT,border:sel.closerStage===s.id?"2px solid "+s.c:"1px solid "+T.bdr,background:sel.closerStage===s.id?s.c+"18":"transparent",color:sel.closerStage===s.id?s.c:T.tx3,opacity:sel.closerStage?1:.5,transition:"all .15s"}} disabled={!sel.closerStage&&s.id!=="new"}>{s.l}</button>)}</div></div>
</div>}

{/* Tab: Payments */}
{selDetailTab==="payments"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<div style={{fontSize:11,color:T.tx2}}>LTV: <span style={{fontFamily:MONO,fontWeight:700,color:T.grn}}>{fS(sel.ltv||0)}</span> / Deal: <span style={{fontFamily:MONO,fontWeight:700,color:T.acc}}>{sel.value>0?fS(sel.value):"Not set"}</span></div>
<Btn sm v="ok" icon="dollar" onClick={()=>setShowPay(sel)}>Add Payment</Btn>
</div>
{(sel.payments||[]).length>0?(sel.payments||[]).map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:T.s2,borderRadius:6,fontSize:11}}>
<Bd text={p.type} color={p.type==="token"?"yel":p.type==="final"?"grn":"acc"}/>
<span style={{flex:1,color:T.tx,fontWeight:500}}>{p.what||"Payment"}</span>
<span style={{fontFamily:MONO,fontSize:10,color:T.tx3}}>{fmtDT(p.date)}</span>
<span style={{fontFamily:MONO,fontWeight:700,color:T.grn,fontSize:13}}>{fmt(p.amount)}</span>
</div>):<div style={{padding:"24px 0",textAlign:"center",color:T.tx3,fontSize:12}}>No payments recorded yet<div style={{fontSize:10,marginTop:4}}>Click "Add Payment" to record the first payment</div></div>}
</div>}

{/* Tab: History — combined chronological timeline */}
{selDetailTab==="history"&&(()=>{
const fmtAgo=ts=>{if(!ts)return"—";const diff=Date.now()-new Date(ts).getTime();const m=Math.floor(diff/60000);const h=Math.floor(m/60);const d=Math.floor(h/24);if(m<1)return"Just now";if(m<60)return m+"m ago";if(h<24)return h+"h ago";if(d===1)return"Yesterday";if(d<7)return d+"d ago";return fmtDT(ts)};
const events=[
  ...(sel.setterHistory||[]).map(h=>({...h,kind:"setter",label:stL(h.stage,"setter"),color:stC(h.stage,"setter"),icon:"stage",desc:"Setter stage → "+stL(h.stage,"setter")})),
  ...(sel.closerHistory||[]).map(h=>({...h,kind:"closer",label:stL(h.stage,"closer"),color:stC(h.stage,"closer"),icon:"stage",desc:"Closer stage → "+stL(h.stage,"closer")})),
  ...(sel.callLogs||[]).map(c=>({at:c.date,by:c.by,kind:"call",label:"Call — "+c.dur+"min",color:T.cyn,icon:"phone",desc:c.out||"Call logged"})),
  ...(sel.payments||[]).map(p=>({at:p.date,by:"Finance",kind:"payment",label:fmt(p.amount)+" — "+p.type,color:T.grn,icon:"dollar",desc:p.what||"Payment recorded"})),
  ...(sel.followUps||[]).filter(f=>f.done).map(f=>({at:f.date+"T12:00:00",by:"Team",kind:"followup",label:"Follow-up done",color:T.pur,icon:"chk",desc:f.note||"Follow-up completed"})),
  {at:sel.createdAt,by:"System",kind:"created",label:"Lead Created",color:T.tx3,icon:"plus",desc:"Lead added to CRM"},
].filter(e=>e.at).sort((a,b)=>new Date(b.at)-new Date(a.at));
return(<div style={{display:"flex",flexDirection:"column",gap:0}}>
{events.length===0&&<div style={{padding:"24px 0",textAlign:"center",color:T.tx3,fontSize:12}}>No history yet</div>}
{events.map((e,i)=>(
<div key={i} style={{display:"flex",gap:12,paddingBottom:12,position:"relative"}}>
{i<events.length-1&&<div style={{position:"absolute",left:14,top:28,bottom:0,width:1,background:T.bdr}}/>}
<div style={{width:28,height:28,borderRadius:99,background:e.color+"18",border:"1px solid "+e.color+"40",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,zIndex:1}}>
<Ic t={e.icon==="stage"?"aUp":e.icon} s={12} c={e.color}/>
</div>
<div style={{flex:1,paddingTop:4}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
<div style={{fontSize:11,fontWeight:600,color:T.tx}}>{e.label}</div>
<div style={{fontSize:9,color:T.tx3,fontFamily:MONO,whiteSpace:"nowrap"}}>{fmtAgo(e.at)}</div>
</div>
<div style={{fontSize:10,color:T.tx3,marginTop:1}}>{e.desc} {e.by&&e.by!=="System"&&<span style={{color:T.tx2}}>by {e.by}</span>}</div>
<div style={{fontSize:8,color:T.tx3+"80",marginTop:1,fontFamily:MONO}}>{fmtDT(e.at)}</div>
</div>
</div>
))}
</div>);
})()}
</div></Mod>}

{showAdd&&<Mod title="Add New Lead" onClose={()=>setShowAdd(false)} wide><AddLeadForm allUsers={allUsers} onClose={()=>setShowAdd(false)} onAdd={l=>{setLeads(p=>[l,...p]);notifyNewLead({name:l.name,source:l.source,pipeline:l.pipeline||l.source,leadId:l.id});if((+l.value||0)>=10000)notifyHotLead({name:l.name,reason:"High value · "+fS(l.value),leadId:l.id,pipeline:l.pipeline||l.source});setShowAdd(false)}}/></Mod>}
{showImport&&<Mod title="Import Leads from CSV" onClose={()=>setShowImport(false)} wide><ImportLeadsForm onClose={()=>setShowImport(false)} onImport={newLeads=>{setLeads(p=>[...newLeads,...p]);setShowImport(false)}}/></Mod>}
{showLog&&<Mod title="Log a Call" onClose={()=>setShowLog(null)}><LogCallForm leads={leadsHydrated} info={showLog} user={user} allUsers={allUsers} onClose={()=>setShowLog(null)} onLog={(id,d,o,by)=>{addCall(id,d,o,by);setShowLog(null)}}/></Mod>}
{showPay&&<Mod title={"Record Payment — "+showPay.name} onClose={()=>setShowPay(null)}><AddPaymentForm lead={showPay} onClose={()=>setShowPay(null)} onAdd={(amt,what,type)=>{addPayment(showPay.id,amt,what,type);setShowPay(null);if(showPay.id===sel?.id)setSel(p=>({...p,payments:[...(p.payments||[]),{amount:+amt,date:new Date().toISOString(),what:what,type:type}]}))}}/></Mod>}
{showAddPipeline&&<Mod title="Add New Pipeline" onClose={()=>setShowAddPipeline(false)}><AddPipelineForm onClose={()=>setShowAddPipeline(false)} onAdd={p=>{setPipelines(prev=>[...prev,p]);supabase.from('pipelines').insert({...p,sort_order:pipelines.length}).then(({error})=>{if(error){console.error('Pipeline insert failed',{p,error});alert('Could not save the new pipeline: '+(error.message||error.code||'unknown error'))}});setActivePipeline(p.id);setShowAddPipeline(false)}}/></Mod>}
{showAddStage&&<Mod title={"Add Stage to "+(showAddStage==="setter"?"Setter":"Closer")+" Pipeline"} onClose={()=>setShowAddStage(null)}><AddStageForm kind={showAddStage} onClose={()=>setShowAddStage(null)} onAdd={s=>{const tbl=showAddStage==="setter"?'setter_stages':'closer_stages';const list=showAddStage==="setter"?setterStages:closerStages;if(showAddStage==="setter")setSetterStages(prev=>[...prev,s]);else setCloserStages(prev=>[...prev,s]);console.log('[addStage] INSERT into Supabase',{tbl,row:{id:s.id,label:s.l,color:s.c,sort_order:list.length}});supabase.from(tbl).insert({id:s.id,label:s.l,color:s.c,sort_order:list.length,pipeline_id:activePipeline}).then(({error})=>{if(error){console.error('[addStage] Supabase insert FAILED — stage will vanish on refresh',{tbl,s,error});{const m=(error.message||'')+(error.code?' ['+error.code+']':'');const hint=/pipeline_id|does not exist|42703/i.test(m)?'\n\nThe stages tables are missing the per-pipeline column. Run add-pipeline-id-to-stages.sql in Supabase.':/relation.*does not exist|42P01/i.test(m)?'\n\nThe stages table is missing. Run fix-crm-persistence.sql then add-pipeline-id-to-stages.sql.':'\n\nLikely RLS — check the policy on '+tbl+'.';alert('Could not save the new stage: '+(error.message||error.code||'unknown error')+hint)}}else console.log('[addStage] Supabase insert OK',{tbl,id:s.id})});setShowAddStage(null)}}/></Mod>}
{showEditStage&&<Mod title={"Edit Stage — "+showEditStage.stage.l} onClose={()=>setShowEditStage(null)}><EditStageForm stage={showEditStage.stage} kind={showEditStage.kind} onClose={()=>setShowEditStage(null)} onSave={patch=>{editStage(showEditStage.kind,showEditStage.stage.id,patch);setShowEditStage(null)}} onDelete={()=>{const cnt=showEditStage.kind==="setter"?leadsHydrated.filter(l=>l.setterStage===showEditStage.stage.id).length:closerLeads.filter(l=>l.closerStage===showEditStage.stage.id).length;const msg=cnt>0?"Delete stage \""+showEditStage.stage.l+"\"? "+cnt+" lead"+(cnt>1?"s":"")+" will move to the first stage.":"Delete stage \""+showEditStage.stage.l+"\"?";if(confirm(msg)){deleteStage(showEditStage.kind,showEditStage.stage.id);setShowEditStage(null)}}}/></Mod>}
{showEdit&&<Mod title={"Edit Lead — "+showEdit.name} onClose={()=>setShowEdit(null)} wide><EditLeadForm lead={showEdit} allUsers={allUsers} onClose={()=>setShowEdit(null)} onSave={patch=>{updateLead(showEdit.id,patch);setShowEdit(null)}} onDelete={()=>{if(confirm("Delete lead "+showEdit.name+"? This cannot be undone.")){setLeads(p=>p.filter(l=>l.id!==showEdit.id));supabase.from('leads').delete().eq('id',showEdit.id);}setShowEdit(null);setSel(null)}}/></Mod>}
{activeCall&&<CallModal call={activeCall} user={user} onClose={()=>setActiveCall(null)} onLog={(dur,outcome)=>{addCall(activeCall.lead.id,dur,outcome,user?.name||"Team");setActiveCall(null)}}/>}
</div>)}

/* CALL MODAL — phone screen with timer, end-call → duration+outcome → auto log */
function CallModal({call,user,onClose,onLog}){
const[phase,setPhase]=useState("ringing");/* ringing | wrap */
const[elapsed,setElapsed]=useState(0);
const[outcome,setOutcome]=useState("");
const[durOverride,setDurOverride]=useState("");
const[outResult,setOutResult]=useState("connected");/* connected | no_answer | voicemail | wrong_num */
const lead=call.lead;
const phone=lead.phone||"";
useEffect(()=>{
  if(phase!=="ringing")return;
  const t=setInterval(()=>setElapsed(Math.floor((Date.now()-call.startedAt)/1000)),1000);
  return()=>clearInterval(t);
},[phase,call.startedAt]);
const mm=String(Math.floor(elapsed/60)).padStart(2,"0");
const ss=String(elapsed%60).padStart(2,"0");
const endCall=()=>{
  setDurOverride(String(Math.max(1,Math.ceil(elapsed/60))));
  setPhase("wrap");
};
const submit=()=>{
  const dur=parseInt(durOverride)||0;
  const out=outResult==="connected"?(outcome||"Connected"):outResult==="no_answer"?"No answer":outResult==="voicemail"?"Left voicemail":"Wrong number";
  onLog(dur,outcome?out+" — "+outcome:out);
};
const isMobile=typeof window!=="undefined"&&/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
return(
<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,backdropFilter:"blur(6px)"}} onClick={onClose}>
<div style={{background:T.s1,borderRadius:16,width:"92%",maxWidth:380,padding:0,border:"1px solid "+T.bdr,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
{phase==="ringing"?<>
<div style={{padding:"30px 24px 22px",textAlign:"center",background:"linear-gradient(180deg,"+T.s2+","+T.s1+")"}}>
<div style={{width:84,height:84,borderRadius:99,background:"linear-gradient(135deg,"+T.accD+","+T.acc+")",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:30,fontWeight:800,color:"#000",fontFamily:MONO}}>{lead.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
<div style={{fontSize:18,fontWeight:700,color:T.tx,marginBottom:4}}>{lead.name}</div>
<div style={{fontSize:13,color:T.tx2,fontFamily:MONO,marginBottom:2}}>{phone||"No phone number"}</div>
<div style={{fontSize:10,color:T.tx3}}>{lead.company}</div>
<div style={{marginTop:18,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
<div style={{width:8,height:8,borderRadius:99,background:T.grn,animation:"pulse 1s infinite"}}/>
<span style={{fontSize:11,color:T.grn,fontWeight:600,letterSpacing:.5}}>CALL IN PROGRESS</span>
</div>
<div style={{fontSize:34,fontWeight:700,color:T.tx,fontFamily:MONO,marginTop:12,letterSpacing:1}}>{mm}:{ss}</div>
</div>
<div style={{padding:"18px 24px 24px",display:"flex",flexDirection:"column",gap:10}}>
{isMobile&&phone&&<a href={"tel:"+phone} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px",borderRadius:10,background:T.grnBg,color:T.grn,border:"1px solid "+T.grnD+"40",textDecoration:"none",fontWeight:600,fontSize:13,fontFamily:FONT}}><Ic t="phone" s={16} c={T.grn}/>Dial {phone}</a>}
<button onClick={endCall} style={{padding:"14px",borderRadius:10,background:T.redBg,color:T.red,border:"1px solid "+T.redD+"40",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:FONT,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Ic t="x" s={16} c={T.red}/>End Call</button>
<button onClick={onClose} style={{padding:"8px",borderRadius:8,background:"transparent",color:T.tx3,border:"none",cursor:"pointer",fontSize:11,fontFamily:FONT}}>Cancel without logging</button>
</div>
</>:<>
<div style={{padding:"22px 24px 14px"}}>
<div style={{fontSize:15,fontWeight:700,color:T.tx,marginBottom:4}}>Log call — {lead.name}</div>
<div style={{fontSize:11,color:T.tx3}}>Auto-saved to {lead.name}'s call history</div>
</div>
<div style={{padding:"0 24px 22px",display:"flex",flexDirection:"column",gap:12}}>
<div>
<label style={{fontSize:10,color:T.tx3,fontWeight:500,textTransform:"uppercase",letterSpacing:.6,marginBottom:5,display:"block"}}>Outcome</label>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
{[["connected","Connected",T.grn],["no_answer","No Answer",T.yel],["voicemail","Voicemail",T.blu],["wrong_num","Wrong #",T.red]].map(([k,l,c])=><button key={k} onClick={()=>setOutResult(k)} style={{padding:"8px 10px",borderRadius:6,border:"1px solid "+(outResult===k?c:T.bdr),background:outResult===k?c+"18":T.s2,color:outResult===k?c:T.tx2,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:FONT}}>{l}</button>)}
</div>
</div>
<Inp label="Duration (minutes)" value={durOverride} onChange={setDurOverride} type="number" mono/>
<Inp label="Notes / Outcome details" value={outcome} onChange={setOutcome} ph="What was discussed? Next steps?" ta/>
<div style={{display:"flex",gap:8,marginTop:4}}>
<Btn full onClick={onClose}>Cancel</Btn>
<Btn v="pri" full icon="chk" onClick={submit}>Log Call</Btn>
</div>
</div>
</>}
</div>
</div>);}

function ImportLeadsForm({onClose,onImport}){
const[csv,setCsv]=useState("");
const[preview,setPreview]=useState([]);
const[err,setErr]=useState("");
const[pipeline,setPipeline]=useState("instagram-outbound");
const PIPE_OPTS=[
  {v:"instagram-outbound",l:"Instagram Outbound"},
  {v:"instagram-inbound",l:"Instagram Inbound"},
  {v:"whop-course-buyer",l:"Whop Leads"},
  {v:"webinar",l:"Webinar"},
];
const parseCSV=(text)=>{
  setErr("");
  const lines=text.trim().split("\n").filter(l=>l.trim());
  if(!lines.length){setPreview([]);return}
  const header=lines[0].split(",").map(h=>h.trim().toLowerCase().replace(/[^a-z0-9]/g,"_"));
  const rows=lines.slice(1).map(line=>{
    const vals=line.split(",").map(v=>v.trim().replace(/^"|"$/g,""));
    const obj={};header.forEach((h,i)=>{obj[h]=vals[i]||""});
    return obj;
  }).filter(r=>r.name||r.full_name||r.contact_name);
  setPreview(rows.slice(0,5));
  return rows;
};
const handleImport=async()=>{
  const rows=parseCSV(csv);
  if(!rows||!rows.length){setErr("No valid rows found. Make sure CSV has a 'name' column.");return}
  const leads=rows.map(r=>({
    id:"lead_"+uid(),
    name:(r.name||r.full_name||r.contact_name||"Unknown").trim(),
    email:r.email||r.email_address||null,
    phone:r.phone||r.phone_number||r.mobile||null,
    company:r.company||r.business||null,
    source:pipeline,
    setterStage:"new",
    closerStage:null,
    value:+(r.value||r.deal_value||0)||0,
    notes:r.notes||r.note||null,
    setter:null,closer:null,product:null,city:r.city||null,industry:r.industry||null,
    createdAt:new Date().toISOString(),
    calls:0,callLogs:[],followUps:[],setterHistory:[{stage:"new",at:new Date().toISOString(),by:"Import"}],closerHistory:[],payments:[],
  }));
  /* Batch insert into Supabase */
  const dbLeads=leads.map(l=>({
    id:l.id,name:l.name,email:l.email,phone:l.phone,company:l.company,source:l.source,
    setter_stage:l.setterStage,closer_stage:l.closerStage,value:l.value,notes:l.notes,
    setter:l.setter,closer:l.closer,product:l.product,city:l.city,industry:l.industry,
    created_at:l.createdAt,calls:0,call_logs:"[]",follow_ups:"[]",
    setter_history:JSON.stringify(l.setterHistory),closer_history:"[]",payments:"[]",
  }));
  const{error}=await supabase.from('leads').insert(dbLeads);
  if(error){setErr("DB error: "+error.message);return}
  notifyNewLead(leads.length===1?{name:leads[0].name,pipeline,leadId:leads[0].id}:{count:leads.length,pipeline});
  onImport(leads);
};
return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
<div style={{padding:10,background:T.bluBg,borderRadius:6,fontSize:11,color:T.blu,display:"flex",gap:8,alignItems:"flex-start"}}><Ic t="alert" s={14}/>
<div><div style={{fontWeight:600,marginBottom:3}}>CSV Format</div>
<div style={{opacity:.85}}>First row must be headers. Required: <code style={{background:T.s3,padding:"1px 4px",borderRadius:3}}>name</code>. Optional: email, phone, company, city, value, notes</div></div>
</div>
<Sel label="Assign to Pipeline" value={pipeline} onChange={setPipeline} opts={PIPE_OPTS}/>
<Inp label="Paste CSV data here" value={csv} onChange={v=>{setCsv(v);parseCSV(v)}} ta ph={"name,email,phone,company\nRaj Sharma,raj@example.com,+91 98765,GrowthX"}/>
{preview.length>0&&<div>
<div style={{fontSize:10,color:T.tx3,marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Preview ({preview.length} of {csv.trim().split("\n").length-1} rows)</div>
<div style={{background:T.s2,borderRadius:6,overflow:"hidden"}}>
{preview.map((r,i)=><div key={i} style={{padding:"7px 12px",borderBottom:"1px solid "+T.bdr+"40",fontSize:11,display:"flex",gap:10,alignItems:"center"}}><Av name={r.name||r.full_name||"?"} sz={24}/><span style={{color:T.tx,fontWeight:500}}>{r.name||r.full_name}</span><span style={{color:T.tx3,flex:1}}>{r.email||r.phone||""}</span>{r.value>0&&<span style={{fontFamily:MONO,color:T.acc}}>{fS(+r.value)}</span>}</div>)}
</div>
</div>}
{err&&<div style={{padding:8,background:T.redBg,borderRadius:5,fontSize:11,color:T.red}}>{err}</div>}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,paddingTop:4}}>
<span style={{fontSize:10,color:T.tx3}}>Leads will be added to the selected pipeline in "New Lead" stage</span>
<div style={{display:"flex",gap:6}}><Btn onClick={onClose}>Cancel</Btn><Btn v="pri" icon="aDown" onClick={handleImport}>Import {preview.length?csv.trim().split("\n").length-1+" leads":""}</Btn></div>
</div>
</div>)}

function AddPaymentForm({lead,onClose,onAdd}){const[amt,setAmt]=useState("");const[what,setWhat]=useState(lead.product||"");const[type,setType]=useState("token");
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{padding:10,background:T.s2,borderRadius:6,fontSize:11,color:T.tx2}}>Current LTV: <span style={{fontFamily:MONO,fontWeight:600,color:T.grn}}>{fS((lead.payments||[]).reduce((a,p)=>a+p.amount,0))}</span> | Deal Value: <span style={{fontFamily:MONO,fontWeight:600,color:T.acc}}>{fS(lead.value)}</span></div>
<Inp label="Amount ₹" value={amt} onChange={setAmt} ph="50000" type="number" mono/>
<Inp label="What is this payment for?" value={what} onChange={setWhat} ph="VIP Course"/>
<Sel label="Payment Type" value={type} onChange={setType} opts={[{v:"token",l:"Token / Advance Payment (warm 2 days)"},{v:"installment",l:"Installment"},{v:"final",l:"Final Payment"}]}/>
<div style={{padding:8,background:T.yelBg,borderRadius:5,fontSize:10,color:T.yel,display:"flex",gap:5}}><Ic t="alert" s={12}/>Token payment makes lead "hot" for 48 hrs · Triggers invoice automation</div>
<div style={{display:"flex",justifyContent:"flex-end",gap:6}}><Btn onClick={onClose}>Cancel</Btn><Btn v="ok" icon="dollar" onClick={()=>{if(+amt>0)onAdd(amt,what,type)}}>Record</Btn></div></div>)}

function AddPipelineForm({onClose,onAdd}){
const[name,setName]=useState("");
const[selSources,setSelSources]=useState([]);
const[color,setColor]=useState(T.acc);
const[icon,setIcon]=useState("link");
const COLORS=[{v:T.acc,l:"Amber"},{v:T.pur,l:"Purple"},{v:T.cyn,l:"Cyan"},{v:T.blu,l:"Blue"},{v:T.grn,l:"Green"},{v:T.yel,l:"Yellow"},{v:T.red,l:"Red"},{v:"#e1306c",l:"Pink"},{v:"#0a66c2",l:"LinkedIn Blue"}];
const ICONS=["link","whop","tgt","phone","users","mail","sales"];
const toggleSrc=s=>setSelSources(prev=>prev.includes(s)?prev.filter(x=>x!==s):[...prev,s]);
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<Inp label="Pipeline Name" value={name} onChange={setName} ph="e.g. YouTube, TikTok, Newsletter"/>

<div><div style={{fontSize:10,color:T.tx3,fontWeight:500,textTransform:"uppercase",letterSpacing:.6,marginBottom:5}}>Lead Sources for this pipeline</div>
<div style={{display:"flex",flexWrap:"wrap",gap:5}}>
{SOURCES.map(s=><button key={s} onClick={()=>toggleSrc(s)} style={{padding:"5px 10px",borderRadius:5,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:FONT,border:"1px solid "+(selSources.includes(s)?T.acc:T.bdr),background:selSources.includes(s)?T.accBg:"transparent",color:selSources.includes(s)?T.acc:T.tx3}}>{s}</button>)}
</div>
<div style={{fontSize:9,color:T.tx3,marginTop:5}}>Select which sources should appear in this pipeline. Pick none to include all.</div></div>

<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
<div><div style={{fontSize:10,color:T.tx3,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:.6}}>Color</div>
<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
{COLORS.map(c=><button key={c.v} onClick={()=>setColor(c.v)} title={c.l} style={{width:24,height:24,borderRadius:6,background:c.v,border:color===c.v?"2px solid "+T.tx:"1px solid "+T.bdr,cursor:"pointer"}}/>)}
</div></div>
<div><div style={{fontSize:10,color:T.tx3,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:.6}}>Icon</div>
<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
{ICONS.map(i=><button key={i} onClick={()=>setIcon(i)} style={{width:30,height:30,borderRadius:6,background:icon===i?color+"30":T.s1,border:icon===i?"2px solid "+color:"1px solid "+T.bdr,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t={i} s={14} c={icon===i?color:T.tx3}/></button>)}
</div></div>
</div>

<div style={{padding:10,background:T.s2,borderRadius:6,display:"flex",alignItems:"center",gap:8}}>
<span style={{fontSize:10,color:T.tx3}}>Preview:</span>
<button style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:7,fontSize:11,fontWeight:600,background:color+"20",color:color,border:"1px solid "+color+"50",fontFamily:FONT}}><Ic t={icon} s={12} c={color}/>{name||"Pipeline Name"}</button>
</div>

<div style={{display:"flex",justifyContent:"flex-end",gap:6}}>
<Btn onClick={onClose}>Cancel</Btn>
<Btn v="pri" icon="plus" onClick={()=>{if(!name.trim())return;onAdd({id:"p_"+uid(),name:name.trim(),sources:selSources,color:color,icon:icon})}}>Create Pipeline</Btn>
</div></div>)}

function AddStageForm({kind,onClose,onAdd}){
const[label,setLabel]=useState("");
const[color,setColor]=useState(T.acc);
const COLORS=[{v:T.blu,l:"Blue"},{v:T.cyn,l:"Cyan"},{v:T.acc,l:"Amber"},{v:T.pur,l:"Purple"},{v:T.yel,l:"Yellow"},{v:T.grn,l:"Green"},{v:T.red,l:"Red"},{v:"#f97316",l:"Orange"},{v:T.tx3,l:"Gray"}];
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<Inp label="Stage Name" value={label} onChange={setLabel} ph={kind==="setter"?"e.g. Demo Scheduled, Pre-Call":"e.g. Contract Sent, Negotiation"}/>

<div><div style={{fontSize:10,color:T.tx3,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:.6}}>Color</div>
<div style={{display:"flex",flexWrap:"wrap",gap:5}}>
{COLORS.map(c=><button key={c.v} onClick={()=>setColor(c.v)} title={c.l} style={{width:30,height:30,borderRadius:6,background:c.v+"30",border:color===c.v?"2px solid "+c.v:"1px solid "+T.bdr,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{width:8,height:8,borderRadius:99,background:c.v}}/></button>)}
</div></div>

<div style={{padding:10,background:T.s2,borderRadius:6,display:"flex",alignItems:"center",gap:8}}>
<span style={{fontSize:10,color:T.tx3}}>Preview:</span>
<div style={{padding:"6px 10px",borderRadius:7,background:T.s3,border:"1px solid "+T.bdr,display:"flex",alignItems:"center",gap:5}}><span style={{width:6,height:6,borderRadius:99,background:color}}/><span style={{fontSize:11,fontWeight:600,color:T.tx}}>{label||"Stage Name"}</span></div>
</div>

<div style={{padding:8,background:T.bluBg,borderRadius:5,fontSize:10,color:T.blu,display:"flex",gap:5}}><Ic t="alert" s={12}/>This stage will be added to the {kind==="setter"?"Setter":"Closer"} pipeline. The stage gets appended to the end — you can move leads to it from the lead detail view.</div>

<div style={{display:"flex",justifyContent:"flex-end",gap:6}}>
<Btn onClick={onClose}>Cancel</Btn>
<Btn v="pri" icon="plus" onClick={()=>{if(!label.trim())return;onAdd({id:"st_"+uid(),l:label.trim(),c:color})}}>Add Stage</Btn>
</div></div>)}

function EditStageForm({stage,kind,onClose,onSave,onDelete}){
const[label,setLabel]=useState(stage.l);
const[color,setColor]=useState(stage.c);
const COLORS=[{v:T.blu,l:"Blue"},{v:T.cyn,l:"Cyan"},{v:T.acc,l:"Amber"},{v:T.pur,l:"Purple"},{v:T.yel,l:"Yellow"},{v:T.grn,l:"Green"},{v:T.red,l:"Red"},{v:"#f97316",l:"Orange"},{v:T.tx3,l:"Gray"}];
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<Inp label="Stage Name" value={label} onChange={setLabel} ph="Stage name"/>
<div><div style={{fontSize:10,color:T.tx3,fontWeight:500,marginBottom:5,textTransform:"uppercase",letterSpacing:.6}}>Color</div>
<div style={{display:"flex",flexWrap:"wrap",gap:5}}>
{COLORS.map(c=><button key={c.v} onClick={()=>setColor(c.v)} title={c.l} style={{width:30,height:30,borderRadius:6,background:c.v+"30",border:color===c.v?"2px solid "+c.v:"1px solid "+T.bdr,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{width:8,height:8,borderRadius:99,background:c.v}}/></button>)}
</div></div>
<div style={{padding:10,background:T.s2,borderRadius:6,display:"flex",alignItems:"center",gap:8}}>
<span style={{fontSize:10,color:T.tx3}}>Preview:</span>
<div style={{padding:"6px 10px",borderRadius:7,background:T.s3,border:"1px solid "+T.bdr,display:"flex",alignItems:"center",gap:5}}><span style={{width:6,height:6,borderRadius:99,background:color}}/><span style={{fontSize:11,fontWeight:600,color:T.tx}}>{label||"Stage Name"}</span></div>
</div>
<div style={{padding:8,background:T.bluBg,borderRadius:5,fontSize:10,color:T.blu,display:"flex",gap:5}}><Ic t="alert" s={12}/>Renaming a stage updates it everywhere immediately. Deleting will move all leads in this stage to the first remaining stage.</div>
<div style={{display:"flex",justifyContent:"space-between",gap:6}}>
<Btn v="dan" icon="trash" onClick={onDelete}>Delete Stage</Btn>
<div style={{display:"flex",gap:6}}>
<Btn onClick={onClose}>Cancel</Btn>
<Btn v="pri" icon="chk" onClick={()=>{if(!label.trim())return;onSave({l:label.trim(),c:color})}}>Save Changes</Btn>
</div></div></div>)}

function EditLeadForm({lead,onClose,onSave,onDelete,allUsers}){
const[f,setF]=useState({
name:lead.name||"",company:lead.company||"",email:lead.email||"",phone:lead.phone||"",
source:lead.source||"",priority:lead.priority||"warm",value:lead.value||0,
product:lead.product||"",city:lead.city||"",industry:lead.industry||"",
notes:lead.notes||"",setter:lead.setter||"",closer:lead.closer||""
});
const u=(k,v)=>setF(p=>({...p,[k]:v}));
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{padding:10,background:T.accBg,borderRadius:6,fontSize:11,color:T.acc,display:"flex",gap:5}}><Ic t="alert" s={13}/>Edit Mode — changes apply immediately and are visible to all departments</div>

<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
<Inp label="Name" value={f.name} onChange={v=>u("name",v)}/>
<Inp label="Company" value={f.company} onChange={v=>u("company",v)}/>
<Inp label="Email" value={f.email} onChange={v=>u("email",v)}/>
<Inp label="Phone" value={f.phone} onChange={v=>u("phone",v)}/>
<Sel label="Source" value={f.source} onChange={v=>u("source",v)} opts={SOURCES.map(s=>({v:s,l:s}))}/>
<Sel label="Priority" value={f.priority} onChange={v=>u("priority",v)} opts={[{v:"hot",l:"Hot"},{v:"warm",l:"Warm"},{v:"cold",l:"Cold"}]}/>
<Inp label="Deal Value ₹" value={f.value} onChange={v=>u("value",+v||0)} type="number" mono/>
<Inp label="Product" value={f.product} onChange={v=>u("product",v)}/>
<Inp label="City" value={f.city} onChange={v=>u("city",v)}/>
<Inp label="Industry" value={f.industry} onChange={v=>u("industry",v)}/>
<Sel label="Setter" value={f.setter} onChange={v=>u("setter",v)} opts={[{v:"",l:"Unassigned"},...((allUsers||[]).filter(x=>x.subrole==="setter"||x.role==="admin").map(x=>({v:x.name,l:x.name})))]}/>
<Sel label="Closer" value={f.closer} onChange={v=>u("closer",v)} opts={[{v:"",l:"Unassigned"},...((allUsers||[]).filter(x=>x.subrole==="closer"||x.role==="admin").map(x=>({v:x.name,l:x.name})))]}/>
</div>
<Inp label="Notes" value={f.notes} onChange={v=>u("notes",v)} ta/>

<div style={{padding:10,background:T.s2,borderRadius:6,fontSize:10,color:T.tx3}}>
<div style={{fontWeight:600,color:T.tx2,marginBottom:4}}>Read-only data (auto-tracked):</div>
<div>Calls: {lead.calls} · LTV: {fS((lead.payments||[]).reduce((a,p)=>a+p.amount,0))} · Created: {fmtDT(lead.createdAt)}</div>
<div>Setter Stage: {lead.setterStage} · Closer Stage: {lead.closerStage||"—"}</div>
</div>

<div style={{display:"flex",justifyContent:"space-between",gap:6}}>
<Btn v="dan" icon="trash" onClick={onDelete}>Delete Lead</Btn>
<div style={{display:"flex",gap:6}}>
<Btn onClick={onClose}>Cancel</Btn>
<Btn v="pri" icon="chk" onClick={()=>{onSave(f)}}>Save Changes</Btn>
</div></div></div>)}

function AddLeadForm({onClose,onAdd,allUsers}){const[f,setF]=useState({name:"",company:"",email:"",phone:"",source:"",priority:"warm",value:"",product:"VIP Course",city:"",industry:"",notes:"",setter:"",closer:""});const u=(k,v)=>setF(p=>({...p,[k]:v}));
return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
<Inp label="Name" value={f.name} onChange={v=>u("name",v)} ph="Full name"/>
<Inp label="Company" value={f.company} onChange={v=>u("company",v)} ph="Company"/>
<Inp label="Email" value={f.email} onChange={v=>u("email",v)} ph="email@co.com"/>
<Inp label="Phone" value={f.phone} onChange={v=>u("phone",v)} ph="+91 98765 43210"/>
<Sel label="Source" value={f.source} onChange={v=>u("source",v)} opts={SOURCES.map(s=>({v:s,l:s}))}/>
<Sel label="Priority" value={f.priority} onChange={v=>u("priority",v)} opts={[{v:"hot",l:"Hot"},{v:"warm",l:"Warm"},{v:"cold",l:"Cold"}]}/>
<Inp label="Value" value={f.value} onChange={v=>u("value",v)} ph="2500000" type="number" mono/>
<Sel label="Setter" value={f.setter} onChange={v=>u("setter",v)} opts={[{v:"",l:"Unassigned"},...((allUsers||[]).filter(x=>x.subrole==="setter"||x.role==="admin").map(x=>({v:x.name,l:x.name})))]}/>
<Sel label="Closer" value={f.closer} onChange={v=>u("closer",v)} opts={[{v:"",l:"Unassigned"},...((allUsers||[]).filter(x=>x.subrole==="closer"||x.role==="admin").map(x=>({v:x.name,l:x.name})))]}/>
<div style={{gridColumn:"span 2"}}><Inp label="Notes" value={f.notes} onChange={v=>u("notes",v)} ph="Context..." ta/></div>
<div style={{gridColumn:"span 2",display:"flex",justifyContent:"flex-end",gap:6}}><Btn onClick={onClose}>Cancel</Btn>
<Btn v="pri" icon="plus" onClick={()=>{if(!f.name||!f.company)return;const now=new Date().toISOString();onAdd({id:uid(),name:f.name,company:f.company,email:f.email,phone:f.phone,source:f.source,setterStage:"new",closerStage:null,priority:f.priority,value:+f.value||0,setter:f.setter,closer:f.closer,product:f.product,city:f.city,industry:f.industry,notes:f.notes,createdAt:now,tokenPaidAt:null,firstPaidAt:null,calls:0,callLogs:[],followUps:[{date:TODAY,done:false,note:"Initial outreach"}],setterHistory:[{stage:"new",at:now,by:"Manual"}],closerHistory:[],payments:[]})}}>Add Lead</Btn></div></div>)}

function LogCallForm({leads,info,onClose,onLog,allUsers,user}){const callerOpts=(allUsers||[]).filter(x=>x.subrole==="setter"||x.subrole==="closer"||x.role==="admin").map(x=>({v:x.name,l:x.name+(x.subrole?" ("+(x.subrole==="setter"?"Setter":"Closer")+")":"")}));const[lid,setLid]=useState(info.leadId||"");const[dur,setDur]=useState("");const[out,setOut]=useState("");const[by,setBy]=useState(user?.name||(callerOpts[0]?.v||""));
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<Sel label="Lead" value={lid} onChange={setLid} opts={[{v:"",l:"Select..."},...leads.map(l=>({v:l.id,l:l.name+" ("+l.company+")"}))]}/>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
<Inp label="Duration (min)" value={dur} onChange={setDur} ph="15" type="number" mono/>
<Sel label="Caller" value={by} onChange={setBy} opts={callerOpts.length>0?callerOpts:[{v:"",l:"No team members"}]}/></div>
<Inp label="Outcome" value={out} onChange={setOut} ph="What happened?" ta/>
<div style={{display:"flex",justifyContent:"flex-end",gap:6}}><Btn onClick={onClose}>Cancel</Btn><Btn v="pri" icon="phone" onClick={()=>{if(lid&&dur)onLog(lid,dur,out,by)}}>Save</Btn></div></div>)}

/* ═══ FINANCE ═══ */
function FinP({invoices,setInvoices,leads,bankPayments,setBankPayments,linkBankPayment}){const[vw,setVw]=useState("overview");const[showPay,setShowPay]=useState(null);const[showCreate,setShowCreate]=useState(false);const[showInvPrev,setShowInvPrev]=useState(null);const[showBankSetup,setShowBankSetup]=useState(false);
const totI=invoices.reduce((a,i)=>a+i.amount,0),totP=invoices.reduce((a,i)=>a+i.paid,0);
const pay=(id,amt)=>{setInvoices(p=>p.map(i=>{if(i.id!==id)return i;const newPaid=i.paid+amt;const newStatus=newPaid>=i.amount?"paid":"partial";supabase.from('invoices').update({paid:newPaid,status:newStatus}).eq('id',id);return{...i,paid:newPaid,status:newStatus}}));setShowPay(null)};
const bankIn=bankPayments?bankPayments.reduce((a,b)=>a+b.amount,0):0;
const unmatchedBank=bankPayments?bankPayments.filter(b=>b.status==="unmatched"):[];

/* Cash collected per lead — enriched view */
const leadCash=useMemo(()=>{
  if(!leads)return[];
  return leads.filter(l=>l.payments&&l.payments.length>0).map(l=>{
    const ltv=l.payments.reduce((a,p)=>a+p.amount,0);
    const lastPmt=l.payments[l.payments.length-1];
    return{...l,ltv,lastPmtDate:lastPmt.date,lastPmtAmount:lastPmt.amount,pmtCount:l.payments.length};
  }).sort((a,b)=>b.ltv-a.ltv);
},[leads]);

const totCashFromLeads=leadCash.reduce((a,l)=>a+l.ltv,0);
const sourceCash=useMemo(()=>{
  const map={};
  leadCash.forEach(l=>{map[l.source]=(map[l.source]||0)+l.ltv});
  return Object.entries(map).sort((a,b)=>b[1]-a[1]);
},[leadCash]);

const avgTicket=leadCash.length>0?Math.round(totCashFromLeads/leadCash.length):0;

/* Real revenue by month — from lead payments, last 6 months */
const monthlyRev=useMemo(()=>{
  const now=new Date();
  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({y:d.getFullYear(),m:d.getMonth(),label:d.toLocaleString("en-US",{month:"short"}),r:0});
  }
  (leads||[]).forEach(l=>(l.payments||[]).forEach(p=>{
    if(!p.date)return;
    let d;
    if(typeof p.date==='string'&&/^\d{1,2}\/\d{1,2}\/\d{4}/.test(p.date)){
      const[dd,mm,rest]=p.date.split('/');
      d=new Date(parseInt(rest),parseInt(mm)-1,parseInt(dd));
    }else d=new Date(p.date);
    if(isNaN(d.getTime()))return;
    const bucket=months.find(x=>x.y===d.getFullYear()&&x.m===d.getMonth());
    if(bucket)bucket.r+=Number(p.amount)||0;
  }));
  return months;
},[leads]);

return(
<div style={{display:"flex",flexDirection:"column",gap:16}}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
<St label="Revenue" value={fS(totCashFromLeads)} sub="cash collected" icon="dollar" color={T.grn}/>
<St label="Cash from Leads" value={fS(totCashFromLeads)} sub={leadCash.length+" paying"} icon="dollar" color={T.grn}/>
<St label="Avg Ticket" value={fS(avgTicket)} icon="bar" color={T.acc}/>
<St label="Invoiced" value={fS(totI)} icon="inv" color={T.blu}/>
<St label="Collected" value={fS(totP)} icon="chk" color={T.grn}/>
<St label="Outstanding" value={fS(totI-totP)} sub={invoices.filter(i=>i.due<TODAY&&i.status!=="paid").length+" overdue"} icon="alert" color={T.red}/></div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
<TabBar tabs={[{id:"overview",l:"Overview"},{id:"inv",l:"Invoices"},{id:"bank",l:"Bank Feed"},{id:"cash",l:"Cash Collected"},{id:"rec",l:"Recurring"},{id:"exp",l:"Expenses"}]} a={vw} onChange={setVw}/>
<Btn v="pri" icon="plus" onClick={()=>setShowCreate(true)}>Create Invoice</Btn></div>

{vw==="overview"&&<div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
<Crd title="Revenue by Month (Last 6)"><div style={{display:"flex",alignItems:"flex-end",gap:7,height:170}}>{(()=>{const mx=Math.max(...monthlyRev.map(d=>d.r),1);return monthlyRev.map((m,i)=>(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
<div style={{display:"flex",gap:2,alignItems:"flex-end",width:"100%",justifyContent:"center",height:145}}><div style={{width:"60%",background:"linear-gradient(to top,"+T.grnD+","+T.grn+")",borderRadius:"3px 3px 0 0",height:(m.r/mx)*100+"%"}} title={fS(m.r)}/></div><span style={{fontSize:9,color:T.tx3}}>{m.label}</span><span style={{fontSize:9,fontFamily:MONO,color:T.tx2}}>{fS(m.r)}</span></div>))})()}</div></Crd>
<Crd title="Cash Flow">{[{l:"Invoiced",v:fS(totI),c:T.blu},{l:"Collected",v:fS(totP),c:T.grn},{l:"Outstanding",v:fS(totI-totP),c:T.red},{l:"From Leads",v:fS(totCashFromLeads),c:T.acc}].map(i=><div key={i.l} style={{background:T.s1,borderRadius:5,padding:10,marginBottom:6}}><div style={{fontSize:9,color:T.tx3}}>{i.l}</div><div style={{fontSize:16,fontWeight:700,color:i.c,fontFamily:MONO}}>{i.v}</div></div>)}</Crd></div>}

{/* CASH COLLECTED PER LEAD */}
{vw==="cash"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
<Crd title="Revenue by Source">
{sourceCash.map(([src,amt])=><div key={src} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid "+T.bdr+"10"}}>
<div style={{width:32,height:32,borderRadius:7,background:src.includes("Whop")?T.purBg:T.accBg,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t={src.includes("Whop")?"whop":"link"} s={14} c={src.includes("Whop")?T.pur:T.acc}/></div>
<div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:T.tx}}>{src}</div>
<div style={{fontSize:9,color:T.tx3}}>{leadCash.filter(l=>l.source===src).length} paying clients · {pc(amt,totCashFromLeads)}% of total</div>
<div style={{marginTop:4}}><Bar v={amt} max={totCashFromLeads} color={src.includes("Whop")?T.pur:T.acc} h={5}/></div></div>
<span style={{fontFamily:MONO,fontWeight:700,color:T.grn,fontSize:14}}>{fS(amt)}</span></div>)}
</Crd>

<Crd title="Cash Collected — Per Lead Detail" action={<span style={{fontSize:10,color:T.tx3,fontFamily:MONO}}>Total: {fS(totCashFromLeads)}</span>}>
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["Lead","Company","Source","Deal Value","Cash Collected","# Payments","Last Payment","What"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{leadCash.map(l=>{const lastP=l.payments[l.payments.length-1];return(<tr key={l.id} style={{borderBottom:"1px solid "+T.bdr+"10"}}>
<td style={{padding:8,fontWeight:500,color:T.tx}}>{l.name}</td>
<td style={{padding:8,color:T.tx2}}>{l.company}</td>
<td style={{padding:8}}><Bd text={l.source.includes("Whop")?"Whop":l.source} color={l.source.includes("Whop")?"pur":"def"}/></td>
<td style={{padding:8,fontFamily:MONO,fontWeight:600}}>{fS(l.value)}</td>
<td style={{padding:8,fontFamily:MONO,fontWeight:700,color:T.grn}}>{fS(l.ltv)}</td>
<td style={{padding:8,fontFamily:MONO}}>{l.pmtCount}</td>
<td style={{padding:8,fontFamily:MONO,color:T.tx2,fontSize:9}}>{fmtDT(l.lastPmtDate)}</td>
<td style={{padding:8,color:T.tx2,fontSize:10}}>{lastP.what}</td>
</tr>)})}</tbody></table></div>
</Crd>

<Crd title="Average Ticket Size by Source">
{sourceCash.map(([src,amt])=>{const cnt=leadCash.filter(l=>l.source===src).length;const avg=cnt>0?amt/cnt:0;return(
<div key={src} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",fontSize:11}}>
<span style={{width:160,color:T.tx2}}>{src}</span>
<div style={{flex:1}}><Bar v={avg} max={Math.max(...sourceCash.map(([,a])=>a/Math.max(leadCash.filter(l=>l.source===sourceCash.find(s=>s[1]===a)?.[0]).length,1)))} color={T.acc} h={6}/></div>
<span style={{fontFamily:MONO,fontWeight:600,color:T.tx,width:80,textAlign:"right"}}>{fS(avg)}</span>
<span style={{fontFamily:MONO,fontSize:9,color:T.tx3,width:50,textAlign:"right"}}>{cnt} clients</span>
</div>)})}
</Crd>
</div>}

{vw==="bank"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
{/* Bank connection panel */}
<div style={{background:T.s3,borderRadius:10,border:"1px solid "+T.bdr,padding:"16px 20px"}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
<div style={{display:"flex",alignItems:"center",gap:12}}>
<div style={{width:42,height:42,borderRadius:10,background:T.grnBg,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t="dollar" s={20} c={T.grn}/></div>
<div><div style={{fontSize:14,fontWeight:600,color:T.tx,marginBottom:2}}>{COMPANY.bank.name} ····{COMPANY.bank.account.slice(-4)}</div>
<div style={{fontSize:11,color:T.tx3}}>Live bank feed · IFSC {COMPANY.bank.ifsc} · UPI {COMPANY.bank.upi}</div></div></div>
<div style={{display:"flex",alignItems:"center",gap:8}}>
<Bd text="Connected" color="grn"/>
<Btn sm v="def" icon="settings" onClick={()=>setShowBankSetup(true)}>Setup</Btn>
</div></div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginTop:14}}>
<div style={{background:T.s1,borderRadius:6,padding:10}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Total Inflow</div><div style={{fontSize:18,fontWeight:700,color:T.grn,fontFamily:MONO,marginTop:3}}>{fS(bankIn)}</div></div>
<div style={{background:T.s1,borderRadius:6,padding:10}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Transactions</div><div style={{fontSize:18,fontWeight:700,color:T.tx,fontFamily:MONO,marginTop:3}}>{bankPayments?.length||0}</div></div>
<div style={{background:T.s1,borderRadius:6,padding:10}}><div style={{fontSize:9,color:T.tx3,textTransform:"uppercase",letterSpacing:.5}}>Unmatched</div><div style={{fontSize:18,fontWeight:700,color:unmatchedBank.length>0?T.yel:T.grn,fontFamily:MONO,marginTop:3}}>{unmatchedBank.length}</div></div>
</div>
</div>

{unmatchedBank.length>0&&<div style={{padding:12,background:T.yelBg,borderRadius:8,border:"1px solid "+T.yelD+"40",fontSize:11,color:T.yel,display:"flex",alignItems:"center",gap:8}}><Ic t="alert" s={14}/>{unmatchedBank.length} unmatched payment{unmatchedBank.length>1?"s":""} — review below to link with leads/invoices</div>}

<Crd title="Bank Transaction Feed" action={<span style={{fontSize:10,color:T.tx3}}>Auto-syncs every 5 minutes</span>}>
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["Date","From","Amount","Method","Reference","Linked To","Status",""].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{bankPayments?.map(b=>{const linkedLead=leads?.find(l=>l.id===b.linkedLeadId);const linkedInv=invoices.find(i=>i.id===b.linkedInvoiceId);return(<tr key={b.id} style={{borderBottom:"1px solid "+T.bdr+"10"}}>
<td style={{padding:8,fontFamily:MONO,color:T.tx2,fontSize:10}}>{fmtDT(b.receivedAt)}</td>
<td style={{padding:8,color:T.tx,fontWeight:500}}>{b.from}</td>
<td style={{padding:8,fontFamily:MONO,fontWeight:700,color:T.grn}}>+{fS(b.amount)}</td>
<td style={{padding:8}}><Bd text={b.method} color="def"/></td>
<td style={{padding:8,fontSize:10,color:T.tx3}}>{b.remarks}</td>
<td style={{padding:8,fontSize:10}}>{linkedInv?<span style={{color:T.acc,fontFamily:MONO}}>{linkedInv.id}</span>:linkedLead?<span style={{color:T.acc}}>{linkedLead.name}</span>:<span style={{color:T.tx3}}>—</span>}</td>
<td style={{padding:8}}><Bd text={b.status==="linked"?"Linked":"Unmatched"} color={b.status==="linked"?"grn":"yel"}/></td>
<td style={{padding:8}}>{b.status==="unmatched"&&<Btn sm icon="link" onClick={()=>{const inv=prompt("Link to invoice ID? (e.g. HTS-001) Leave blank to skip");if(inv)linkBankPayment(b.id,null,inv)}}>Link</Btn>}</td>
</tr>)})}</tbody></table></div>
</Crd>

<div style={{padding:14,background:T.s2,borderRadius:8,border:"1px solid "+T.bdr,fontSize:11,color:T.tx2,lineHeight:1.7}}>
<div style={{fontWeight:600,color:T.tx,marginBottom:6,fontSize:12,display:"flex",alignItems:"center",gap:6}}><Ic t="zap" s={14} c={T.acc}/>How Bank Integration Works</div>
1. Connect bank via webhook URL (Setup button above)<br/>
2. Every incoming payment is captured automatically with sender, amount, reference<br/>
3. System auto-matches payment to invoice based on reference / amount / sender<br/>
4. On match → invoice marked paid → professional invoice with GST auto-emailed to client<br/>
5. Unmatched payments flagged for manual linking to leads/invoices
</div>
</div>}

{showBankSetup&&<Mod title="Bank Webhook Setup" onClose={()=>setShowBankSetup(false)}><BankSetupForm onClose={()=>setShowBankSetup(false)}/></Mod>}

{vw==="inv"&&<Crd title="Invoices"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["#","Client","Amount","Paid","Balance","Status","Type","Due",""].map(h=><th key={h} style={{textAlign:"left",padding:7,color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{invoices.map(inv=>{const bal=inv.amount-inv.paid;const od=inv.due<TODAY&&inv.status!=="paid";return(<tr key={inv.id} style={{borderBottom:"1px solid "+T.bdr+"10"}}>
<td style={{padding:7,fontFamily:MONO,color:T.acc,fontSize:9}}>{inv.id}</td><td style={{padding:7,color:T.tx}}>{inv.client}</td>
<td style={{padding:7,fontFamily:MONO,fontWeight:600}}>{fS(inv.amount)}</td><td style={{padding:7,fontFamily:MONO,color:T.grn}}>{fS(inv.paid)}</td>
<td style={{padding:7,fontFamily:MONO,color:bal>0?T.red:T.grn,fontWeight:600}}>{fS(bal)}</td>
<td style={{padding:7}}><Bd text={od?"overdue":inv.status} color={inv.status==="paid"?"grn":od?"red":"yel"}/></td>
<td style={{padding:7}}>{inv.recurring?<Bd text="Recurring" color="pur"/>:<Bd text="One-time" color="def"/>}</td>
<td style={{padding:7,color:od?T.red:T.tx3,fontSize:9}}>{inv.due}</td>
<td style={{padding:7}}><div style={{display:"flex",gap:3}}><Btn sm icon="eye" onClick={()=>setShowInvPrev(inv)}>View</Btn>{inv.status!=="paid"&&<Btn sm icon="dollar" onClick={()=>setShowPay(inv)}>Pay</Btn>}{od&&<Btn sm v="dan" icon="send">Remind</Btn>}</div></td>
</tr>)})}</tbody></table></div></Crd>}

{vw==="rec"&&<Crd title="Recurring Clients">{(()=>{const rec=invoices.filter(i=>i.recurring);if(rec.length===0)return<div style={{color:T.tx3,fontSize:11,padding:"16px 0",textAlign:"center"}}>No recurring invoices yet.</div>;return rec.map(c=><div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid "+T.bdr+"10"}}>
<Av name={c.client} sz={32} color={"linear-gradient(135deg,"+T.pur+",#c084fc)"}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:T.tx}}>{c.client}</div><div style={{fontSize:9,color:T.tx3}}>Invoice {c.id} · {c.status}</div></div>
<div style={{fontSize:15,fontWeight:700,color:T.acc,fontFamily:MONO}}>{fS(c.amount)}</div></div>)})()}</Crd>}

{vw==="exp"&&<Crd title="Expenses"><div style={{color:T.tx3,fontSize:11,padding:"16px 0",textAlign:"center"}}>Expense tracking not yet wired up. Connect your bank feed to auto-categorize outflows.</div></Crd>}

{showPay&&<Mod title={"Pay "+showPay.id} onClose={()=>setShowPay(null)}><div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{background:T.s2,borderRadius:6,padding:12}}>{[["Total",fmt(showPay.amount),T.tx],["Paid",fmt(showPay.paid),T.grn],["Due",fmt(showPay.amount-showPay.paid),T.red]].map(r=><div key={r[0]} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:11}}><span style={{color:T.tx3}}>{r[0]}</span><span style={{fontFamily:MONO,color:r[2]}}>{r[1]}</span></div>)}</div>
<Btn v="ok" icon="chk" full onClick={()=>pay(showPay.id,showPay.amount-showPay.paid)}>Full Payment</Btn>
<Btn v="def" icon="dollar" full onClick={()=>pay(showPay.id,Math.round((showPay.amount-showPay.paid)/2))}>Partial (50%)</Btn>
<div style={{fontSize:10,color:T.tx3,display:"flex",gap:4}}><Ic t="zap" s={12}/>Invoice auto-generates on payment</div></div></Mod>}

{showInvPrev&&<Mod title={"Invoice "+showInvPrev.id} onClose={()=>setShowInvPrev(null)} wide><InvoicePreview inv={showInvPrev}/></Mod>}

{showCreate&&<Mod title="Create Invoice" onClose={()=>setShowCreate(false)} wide><CreateInvForm onClose={()=>setShowCreate(false)} onAdd={i=>{setInvoices(p=>[i,...p]);supabase.from('invoices').insert(i);setShowCreate(false)}}/></Mod>}
</div>)}

/* PROFESSIONAL INVOICE PREVIEW */
function InvoicePreview({inv}){const sub=inv.items.reduce((a,i)=>a+i.q*i.r,0);const tx=Math.round(sub*(inv.tax/100));const cgst=Math.round(tx/2);const sgst=Math.round(tx/2);
return(
<div style={{background:"#fff",color:"#1a1a1a",padding:30,borderRadius:8,fontFamily:"system-ui,sans-serif"}}>
{/* Header */}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"3px solid "+T.acc,paddingBottom:16,marginBottom:20}}>
<div style={{display:"flex",alignItems:"center",gap:12}}>
<img src="/logo.png" alt="HTSyndicate" style={{height:54,objectFit:"contain",display:"block"}}/>
<div><div style={{fontSize:22,fontWeight:800,color:"#1a1a1a",letterSpacing:-.5}}>HTSyndicate</div><div style={{fontSize:10,color:"#666"}}>Premium Sales & Consulting Services</div></div></div>
<div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:800,color:T.acc,letterSpacing:-1}}>INVOICE</div><div style={{fontSize:11,color:"#666",fontFamily:MONO}}>{inv.id}</div></div>
</div>

{/* From / To */}
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:30,marginBottom:24}}>
<div><div style={{fontSize:9,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>From</div>
<div style={{fontSize:13,fontWeight:700,color:"#1a1a1a"}}>{COMPANY.name}</div>
<div style={{fontSize:11,color:"#444",lineHeight:1.6}}>{COMPANY.address}<br/>{COMPANY.email}<br/>{COMPANY.phone}</div>
<div style={{fontSize:11,color:"#1a1a1a",marginTop:6,fontFamily:MONO}}><b>GSTIN:</b> {COMPANY.gstin}<br/><b>PAN:</b> {COMPANY.pan}</div></div>

<div><div style={{fontSize:9,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Bill To</div>
<div style={{fontSize:13,fontWeight:700,color:"#1a1a1a"}}>{inv.client}</div>
<div style={{fontSize:11,color:"#444",lineHeight:1.6}}>{inv.notes||"Client Address"}</div>
<div style={{display:"flex",gap:14,marginTop:8,fontSize:11}}>
<div><div style={{fontSize:9,color:"#999"}}>Invoice Date</div><div style={{fontWeight:600,color:"#1a1a1a"}}>{inv.date}</div></div>
<div><div style={{fontSize:9,color:"#999"}}>Due Date</div><div style={{fontWeight:600,color:inv.status==="overdue"?T.red:"#1a1a1a"}}>{inv.due}</div></div>
</div></div>
</div>

{/* Items */}
<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:14}}>
<thead><tr style={{background:"#f5f5f5",borderBottom:"2px solid "+T.acc}}>
<th style={{textAlign:"left",padding:"10px 12px",color:"#1a1a1a",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Description</th>
<th style={{textAlign:"center",padding:"10px 12px",color:"#1a1a1a",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,width:60}}>Qty</th>
<th style={{textAlign:"right",padding:"10px 12px",color:"#1a1a1a",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,width:120}}>Rate</th>
<th style={{textAlign:"right",padding:"10px 12px",color:"#1a1a1a",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,width:130}}>Amount</th>
</tr></thead>
<tbody>{inv.items.map((it,i)=><tr key={i} style={{borderBottom:"1px solid #eee"}}>
<td style={{padding:"10px 12px",color:"#1a1a1a"}}>{it.d}</td>
<td style={{padding:"10px 12px",textAlign:"center",fontFamily:MONO,color:"#1a1a1a"}}>{it.q}</td>
<td style={{padding:"10px 12px",textAlign:"right",fontFamily:MONO,color:"#444"}}>{fmt(it.r)}</td>
<td style={{padding:"10px 12px",textAlign:"right",fontFamily:MONO,fontWeight:700,color:"#1a1a1a"}}>{fmt(it.q*it.r)}</td>
</tr>)}</tbody>
</table>

{/* Totals */}
<div style={{display:"flex",justifyContent:"flex-end",marginBottom:24}}>
<div style={{width:300,fontSize:12}}>
<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",color:"#444"}}><span>Subtotal</span><span style={{fontFamily:MONO}}>{fmt(sub)}</span></div>
<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",color:"#444"}}><span>CGST @ {(inv.tax/2)}%</span><span style={{fontFamily:MONO}}>{fmt(cgst)}</span></div>
<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",color:"#444"}}><span>SGST @ {(inv.tax/2)}%</span><span style={{fontFamily:MONO}}>{fmt(sgst)}</span></div>
<div style={{borderTop:"2px solid "+T.acc,marginTop:8,paddingTop:10,display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:800,color:"#1a1a1a"}}><span>TOTAL</span><span style={{fontFamily:MONO}}>{fmt(inv.amount)}</span></div>
{inv.paid>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",color:T.grn,fontWeight:600,marginTop:6}}><span>Paid</span><span style={{fontFamily:MONO}}>{fmt(inv.paid)}</span></div>}
{inv.amount-inv.paid>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",color:T.red,fontWeight:600,fontSize:14}}><span>Balance Due</span><span style={{fontFamily:MONO}}>{fmt(inv.amount-inv.paid)}</span></div>}
</div></div>

{/* Footer */}
<div style={{borderTop:"1px solid #ddd",paddingTop:14,fontSize:10,color:"#666"}}>
<div style={{marginBottom:8}}><b style={{color:"#1a1a1a"}}>Payment Terms:</b> Payment due within 30 days. Late payments subject to 1.5% monthly interest.</div>
<div style={{marginBottom:8}}><b style={{color:"#1a1a1a"}}>Bank Details:</b> {COMPANY.bank.name} | A/C: {COMPANY.bank.account} | IFSC: {COMPANY.bank.ifsc} | UPI: {COMPANY.bank.upi}</div>
<div style={{textAlign:"center",marginTop:14,fontSize:11,color:T.acc,fontWeight:600}}>Thank you for your business!</div>
</div>

<div style={{display:"flex",gap:8,marginTop:20,justifyContent:"flex-end"}}>
<Btn v="def" icon="send">Email to Client</Btn>
<Btn v="pri" icon="file" onClick={()=>window.print()}>Download PDF</Btn>
</div>
</div>
)}

function BankSetupForm({onClose}){
const[bankName,setBankName]=useState(COMPANY.bank.name);
const[accNum,setAccNum]=useState(COMPANY.bank.account);
const[ifsc,setIfsc]=useState(COMPANY.bank.ifsc);
const[upi,setUpi]=useState(COMPANY.bank.upi);
const webhookUrl="https://api.htsyndicate.com/webhooks/bank/incoming";
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{padding:10,background:T.bluBg,borderRadius:6,fontSize:11,color:T.blu,display:"flex",gap:6}}><Ic t="alert" s={13}/>Configure your bank to send transaction webhooks to the URL below. Most Indian banks support this via their Corporate Banking API or via aggregators like Setu, Decentro, or Razorpay.</div>

<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
<Inp label="Bank Name" value={bankName} onChange={setBankName}/>
<Inp label="Account Number" value={accNum} onChange={setAccNum} mono/>
<Inp label="IFSC Code" value={ifsc} onChange={setIfsc} mono/>
<Inp label="UPI ID" value={upi} onChange={setUpi}/>
</div>

<div><div style={{fontSize:10,color:T.tx3,fontWeight:500,textTransform:"uppercase",letterSpacing:.6,marginBottom:5}}>Webhook URL (give this to your bank)</div>
<div style={{display:"flex",gap:6}}>
<input value={webhookUrl} readOnly style={{flex:1,padding:"8px 12px",borderRadius:6,border:"1px solid "+T.bdr,background:T.inp,color:T.acc,fontSize:11,fontFamily:MONO,outline:"none"}}/>
<Btn sm v="def" icon="link" onClick={()=>{navigator.clipboard?.writeText(webhookUrl);alert("Copied!")}}>Copy</Btn>
</div></div>

<div style={{padding:12,background:T.s2,borderRadius:6,fontSize:11,color:T.tx2,lineHeight:1.7}}>
<div style={{fontWeight:600,color:T.tx,marginBottom:5}}>What happens when payment arrives:</div>
1. Bank sends webhook with sender, amount, reference, timestamp<br/>
2. System auto-matches to pending invoice or lead<br/>
3. Invoice auto-marked paid (full / partial / overdue)<br/>
4. Professional GST invoice auto-emailed to client<br/>
5. Notification sent to admin & finance
</div>

<div style={{display:"flex",justifyContent:"flex-end",gap:6}}>
<Btn onClick={onClose}>Cancel</Btn>
<Btn v="pri" icon="chk" onClick={onClose}>Save Configuration</Btn>
</div></div>)}

function CreateInvForm({onClose,onAdd}){const[f,setF]=useState({client:"",items:[{d:"",q:1,r:0}],tax:18,notes:"",due:"",rec:false});const u=(k,v)=>setF(p=>({...p,[k]:v}));
const sub=f.items.reduce((a,i)=>a+i.q*i.r,0);const tx=sub*(f.tax/100);const tot=Math.round(sub+tx);
return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Inp label="Client" value={f.client} onChange={v=>u("client",v)} ph="GrowthX Agency"/><Inp label="Due Date" value={f.due} onChange={v=>u("due",v)} type="date"/></div>
<div><div style={{fontSize:10,color:T.tx3,fontWeight:500,marginBottom:5}}>LINE ITEMS</div>
{f.items.map((it,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"2fr 60px 1fr auto",gap:6,marginBottom:6}}>
<input value={it.d} onChange={e=>{const items=[...f.items];items[i]={...items[i],d:e.target.value};setF(p=>({...p,items}))}} placeholder="Description" style={{padding:"7px 10px",borderRadius:5,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:11,fontFamily:FONT,outline:"none"}}/>
<input type="number" value={it.q} onChange={e=>{const items=[...f.items];items[i]={...items[i],q:+e.target.value};setF(p=>({...p,items}))}} style={{padding:"7px 10px",borderRadius:5,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:11,fontFamily:MONO,outline:"none"}}/>
<input type="number" value={it.r} onChange={e=>{const items=[...f.items];items[i]={...items[i],r:+e.target.value};setF(p=>({...p,items}))}} placeholder="Rate" style={{padding:"7px 10px",borderRadius:5,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:11,fontFamily:MONO,outline:"none"}}/>
{f.items.length>1&&<button onClick={()=>setF(p=>({...p,items:p.items.filter((_,j)=>j!==i)}))} style={{background:T.redBg,border:"none",borderRadius:5,color:T.red,cursor:"pointer",padding:"0 8px"}}>x</button>}
</div>)}
<Btn sm icon="plus" onClick={()=>setF(p=>({...p,items:[...p.items,{d:"",q:1,r:0}]}))}>Add Item</Btn></div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
<Inp label="GST %" value={f.tax} onChange={v=>u("tax",+v)} type="number" mono/>
<Inp label="Notes" value={f.notes} onChange={v=>u("notes",v)} ph="Terms"/>
<div style={{display:"flex",alignItems:"flex-end"}}><label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.tx2,cursor:"pointer"}}><input type="checkbox" checked={f.rec} onChange={e=>u("rec",e.target.checked)}/> Recurring</label></div></div>
<div style={{background:T.s2,borderRadius:8,padding:14}}>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:T.tx2,marginBottom:4}}><span>Subtotal</span><span style={{fontFamily:MONO}}>{fmt(sub)}</span></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:T.tx2,marginBottom:4}}><span>GST</span><span style={{fontFamily:MONO}}>{fmt(tx)}</span></div>
<div style={{height:1,background:T.bdr,margin:"6px 0"}}/>
<div style={{display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:700,color:T.tx}}><span>Total</span><span style={{fontFamily:MONO}}>{fmt(tot)}</span></div></div>
<div style={{display:"flex",justifyContent:"flex-end",gap:8}}><Btn onClick={onClose}>Cancel</Btn><Btn v="pri" icon="inv" onClick={()=>{if(!f.client)return;onAdd({id:"HTS-"+String(Date.now()).slice(-3),client:f.client,amount:tot,paid:0,status:"draft",date:TODAY,due:f.due||"2026-06-01",items:f.items,tax:f.tax,notes:f.notes,recurring:f.rec})}}>Create</Btn></div></div>)}

/* ═══ AUTOMATIONS ═══ */
function AutoP({autos,setAutos}){const[cat,setCat]=useState("all");const f=cat==="all"?autos:autos.filter(a=>a.type===cat);
const tg=id=>{const newStatus=autos.find(a=>a.id===id)?.status==="active"?"paused":"active";setAutos(p=>p.map(a=>a.id===id?{...a,status:newStatus}:a));supabase.from('automations').update({status:newStatus}).eq('id',id);};
const ti={invoice:"inv",lead:"users",task:"task",report:"bar",attendance:"punch"};const tc={invoice:T.grn,lead:T.acc,task:T.blu,report:T.pur,attendance:T.cyn};
return(
<div style={{display:"flex",flexDirection:"column",gap:16}}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
<St label="Active" value={autos.filter(a=>a.status==="active").length} icon="zap" color={T.grn}/>
<St label="Total Runs" value={autos.reduce((a,b)=>a+b.runs,0).toLocaleString()} icon="repeat" color={T.acc}/>
<St label="Success" value={(autos.reduce((a,b)=>a+b.rate,0)/autos.length).toFixed(1)+"%"} icon="chk" color={T.grn}/></div>
<div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{[{id:"all",l:"All"},{id:"invoice",l:"Invoice"},{id:"lead",l:"Lead"},{id:"task",l:"Tasks"},{id:"report",l:"Reports"},{id:"attendance",l:"Attendance"}].map(c=><Pill key={c.id} l={c.l} active={cat===c.id} onClick={()=>setCat(c.id)} n={c.id==="all"?autos.length:autos.filter(a=>a.type===c.id).length}/>)}</div>
{f.map(a=><div key={a.id} style={{background:T.s3,borderRadius:9,border:"1px solid "+T.bdr,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
<div style={{width:34,height:34,borderRadius:7,background:(tc[a.type]||T.acc)+"12",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t={ti[a.type]||"zap"} s={16} c={tc[a.type]||T.acc}/></div>
<div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:600,color:T.tx}}>{a.name}</span><Bd text={a.status} color={a.status==="active"?"grn":"yel"}/><Bd text={a.dept} color={a.dept==="sales"?"acc":a.dept==="finance"?"blu":"pur"}/></div>
<div style={{fontSize:10,color:T.tx2}}>WHEN: {a.trigger} → THEN: {a.action}</div></div>
<div style={{display:"flex",gap:10,alignItems:"center",flexShrink:0}}>
<div style={{textAlign:"center"}}><div style={{fontSize:13,fontWeight:700,color:T.tx,fontFamily:MONO}}>{a.runs}</div><div style={{fontSize:8,color:T.tx3}}>Runs</div></div>
<div style={{textAlign:"center"}}><div style={{fontSize:13,fontWeight:700,color:a.rate>=99?T.grn:T.yel,fontFamily:MONO}}>{a.rate}%</div><div style={{fontSize:8,color:T.tx3}}>OK</div></div>
<Btn sm icon={a.status==="active"?"pause":"play"} onClick={()=>tg(a.id)}>{a.status==="active"?"Pause":"Start"}</Btn></div></div>)}
</div>)}

/* ═══ TASKS ═══ */
function TaskP({tasks,setTasks,dept}){const[fd,setFd]=useState("all");const[showAdd,setShowAdd]=useState(false);const[newT,setNewT]=useState({title:"",dept:"sales",assignee:"",priority:"medium",due:""});
const vis=useMemo(()=>{let t=tasks;if(dept!=="all")t=t.filter(x=>x.dept===dept);if(fd!=="all")t=t.filter(x=>x.dept===fd);return t},[tasks,fd,dept]);
const mv=(id,s)=>{setTasks(p=>p.map(t=>t.id===id?{...t,status:s}:t));supabase.from('tasks').update({status:s}).eq('id',id);};
const cols=[{k:"todo",l:"To Do",c:T.tx3},{k:"in_progress",l:"In Progress",c:T.yel},{k:"done",l:"Done",c:T.grn}];
return(
<div style={{display:"flex",flexDirection:"column",gap:16}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
<div style={{display:"flex",gap:3}}>{[{id:"all",l:"All"},{id:"sales",l:"Sales"},{id:"finance",l:"Finance"},{id:"tech",l:"Tech"}].map(d=><Pill key={d.id} l={d.l} active={fd===d.id} onClick={()=>setFd(d.id)}/>)}</div>
<Btn v="pri" icon="plus" onClick={()=>setShowAdd(true)}>Add Task</Btn></div>
<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
{cols.map(col=>{const cT=vis.filter(t=>t.status===col.k);return(
<div key={col.k} style={{background:T.s3,borderRadius:9,border:"1px solid "+T.bdr}}>
<div style={{padding:"10px 12px",borderBottom:"1px solid "+T.bdr,display:"flex",alignItems:"center",gap:6}}><span style={{width:6,height:6,borderRadius:99,background:col.c}}/><span style={{fontSize:11,fontWeight:600,color:T.tx}}>{col.l}</span><span style={{fontSize:9,fontFamily:MONO,color:T.tx3,marginLeft:"auto"}}>{cT.length}</span></div>
<div style={{padding:5,display:"flex",flexDirection:"column",gap:5}}>
{cT.map(t=><div key={t.id} style={{background:T.s1,borderRadius:6,padding:9,border:"1px solid "+T.bdr}}>
<div style={{fontSize:11,fontWeight:600,color:T.tx,marginBottom:4}}>{t.title}</div>
<div style={{display:"flex",gap:3,marginBottom:4}}><Bd text={t.dept} color={t.dept==="sales"?"acc":t.dept==="finance"?"blu":"cyn"}/><Bd text={t.priority} color={t.priority==="critical"||t.priority==="high"?"red":"yel"}/></div>
<div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.tx3}}><span>{t.assignee}</span><span style={{color:t.due<TODAY&&t.status!=="done"?T.red:T.tx3}}>{t.due}</span></div>
{t.status!=="done"&&<div style={{marginTop:5}}>{t.status==="todo"?<Btn sm icon="play" onClick={()=>mv(t.id,"in_progress")}>Start</Btn>:<Btn sm v="ok" icon="chk" onClick={()=>mv(t.id,"done")}>Done</Btn>}</div>}
</div>)}</div></div>)})}</div>
{showAdd&&<Mod title="Add Task" onClose={()=>setShowAdd(false)}><div style={{display:"flex",flexDirection:"column",gap:12}}>
<Inp label="Task" value={newT.title} onChange={v=>setNewT(p=>({...p,title:v}))} ph="What needs doing?"/>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
<Sel label="Dept" value={newT.dept} onChange={v=>setNewT(p=>({...p,dept:v}))} opts={[{v:"sales",l:"Sales"},{v:"finance",l:"Finance"},{v:"tech",l:"Tech"}]}/>
<Sel label="Priority" value={newT.priority} onChange={v=>setNewT(p=>({...p,priority:v}))} opts={[{v:"critical",l:"Critical"},{v:"high",l:"High"},{v:"medium",l:"Medium"},{v:"low",l:"Low"}]}/></div>
<Inp label="Assignee" value={newT.assignee} onChange={v=>setNewT(p=>({...p,assignee:v}))} ph="Who?"/>
<Inp label="Due" value={newT.due} onChange={v=>setNewT(p=>({...p,due:v}))} type="date"/>
<div style={{display:"flex",justifyContent:"flex-end",gap:6}}><Btn onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn v="pri" icon="plus" onClick={()=>{if(!newT.title)return;const t={id:uid(),title:newT.title,dept:newT.dept,assignee:newT.assignee||"Unassigned",status:"todo",priority:newT.priority,due:newT.due||"2026-05-10"};setTasks(p=>[t,...p]);supabase.from('tasks').insert(t);setNewT({title:"",dept:"sales",assignee:"",priority:"medium",due:""});setShowAdd(false)}}>Add</Btn></div></div></Mod>}
</div>)}

/* ═══ OVERVIEW (Admin) ═══ */
function OverP({leads,invoices,tasks,autos,punch}){const won=leads.filter(l=>l.stage==="won"),act=leads.filter(l=>!["won","lost"].includes(l.stage));
const odT=tasks.filter(t=>t.due<TODAY&&t.status!=="done"),odI=invoices.filter(i=>i.due<TODAY&&i.status!=="paid");
const revenue=leads.reduce((a,l)=>a+(l.payments||[]).reduce((b,p)=>b+(Number(p.amount)||0),0),0);
return(
<div style={{display:"flex",flexDirection:"column",gap:16}}>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
<St label="Revenue" value={fS(revenue)} sub="cash collected" icon="dollar" color={T.grn}/>
<St label="Pipeline" value={fS(act.reduce((a,l)=>a+l.value,0))} sub={act.length+" leads"} icon="tgt" color={T.acc}/>
<St label="Won" value={fS(won.reduce((a,l)=>a+l.value,0))} icon="chk" color={T.grn}/>
<St label="Tasks" value={tasks.filter(t=>t.status!=="done").length} sub={odT.length+" overdue"} icon="task" color={T.yel}/>
<St label="Outstanding" value={fS(invoices.reduce((a,i)=>a+(i.amount-i.paid),0))} icon="alert" color={T.red}/></div>
{(odT.length>0||odI.length>0)&&<Crd title="Action Required" style={{borderColor:T.redD+"35"}}>
{odI.map(i=><div key={i.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:5,background:T.redBg,marginBottom:4,fontSize:10}}><Ic t="alert" s={12} c={T.red}/><span style={{color:T.red,fontWeight:500}}>{i.client} — {i.id} overdue {dBtw(i.due,TODAY)}d</span></div>)}
{odT.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:5,background:T.yelBg,marginBottom:4,fontSize:10}}><Ic t="clock" s={12} c={T.yel}/><span style={{color:T.yel,fontWeight:500}}>"{t.title}" — {t.assignee}</span></div>)}</Crd>}
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
<Crd title="Team Status"><table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}><tbody>{Object.entries(punch).map(([n,p])=><tr key={n} style={{borderBottom:"1px solid "+T.bdr+"10"}}>
<td style={{padding:6}}><div style={{display:"flex",alignItems:"center",gap:5}}><Av name={n} sz={22}/><span style={{fontWeight:500,color:T.tx,fontSize:11}}>{n}</span></div></td>
<td style={{padding:6}}><Bd text={p.in?"Online":"Offline"} color={p.in?"grn":"red"}/></td>
<td style={{padding:6,fontFamily:MONO,fontSize:10}}>{p.hrs.toFixed(1)}h</td>
<td style={{padding:6}}><span style={{fontFamily:MONO,fontWeight:600,fontSize:10,color:p.prod>=80?T.grn:T.yel}}>{p.prod}%</span></td></tr>)}</tbody></table></Crd>
<Crd title="Pipeline">{STAGES.filter(s=>leads.filter(l=>l.stage===s.id).length>0).map(s=>{const n=leads.filter(l=>l.stage===s.id).length;return(<div key={s.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}><span style={{width:65,fontSize:9,color:T.tx2}}>{s.l}</span><div style={{flex:1}}><Bar v={n} max={leads.length} color={s.c} h={6}/></div><span style={{fontFamily:MONO,fontSize:10,fontWeight:600,color:T.tx,width:14,textAlign:"right"}}>{n}</span></div>)})}</Crd></div>
</div>)}

/* ═══ REVENUE DASHBOARD (Admin) ═══ */
function RevenueP({leads,pipelines}){
const[goal,setGoal]=useState(()=>parseInt(localStorage.getItem('htRevGoal')||'1000000'));
const[editGoal,setEditGoal]=useState(false);
const[goalInput,setGoalInput]=useState(goal);
const[expandedPipe,setExpandedPipe]=useState(null);
const[expandedMonth,setExpandedMonth]=useState(null);
const now=new Date();
const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
const weekStart=new Date(today);weekStart.setDate(today.getDate()-today.getDay());
const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
const parsePmtDate=s=>{
  if(!s)return null;
  if(typeof s==='string'&&/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)){
    const[d,m,rest]=s.split('/');
    return new Date(parseInt(rest),parseInt(m)-1,parseInt(d));
  }
  const d=new Date(s);
  return isNaN(d.getTime())?null:d;
};
const pmtAmt=p=>Number(p.amount)||0;
const getRev=(ls,from)=>ls.reduce((a,l)=>a+(l.payments||[]).filter(p=>{const d=parsePmtDate(p.date);return d&&d>=from;}).reduce((b,p)=>b+pmtAmt(p),0),0);
const getCash=l=>(l.payments||[]).reduce((a,p)=>a+pmtAmt(p),0);
const totalCash=leads.reduce((a,l)=>a+getCash(l),0);
const todayRev=getRev(leads,today);
const weekRev=getRev(leads,weekStart);
const monthRev=getRev(leads,monthStart);
console.log('[RevenueP]',{leads:leads.length,withPayments:leads.filter(l=>(l.payments||[]).length>0).length,totalCash,todayRev,weekRev,monthRev,samplePayments:leads.filter(l=>(l.payments||[]).length>0).slice(0,3).map(l=>({name:l.name,payments:l.payments}))});
const setterRevs={};leads.forEach(l=>{const s=l.setter;if(!s||s==="Unassigned")return;setterRevs[s]=(setterRevs[s]||0)+getCash(l);});
const closerRevs={};leads.forEach(l=>{const c=l.closer;if(!c||c==="Unassigned")return;closerRevs[c]=(closerRevs[c]||0)+getCash(l);});
const topSetters=Object.entries(setterRevs).sort((a,b)=>b[1]-a[1]).slice(0,5);
const topClosers=Object.entries(closerRevs).sort((a,b)=>b[1]-a[1]).slice(0,5);
const srcRevs={};leads.forEach(l=>{const s=l.source||"Unknown";srcRevs[s]=(srcRevs[s]||0)+getCash(l);});
const srcList=Object.entries(srcRevs).sort((a,b)=>b[1]-a[1]).filter(([,v])=>v>0);
const maxSrc=srcList[0]?.[1]||1;

/* Revenue by Pipeline — sum of payments for leads matching each pipeline (excluding "all") */
const pipeRevs=(pipelines||[]).filter(p=>p.id!=="all").map(p=>{
  const matched=leads.filter(l=>(l.pipeline||"").toLowerCase()===p.id.toLowerCase()||(p.sources||[]).includes(l.source));
  const total=matched.reduce((a,l)=>a+getCash(l),0);
  const bySrc={};matched.forEach(l=>{const s=l.source||"Unknown";bySrc[s]=(bySrc[s]||0)+getCash(l);});
  return{id:p.id,name:p.name,color:p.color,total,sources:Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).filter(([,v])=>v>0),count:matched.length};
}).sort((a,b)=>b.total-a.total);
const maxPipeRev=pipeRevs[0]?.total||1;

/* Month-by-month breakdown — every payment grouped by calendar month, most recent first.
   Each month carries its individual payments (lead name, amount, type, date) for the
   expandable detail rows. */
const monthMap={};
leads.forEach(l=>(l.payments||[]).forEach(p=>{
  const d=parsePmtDate(p.date);if(!d)return;
  const key=d.getFullYear()+"-"+String(d.getMonth()).padStart(2,"0");
  if(!monthMap[key])monthMap[key]={key,y:d.getFullYear(),m:d.getMonth(),label:d.toLocaleString("en-US",{month:"long",year:"numeric"}),total:0,payments:[]};
  monthMap[key].total+=pmtAmt(p);
  monthMap[key].payments.push({lead:l.name,amount:pmtAmt(p),type:p.type||"—",what:p.what||"Payment",date:d,sort:d.getTime()});
}));
const monthlyBreakdown=Object.values(monthMap).sort((a,b)=>(b.y-a.y)||(b.m-a.m)).map(mo=>({...mo,payments:mo.payments.sort((a,b)=>b.sort-a.sort)}));

return(
<div style={{display:"flex",flexDirection:"column",gap:14}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
<div><div style={{fontSize:18,fontWeight:700,color:T.tx}}>Revenue Dashboard</div><div style={{fontSize:11,color:T.tx3}}>Cash collected & performance tracking</div></div>
{!editGoal?<div style={{display:"flex",alignItems:"center",gap:8,background:T.s3,borderRadius:8,border:"1px solid "+T.bdr,padding:"8px 14px"}}>
<span style={{fontSize:11,color:T.tx3}}>Monthly Goal:</span>
<span style={{fontFamily:MONO,color:T.acc,fontWeight:700,fontSize:13}}>{fS(goal)}</span>
<Btn sm icon="edit" onClick={()=>{setEditGoal(true);setGoalInput(goal)}}>Edit</Btn>
</div>:<div style={{display:"flex",alignItems:"center",gap:6}}>
<input type="number" value={goalInput} onChange={e=>setGoalInput(+e.target.value)} style={{padding:"6px 10px",borderRadius:5,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:12,fontFamily:MONO,width:130,outline:"none"}}/>
<Btn sm v="ok" onClick={()=>{setGoal(goalInput);localStorage.setItem('htRevGoal',String(goalInput));setEditGoal(false)}}>Save</Btn>
<Btn sm onClick={()=>setEditGoal(false)}>Cancel</Btn>
</div>}
</div>
<div style={{background:T.s3,borderRadius:10,border:"1px solid "+T.bdr,padding:"16px 20px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:600,color:T.tx}}>This Month Progress</span>
<span style={{fontSize:13,fontFamily:MONO,fontWeight:700,color:monthRev>=goal?T.grn:T.acc}}>{fS(monthRev)} / {fS(goal)} ({pc(monthRev,goal)}%)</span>
</div>
<Bar v={monthRev} max={goal} color={monthRev>=goal?T.grn:T.acc} h={12}/>
<div style={{display:"flex",gap:20,marginTop:12,fontSize:11}}>
<span style={{color:T.tx3}}>Today: <span style={{color:T.grn,fontWeight:600,fontFamily:MONO}}>{fS(todayRev)}</span></span>
<span style={{color:T.tx3}}>This Week: <span style={{color:T.acc,fontWeight:600,fontFamily:MONO}}>{fS(weekRev)}</span></span>
<span style={{color:T.tx3}}>Total All-Time: <span style={{color:T.tx,fontWeight:600,fontFamily:MONO}}>{fS(totalCash)}</span></span>
</div>
</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
<St label="Today's Revenue" value={fS(todayRev)} icon="dollar" color={T.grn}/>
<St label="This Week" value={fS(weekRev)} icon="bar" color={T.acc}/>
<St label="This Month" value={fS(monthRev)} icon="tgt" color={T.pur}/>
<St label="All-Time Cash" value={fS(totalCash)} icon="chk" color={T.cyn}/>
</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>
<Crd title="Top Setters by Revenue">
{topSetters.length===0?<div style={{color:T.tx3,fontSize:11,padding:"12px 0",textAlign:"center"}}>No data yet</div>:topSetters.map(([n,v],i)=><div key={n} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid "+T.bdr+"20"}}>
<span style={{fontFamily:MONO,fontSize:10,color:T.tx3,width:16,textAlign:"right"}}>{i+1}</span>
<Av name={n} sz={24}/>
<span style={{flex:1,fontSize:11,color:T.tx,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n}</span>
<span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:T.grn}}>{fS(v)}</span>
</div>)}
</Crd>
<Crd title="Top Closers by Revenue">
{topClosers.length===0?<div style={{color:T.tx3,fontSize:11,padding:"12px 0",textAlign:"center"}}>No data yet</div>:topClosers.map(([n,v],i)=><div key={n} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid "+T.bdr+"20"}}>
<span style={{fontFamily:MONO,fontSize:10,color:T.tx3,width:16,textAlign:"right"}}>{i+1}</span>
<Av name={n} sz={24}/>
<span style={{flex:1,fontSize:11,color:T.tx,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n}</span>
<span style={{fontFamily:MONO,fontSize:12,fontWeight:700,color:T.blu}}>{fS(v)}</span>
</div>)}
</Crd>
<Crd title="Revenue by Source">
{srcList.length===0?<div style={{color:T.tx3,fontSize:11,padding:"12px 0",textAlign:"center"}}>No data yet</div>:srcList.map(([src,v])=><div key={src} style={{marginBottom:10}}>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11}}>
<span style={{color:T.tx2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:8}}>{src.includes("Whop")?"Whop":src.includes("webinar")||src.includes("Webinar")?"Webinar":src.includes("instagram")||src.includes("Instagram")?"Instagram":src}</span>
<span style={{fontFamily:MONO,fontWeight:600,color:T.acc,flexShrink:0}}>{fS(v)}</span>
</div>
<Bar v={v} max={maxSrc} color={T.acc} h={5}/>
</div>)}
</Crd>
</div>
<Crd title="Revenue by Pipeline" action={<span style={{fontSize:10,color:T.tx3}}>Click a pipeline to see source breakdown</span>}>
{pipeRevs.length===0?<div style={{color:T.tx3,fontSize:11,padding:"12px 0",textAlign:"center"}}>No pipelines configured</div>:pipeRevs.map(p=>{const open=expandedPipe===p.id;return(
<div key={p.id} style={{borderBottom:"1px solid "+T.bdr+"20",padding:"8px 0"}}>
<div onClick={()=>setExpandedPipe(open?null:p.id)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"4px 0"}}>
<div style={{width:8,height:8,borderRadius:99,background:p.color,flexShrink:0}}/>
<span style={{flex:1,fontSize:12,color:T.tx,fontWeight:600}}>{p.name}</span>
<span style={{fontSize:10,color:T.tx3,fontFamily:MONO}}>{p.count} leads</span>
<span style={{fontFamily:MONO,fontWeight:700,color:T.grn,fontSize:13,minWidth:80,textAlign:"right"}}>{fS(p.total)}</span>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="2" style={{transform:open?"rotate(180deg)":"rotate(0)",transition:"transform .15s"}}><polyline points="6 9 12 15 18 9"/></svg>
</div>
<div style={{marginTop:5}}><Bar v={p.total} max={maxPipeRev} color={p.color} h={5}/></div>
{open&&<div style={{marginTop:10,paddingLeft:18,borderLeft:"2px solid "+p.color+"40"}}>
{p.sources.length===0?<div style={{fontSize:11,color:T.tx3,padding:"6px 0"}}>No paying leads in this pipeline yet.</div>:p.sources.map(([src,v])=><div key={src} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",fontSize:11}}>
<span style={{flex:1,color:T.tx2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{src}</span>
<div style={{width:120}}><Bar v={v} max={p.total||1} color={p.color} h={4}/></div>
<span style={{fontFamily:MONO,fontWeight:600,color:T.tx,width:80,textAlign:"right"}}>{fS(v)}</span>
<span style={{fontFamily:MONO,fontSize:9,color:T.tx3,width:40,textAlign:"right"}}>{pc(v,p.total)}%</span>
</div>)}
</div>}
</div>);})}
</Crd>
<Crd title="Monthly Revenue" action={<span style={{fontSize:10,color:T.tx3}}>Click a month to see its payments</span>}>
{monthlyBreakdown.length===0?<div style={{color:T.tx3,fontSize:11,padding:"12px 0",textAlign:"center"}}>No payments recorded yet</div>:monthlyBreakdown.map(mo=>{const open=expandedMonth===mo.key;return(
<div key={mo.key} style={{borderBottom:"1px solid "+T.bdr+"20",padding:"8px 0"}}>
<div onClick={()=>setExpandedMonth(open?null:mo.key)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"4px 0"}}>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="2" style={{transform:open?"rotate(180deg)":"rotate(0)",transition:"transform .15s",flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
<span style={{flex:1,fontSize:12,color:T.tx,fontWeight:600}}>{mo.label}</span>
<span style={{fontSize:10,color:T.tx3,fontFamily:MONO}}>{mo.payments.length} payment{mo.payments.length!==1?"s":""}</span>
<span style={{fontFamily:MONO,fontWeight:700,color:T.grn,fontSize:13,minWidth:90,textAlign:"right"}}>{fS(mo.total)}</span>
</div>
{open&&<div style={{marginTop:8,paddingLeft:22}}>
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
<thead><tr style={{color:T.tx3,textAlign:"left"}}>
<th style={{padding:"4px 8px",fontWeight:500}}>Lead</th>
<th style={{padding:"4px 8px",fontWeight:500}}>Type</th>
<th style={{padding:"4px 8px",fontWeight:500}}>Date</th>
<th style={{padding:"4px 8px",fontWeight:500,textAlign:"right"}}>Amount</th>
</tr></thead>
<tbody>
{mo.payments.map((p,i)=><tr key={i} style={{borderTop:"1px solid "+T.bdr+"20"}}>
<td style={{padding:"6px 8px",color:T.tx,fontWeight:500}}>{p.lead}<div style={{fontSize:9,color:T.tx3,fontWeight:400}}>{p.what}</div></td>
<td style={{padding:"6px 8px"}}><Bd text={p.type} color={p.type==="token"?"yel":p.type==="final"?"grn":"acc"}/></td>
<td style={{padding:"6px 8px",color:T.tx3,fontFamily:MONO,fontSize:10}}>{p.date.toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</td>
<td style={{padding:"6px 8px",textAlign:"right",fontFamily:MONO,fontWeight:600,color:T.grn}}>{fS(p.amount)}</td>
</tr>)}
</tbody>
<tfoot><tr style={{borderTop:"1px solid "+T.bdr}}>
<td colSpan={3} style={{padding:"6px 8px",color:T.tx2,fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:.5}}>Month Total</td>
<td style={{padding:"6px 8px",textAlign:"right",fontFamily:MONO,fontWeight:700,color:T.grn}}>{fS(mo.total)}</td>
</tr></tfoot>
</table></div>
</div>}
</div>);})}
</Crd>
</div>
)}

/* ═══ INTEGRATIONS PAGE (Admin) ═══ */
function IntegrationsP({integrations,setIntegrations,leads,setLeads}){
const[gsUrl,setGsUrl]=useState(integrations.googleSheets.sheetUrl||"https://docs.google.com/spreadsheets/d/"+MASTER_SHEET_ID);
const[whopKey,setWhopKey]=useState(integrations.whop.apiKey||"");
const[whopProduct,setWhopProduct]=useState(integrations.whop.productId||"");
const[syncing,setSyncing]=useState(null);
const[syncProgress,setSyncProgress]=useState(null);/* {done,total} */
const[syncLog,setSyncLog]=useState([]);
const[importLog,setImportLog]=useState([]);
const[autoImport,setAutoImport]=useState(()=>localStorage.getItem('htAutoImport')==="true");
const[importInterval,setImportInterval]=useState(()=>parseInt(localStorage.getItem('htImportInterval')||'5'));
const sheetsOk=isSheetsConfigured();

const extractSheetId=url=>{const m=url.match(/\/d\/([a-zA-Z0-9-_]+)/);return m?m[1]:""};

const connectSheet=()=>{
  const id=extractSheetId(gsUrl)||MASTER_SHEET_ID;
  setIntegrations(p=>({...p,googleSheets:{connected:true,sheetUrl:gsUrl||"https://docs.google.com/spreadsheets/d/"+MASTER_SHEET_ID,sheetId:id,lastSync:null}}));
};
const disconnectSheet=()=>{
  if(!confirm("Disconnect Google Sheets? Existing lead data stays — only sync stops."))return;
  setIntegrations(p=>({...p,googleSheets:{connected:false,sheetUrl:"",sheetId:"",lastSync:null}}));
  setGsUrl("");
};
const syncSheetNow=async()=>{
  if(!sheetsOk){alert("Google Sheets not configured. Add VITE_GOOGLE_CLIENT_EMAIL and VITE_GOOGLE_PRIVATE_KEY to your .env.local file (copy from google-credentials.json), then restart the dev server.");return}
  setSyncing("sheets");setSyncProgress({done:0,total:leads.length});
  try{
    const results=await syncAllLeadsToSheet(leads,(done,total)=>setSyncProgress({done,total}));
    const failed=results.filter(r=>!r.ok);
    const ts=new Date().toISOString();
    setSyncLog(p=>[{at:ts,ok:results.length-failed.length,fail:failed.length},...p.slice(0,49)]);
    setIntegrations(p=>({...p,googleSheets:{...p.googleSheets,lastSync:ts}}));
    if(failed.length>0)alert(`Sync done: ${results.length-failed.length} updated, ${failed.length} failed. Check console for details.`);
  }catch(e){
    alert("Sync error: "+e.message);
    console.error("Sync error:",e);
  }finally{setSyncing(null);setSyncProgress(null);}
};
const importNow=async()=>{
  if(!sheetsOk){alert("Google Sheets not configured. See console for details.");return}
  setSyncing("import");
  try{
    const lastRow=parseInt(localStorage.getItem('htLastImportRow')||'1');
    const{newRows,totalRows}=await checkForNewLeads(MASTER_SHEET_ID,MASTER_SHEET_NAME,lastRow);
    if(newRows.length===0){alert("No new leads found in the master sheet.");setSyncing(null);return}
    const imported=[];const dups=[];
    newRows.forEach(({row})=>{
      const l=rowToLead(row,row[5]||"webinar");
      if(!l.name&&!l.phone){return}
      const dup=leads.find(x=>(l.phone&&x.phone&&x.phone.replace(/\D/g,"").slice(-10)===l.phone.replace(/\D/g,"").slice(-10))||(l.email&&x.email&&x.email.toLowerCase()===l.email.toLowerCase()));
      if(dup){dups.push(l.name||l.phone);return}
      imported.push({...l,id:uid(),setterHistory:[{stage:"new",at:new Date().toISOString(),by:"Sheet Import"}],closerHistory:[],calls:0,callLogs:[],followUps:[],payments:[]});
    });
    if(imported.length>0){
      setLeads(p=>[...imported,...p]);
      imported.forEach(l=>supabase.from('leads').insert(leadToDb(l)));
      notifyNewLead(imported.length===1?{name:imported[0].name,source:imported[0].source,pipeline:imported[0].pipeline||imported[0].source,leadId:imported[0].id}:{count:imported.length,source:"Google Sheets"});
    }
    localStorage.setItem('htLastImportRow',String(totalRows+1));
    const ts=new Date().toISOString();
    setImportLog(p=>[{at:ts,imported:imported.length,dups:dups.length},...p.slice(0,49)]);
    alert(`Import done: ${imported.length} new leads imported, ${dups.length} duplicates skipped.`);
  }catch(e){
    alert("Import error: "+e.message);
    console.error("Import error:",e);
  }finally{setSyncing(null);}
};

const connectWhop=()=>{
  if(!whopKey){alert("Please enter your Whop API key");return}
  setIntegrations(p=>({...p,whop:{connected:true,apiKey:whopKey,productId:whopProduct,lastSync:new Date().toISOString()}}));
};
const disconnectWhop=()=>{
  if(!confirm("Disconnect Whop? Existing course-buyer leads remain."))return;
  setIntegrations(p=>({...p,whop:{connected:false,apiKey:"",productId:"",lastSync:null}}));
  setWhopKey("");setWhopProduct("");
};
const syncWhopNow=()=>{
  setSyncing("whop");
  /* Simulated sync — production code would call Whop API: api.whop.com/api/v1/memberships */
  setTimeout(()=>{
    setIntegrations(p=>({...p,whop:{...p.whop,lastSync:new Date().toISOString()}}));
    setSyncing(null);
    alert("Whop sync complete (simulated). In production, this would pull new course buyers and create them as leads tagged 'Whop'.");
  },1500);
};

return(
<div style={{display:"flex",flexDirection:"column",gap:14,maxWidth:840}}>
<div><div style={{fontSize:13,color:T.tx2,marginBottom:4}}>Connect external services to automatically pull data into your dashboard.</div></div>

{/* GOOGLE SHEETS SYNC STATUS */}
{!sheetsOk&&<div style={{padding:"10px 14px",background:T.yelBg,borderRadius:8,border:"1px solid "+T.yelD+"30",fontSize:11,color:T.yel,display:"flex",gap:8,alignItems:"flex-start"}}>
<Ic t="alert" s={14} c={T.yel}/>
<div><b>Setup required:</b> Add VITE_GOOGLE_CLIENT_EMAIL and VITE_GOOGLE_PRIVATE_KEY to your .env.local file (copy the values from google-credentials.json), then restart the dev server with <span style={{fontFamily:MONO}}>npm run dev</span>.</div>
</div>}

{/* GOOGLE SHEETS */}
<Crd title={<div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:34,height:34,borderRadius:8,background:T.grnBg,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t="sheet" s={18} c={T.grn}/></div><div><div style={{fontSize:13,fontWeight:600,color:T.tx}}>Google Sheets — Two-Way Sync</div><div style={{fontSize:10,color:T.tx3,fontWeight:400}}>Master sheet: push changes from app → sheet, pull new leads from sheet → app</div></div></div>} action={<div style={{display:"flex",gap:6,alignItems:"center"}}><Bd text={sheetsOk?"Credentials OK":"Not Configured"} color={sheetsOk?"grn":"yel"}/><Bd text={integrations.googleSheets.connected?"Active":"Connect"} color={integrations.googleSheets.connected?"grn":"def"}/></div>}>
{!integrations.googleSheets.connected?<div style={{display:"flex",flexDirection:"column",gap:10}}>
<Inp label="Master Sheet URL (pre-filled)" value={gsUrl} onChange={setGsUrl} ph="https://docs.google.com/spreadsheets/d/..."/>
<Btn v="pri" icon="link" onClick={connectSheet}>Connect Sheet</Btn>
</div>:<div style={{display:"flex",flexDirection:"column",gap:12}}>
<div style={{padding:12,background:T.s1,borderRadius:6,fontSize:11,color:T.tx2}}>
<div style={{fontSize:9,color:T.tx3,marginBottom:6,fontWeight:600,textTransform:"uppercase"}}>Sync Status</div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
<div><div style={{fontSize:9,color:T.tx3,marginBottom:2}}>Last Push (App→Sheet)</div><div style={{color:integrations.googleSheets.lastSync?T.grn:T.tx3,fontFamily:MONO,fontSize:10}}>{integrations.googleSheets.lastSync?fmtDT(integrations.googleSheets.lastSync):"Never"}</div></div>
<div><div style={{fontSize:9,color:T.tx3,marginBottom:2}}>Total Leads</div><div style={{color:T.acc,fontFamily:MONO,fontSize:10,fontWeight:700}}>{leads.length}</div></div>
</div>
{syncProgress&&<div style={{marginTop:8}}><div style={{fontSize:9,color:T.tx3,marginBottom:4}}>Syncing {syncProgress.done}/{syncProgress.total}…</div><Bar v={syncProgress.done} max={syncProgress.total} color={T.grn} h={6}/></div>}
</div>
<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
<Btn v="pri" icon="repeat" onClick={syncSheetNow}>{syncing==="sheets"?"Syncing ("+((syncProgress?.done||0))+"/"+(syncProgress?.total||leads.length)+")…":"Sync All Leads → Sheet"}</Btn>
<Btn v="ok" icon="aDown" onClick={importNow}>{syncing==="import"?"Importing…":"Import New from Sheet"}</Btn>
<a href={"https://docs.google.com/spreadsheets/d/"+MASTER_SHEET_ID} target="_blank" rel="noopener noreferrer"><Btn v="def" icon="link">Open Sheet</Btn></a>
<Btn v="dan" icon="x" onClick={disconnectSheet}>Disconnect</Btn>
</div>
{syncLog.length>0&&<div>
<div style={{fontSize:9,color:T.tx3,marginBottom:4,fontWeight:600,textTransform:"uppercase"}}>Sync History</div>
{syncLog.slice(0,5).map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:10,padding:"4px 0",borderBottom:"1px solid "+T.bdr+"20"}}>
<span style={{fontFamily:MONO,color:T.tx3,fontSize:9}}>{fmtDT(s.at)}</span>
<Bd text={s.ok+" ok"} color="grn"/>
{s.fail>0&&<Bd text={s.fail+" failed"} color="red"/>}
</div>)}
</div>}
{importLog.length>0&&<div>
<div style={{fontSize:9,color:T.tx3,marginBottom:4,fontWeight:600,textTransform:"uppercase"}}>Import History</div>
{importLog.slice(0,5).map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:10,padding:"4px 0",borderBottom:"1px solid "+T.bdr+"20"}}>
<span style={{fontFamily:MONO,color:T.tx3,fontSize:9}}>{fmtDT(s.at)}</span>
<Bd text={s.imported+" imported"} color="grn"/>
{s.dups>0&&<Bd text={s.dups+" dupes skipped"} color="yel"/>}
</div>)}
</div>}
</div>}
</Crd>

{/* WHOP */}
<Crd title={<div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:34,height:34,borderRadius:8,background:T.purBg,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t="whop" s={18} c={T.pur}/></div><div><div style={{fontSize:13,fontWeight:600,color:T.tx}}>Whop</div><div style={{fontSize:10,color:T.tx3,fontWeight:400}}>Auto-import course buyers as leads for VIP upsell</div></div></div>} action={<Bd text={integrations.whop.connected?"Connected":"Not Connected"} color={integrations.whop.connected?"grn":"def"}/>}>
{!integrations.whop.connected?<div style={{display:"flex",flexDirection:"column",gap:10}}>
<Inp label="Whop API Key" value={whopKey} onChange={setWhopKey} ph="whop_live_..." type="password"/>
<Inp label="Product ID (optional)" value={whopProduct} onChange={setWhopProduct} ph="prod_XXXXX (filter to one course)"/>
<div style={{fontSize:10,color:T.tx3,lineHeight:1.6}}>
1. Go to <span style={{color:T.acc,fontFamily:MONO}}>whop.com/dashboard/developer</span><br/>
2. Click <b style={{color:T.tx2}}>Create App</b> → copy the API key (starts with <span style={{fontFamily:MONO}}>whop_live_</span> or <span style={{fontFamily:MONO}}>whop_test_</span>)<br/>
3. Paste it above. Optionally add a Product ID to only sync buyers of a specific course<br/>
4. When connected, every new course purchase becomes a lead tagged "Whop"
</div>
<Btn v="pri" icon="link" onClick={connectWhop}>Connect Whop</Btn>
</div>:<div style={{display:"flex",flexDirection:"column",gap:10}}>
<div style={{padding:12,background:T.s1,borderRadius:6,fontSize:11,color:T.tx2}}>
<div style={{fontSize:9,color:T.tx3,marginBottom:4,fontWeight:600,textTransform:"uppercase"}}>API Key</div>
<span style={{fontFamily:MONO}}>{integrations.whop.apiKey.slice(0,12)}{"·".repeat(20)}</span>
{integrations.whop.productId&&<div style={{fontSize:10,color:T.tx3,marginTop:4}}>Product: <span style={{fontFamily:MONO,color:T.acc}}>{integrations.whop.productId}</span></div>}
{integrations.whop.lastSync&&<div style={{fontSize:9,color:T.grn,marginTop:6,fontFamily:MONO}}>Last sync: {fmtDT(integrations.whop.lastSync)}</div>}
</div>
<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
<Btn v="pri" icon="repeat" onClick={syncWhopNow}>{syncing==="whop"?"Syncing...":"Sync Now"}</Btn>
<a href="https://whop.com/dashboard" target="_blank" rel="noopener noreferrer"><Btn v="def" icon="link">Whop Dashboard</Btn></a>
<Btn v="dan" icon="x" onClick={disconnectWhop}>Disconnect</Btn>
</div>
<div style={{padding:10,background:T.bluBg,borderRadius:6,fontSize:10,color:T.blu,display:"flex",gap:6}}><Ic t="alert" s={12}/>For live integration, Claude Code will set up a webhook endpoint and a backend that calls api.whop.com/api/v1/memberships. Your dashboard then receives every new course buyer in real-time.</div>
</div>}
</Crd>

{/* COMING SOON */}
<Crd title="More Integrations">
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
{[{n:"Slack",d:"Lead alerts to channels",ic:"send"},{n:"Razorpay",d:"Auto invoice on payment",ic:"dollar"},{n:"Calendly",d:"Sync booked calls",ic:"cal"},{n:"Gmail",d:"Email tracking",ic:"mail"},{n:"WhatsApp Business",d:"Lead notifications",ic:"phone"},{n:"Zoom",d:"Meeting recordings",ic:"play"}].map(i=><div key={i.n} style={{padding:12,background:T.s2,borderRadius:8,border:"1px solid "+T.bdr,display:"flex",alignItems:"center",gap:10}}>
<div style={{width:28,height:28,borderRadius:6,background:T.s3,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic t={i.ic} s={14} c={T.tx3}/></div>
<div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:T.tx}}>{i.n}</div><div style={{fontSize:9,color:T.tx3}}>{i.d}</div></div>
<Bd text="Soon" color="def"/>
</div>)}
</div>
</Crd>
</div>
)}

/* ═══ TEAM PAGE (Admin) ═══ */
function TeamP({allUsers,setAllUsers}){
const[search,setSearch]=useState("");
const q=(search||"").toLowerCase();const filtered=allUsers.filter(u=>(u.name||"").toLowerCase().includes(q)||(u.email||"").toLowerCase().includes(q)||(u.role||"").toLowerCase().includes(q));
const changeRole=(id,patch)=>{setAllUsers(p=>p.map(u=>u.id===id?{...u,...patch}:u));supabase.from('profiles').update(patch).eq('id',id);};
const removeUser=(id)=>{
  const u=allUsers.find(x=>x.id===id);
  if(!u)return;
  if(u.role==="admin"&&allUsers.filter(x=>x.role==="admin").length<=1){alert("Cannot remove the last admin.");return}
  if(confirm("Remove "+(u.name||u.email||"this user")+"? They will no longer be able to sign in.")){setAllUsers(p=>p.filter(x=>x.id!==id));supabase.from('profiles').delete().eq('id',id);}
};
return(
<div style={{display:"flex",flexDirection:"column",gap:14}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
<div style={{flex:1,maxWidth:320}}><Inp value={search} onChange={setSearch} ph="Search team members..."/></div>
<div style={{fontSize:11,color:T.tx3,fontFamily:MONO}}>{allUsers.length} member{allUsers.length!==1?"s":""}</div>
</div>
<Crd title="Team Members">
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
<thead><tr style={{borderBottom:"1px solid "+T.bdr}}>{["Name","Email","Role","Joined","Sign-in",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:T.tx3,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
<tbody>{filtered.map(u=><tr key={u.id} style={{borderBottom:"1px solid "+T.bdr+"15"}}>
<td style={{padding:10}}><div style={{display:"flex",alignItems:"center",gap:8}}><Av name={u.name||u.email||"?"} sz={28}/><span style={{fontWeight:500,color:T.tx}}>{u.name||"—"}</span></div></td>
<td style={{padding:10,color:T.tx2,fontFamily:MONO,fontSize:10}}>{u.email||"—"}</td>
<td style={{padding:10}}>
<select value={u.role+(u.subrole?":"+u.subrole:"")} onChange={e=>{const[r,sr]=e.target.value.split(":");changeRole(u.id,{role:r,subrole:sr||r,dept:r==="admin"?"all":r==="sales"?"sales":r==="finance"?"finance":"tech"})}} style={{padding:"5px 8px",borderRadius:5,border:"1px solid "+T.bdr,background:T.inp,color:T.tx,fontSize:11,fontFamily:FONT,outline:"none"}}>
<option value="admin:admin">Admin</option>
<option value="sales:setter">Sales — Setter</option>
<option value="sales:closer">Sales — Closer</option>
<option value="finance:finance">Finance</option>
<option value="tech:tech">Tech</option>
</select>
</td>
<td style={{padding:10,color:T.tx3,fontFamily:MONO,fontSize:9}}>{u.createdAt?fmtDT(u.createdAt):"Pre-existing"}</td>
<td style={{padding:10}}><Bd text={u.provider==="google"?"Google":"Password"} color={u.provider==="google"?"blu":"def"}/></td>
<td style={{padding:10,textAlign:"right"}}><Btn sm v="dan" icon="trash" onClick={()=>removeUser(u.id)}>Remove</Btn></td>
</tr>)}</tbody></table>
{filtered.length===0&&<div style={{padding:30,textAlign:"center",color:T.tx3,fontSize:12}}>No members match your search</div>}
</div>
</Crd>
<div style={{padding:12,background:T.s2,borderRadius:8,fontSize:11,color:T.tx2,lineHeight:1.6,border:"1px solid "+T.bdr}}>
<div style={{fontSize:11,fontWeight:600,color:T.tx,marginBottom:4}}>How signups work</div>
Anyone with the dashboard URL can sign up (email or Google) and joins as a <b style={{color:T.tx2}}>Setter</b> by default — nobody can self-select a higher role. You'll get a bell notification when someone joins. Promote them (Closer / Admin) or remove them from this page.
</div>
</div>
)}

/* ═══ COMPLETE PROFILE (new Google users) ═══ */
function CompleteProfilePage({authUser,onComplete}){
const[name,setName]=useState(authUser.user_metadata?.full_name||authUser.user_metadata?.name||"");
const[role,setRole]=useState("sales");
const[subrole,setSubrole]=useState("setter");
const[loading,setLoading]=useState(false);
const[err,setErr]=useState("");

const handleComplete=async()=>{
  setErr("");setLoading(true);
  if(!name.trim()){setErr("Please enter your name");setLoading(false);return}
  const provider=authUser.app_metadata?.provider||authUser.identities?.[0]?.provider||'password';
  console.log("[PROFILE] Saving name for",authUser.email,"id:",authUser.id);
  /* Role is intentionally NOT written here. The 0c signup trigger already
     created this profile as least-privilege setter; we only persist name/email
     so this page can never override the trigger's role. Admins promote via Team.
     On INSERT (if the trigger somehow didn't run) role/subrole fall back to the
     table defaults (sales/setter), which are also least-privilege. */
  const{error}=await supabase.from('profiles').upsert(
    {id:authUser.id,name:name.trim(),email:authUser.email,provider},
    {onConflict:'id'}
  );
  if(error){
    console.error("[PROFILE] Upsert error:",JSON.stringify(error,null,2));
    setErr("Failed to save profile: "+error.message);setLoading(false);return;
  }
  console.log("[PROFILE] Profile saved successfully");
  setLoading(false);
  onComplete();
};

return(
<div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT,padding:20}}>
<div style={{width:"100%",maxWidth:440,padding:32,background:T.s2,borderRadius:16,border:"1px solid "+T.bdr,boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>

{/* Header */}
<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
<img src="/logo.png" alt="HTSyndicate" style={{height:44,objectFit:"contain",display:"block"}}/>
<div><div style={{fontSize:18,fontWeight:700,color:T.tx}}>One last step</div><div style={{fontSize:11,color:T.tx3}}>Tell us about your role at HTSyndicate</div></div>
</div>

{/* Google badge */}
<div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:T.s3,borderRadius:9,border:"1px solid "+T.bdr,marginBottom:20}}>
<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
<div style={{flex:1,minWidth:0}}>
<div style={{fontSize:12,fontWeight:600,color:T.tx}}>Google account verified</div>
<div style={{fontSize:11,color:T.tx3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser.email}</div>
</div>
<div style={{width:8,height:8,borderRadius:99,background:T.grn,flexShrink:0}}/>
</div>

{/* Form */}
<div style={{display:"flex",flexDirection:"column",gap:12}}>
<Inp label="Your Name" value={name} onChange={setName} ph="Full name"/>
{/* No role picker — new Google users join as a least-privilege Setter.
    Admins promote from the Team page. Matches the 0c trigger. */}
<div style={{padding:10,background:T.s1,borderRadius:6,fontSize:10,color:T.tx3,lineHeight:1.6}}>
<div style={{fontWeight:600,color:T.tx2,marginBottom:2}}>Your access</div>
You'll join as a <b style={{color:T.tx2}}>Setter</b> — pipeline, lead sheet, calls, tasks, and leaves. An admin can promote you from the Team page.
</div>

{err&&<div style={{fontSize:11,color:T.red,padding:"7px 10px",background:T.redBg,borderRadius:5,lineHeight:1.4}}>{err}</div>}
<Btn v="pri" full onClick={handleComplete}>{loading?"Setting up your account…":"Enter Dashboard"}</Btn>
</div>
</div>
</div>
)}

/* ═══ APP ═══ */
const getNav=r=>{
if(r==="admin")return[{id:"overview",l:"Overview",ic:"dash"},{id:"sales",l:"Sales",ic:"sales"},{id:"revenue",l:"Revenue",ic:"bar"},{id:"finance",l:"Finance",ic:"fin"},{id:"tasks",l:"Tasks",ic:"task"},{id:"att",l:"Attendance",ic:"punch"},{id:"team",l:"Team",ic:"users"}];
if(r==="sales")return[{id:"sales",l:"Sales",ic:"sales"},{id:"tasks",l:"My Tasks",ic:"task"}];
if(r==="finance")return[{id:"finance",l:"Finance",ic:"fin"},{id:"tasks",l:"My Tasks",ic:"task"}];
return[{id:"tasks",l:"My Tasks",ic:"task"}];
};

export default function App(){
const[user,setUser]=useState(null);const[pg,setPg]=useState(null);const[sb,setSb]=useState(true);
const[welcomeBack,setWelcomeBack]=useState(null);
const[allUsers,setAllUsers]=useState([]);
const[integrations,setIntegrations]=useState({
  googleSheets:{connected:false,sheetUrl:"",lastSync:null,sheetId:""},
  whop:{connected:false,apiKey:"",lastSync:null,productId:""}
});
const[leads,setLeads]=useState([]);const[inv,setInv]=useState([]);const[tasks,setTasks]=useState([]);const[autos,setAutos]=useState([]);const[punch,setPunch]=useState({});
const[pipelines,setPipelines]=useState([]);
const[setterStages,setSetterStages]=useState([]);
const[closerStages,setCloserStages]=useState([]);
const[leaves,setLeaves]=useState([]);
const[bankPayments,setBankPayments]=useState([]);
const[notifications,setNotifications]=useState([]);
const[showLeaveForm,setShowLeaveForm]=useState(false);
const[showNotifs,setShowNotifs]=useState(false);
const[time,setTime]=useState(new Date());
const[isMobile,setIsMobile]=useState(typeof window!=="undefined"&&window.innerWidth<768);
useEffect(()=>{const t=setInterval(()=>setTime(new Date()),6e4);return()=>clearInterval(t)},[]);
useEffect(()=>{
  const onResize=()=>{const m=window.innerWidth<768;setIsMobile(m);if(m)setSb(false)};
  onResize();
  window.addEventListener("resize",onResize);
  return()=>window.removeEventListener("resize",onResize);
},[]);

/* ─── Push notifications ────────────────────────────────────── */
/* Subscribe the device once logged in. iOS/Safari only show the permission
   prompt from a user gesture, so when permission is still "default" we defer
   to the first tap/click. A push click deep-links via ?lead= or a SW message. */
useEffect(()=>{
  if(!user||!isPushSupported())return;

  // Notification click while the app is already open → jump to Sales.
  const onMsg=(e)=>{if(e?.data?.type==="OPEN_LEAD")setPg("sales");};
  navigator.serviceWorker?.addEventListener?.("message",onMsg);
  // Cold-open from a notification: ?lead=<id> in the URL.
  try{if(new URLSearchParams(window.location.search).get("lead"))setPg("sales");}catch{}

  let cleanupGesture=()=>{};
  if(Notification.permission==="granted"){
    initPushNotifications(user);
  }else if(Notification.permission==="default"){
    const onGesture=()=>{initPushNotifications(user);cleanupGesture();};
    cleanupGesture=()=>{window.removeEventListener("pointerdown",onGesture);window.removeEventListener("keydown",onGesture);};
    window.addEventListener("pointerdown",onGesture,{once:true});
    window.addEventListener("keydown",onGesture,{once:true});
  }

  return()=>{navigator.serviceWorker?.removeEventListener?.("message",onMsg);cleanupGesture();};
},[user]);

/* ─── Auth ─────────────────────────────────────────────────── */
/* Build user object from Supabase auth session — no DB fetch required to show UI */
const authUserToProfile=(au)=>{
  const m=au.user_metadata||{};
  return{id:au.id,email:au.email||'',
    name:m.full_name||m.name||au.email?.split('@')[0]||'User',
    role:m.app_role||'sales',subrole:m.app_subrole||'setter',dept:m.app_dept||'sales',
    provider:au.app_metadata?.provider||'password',createdAt:au.created_at,password:'••••••'};
};

useEffect(()=>{
  /* On mount: resolve session and show UI instantly — no loading screen ever */
  supabase.auth.getSession().then(({data:{session}})=>{
    if(!session)return;/* no session → login form visible (user===null) */
    const p=authUserToProfile(session.user);
    setUser(p);setPg(getNav(p.role)[0]?.id);
    setWelcomeBack(p.name);setTimeout(()=>setWelcomeBack(null),2500);
    /* Enhance with DB profile in background — updates role/name if set via Team panel */
    supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle()
      .then(({data})=>{
        if(data){setUser(profileFromDb(data));}
        else{
          /* No profile row yet (user arrived via existing session) → create one.
             onAuthStateChange skips INITIAL_SESSION, so this path must self-heal. */
          supabase.from('profiles').upsert(
            {id:session.user.id,name:p.name,email:p.email,role:p.role,subrole:p.subrole,dept:p.dept,provider:p.provider},
            {onConflict:'id'}
          ).then(({data:d2})=>{if(d2?.[0])setUser(profileFromDb(d2[0]));});
        }
      }).catch(()=>{});
  });

  const{data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
    if(event==='INITIAL_SESSION')return;/* handled above */
    if(session){
      const p=authUserToProfile(session.user);
      setUser(p);setPg(pg=>pg||getNav(p.role)[0]?.id);
      /* Sync profile to DB in background; create if missing */
      supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle().then(({data})=>{
        if(data){setUser(profileFromDb(data));}
        else{
          supabase.from('profiles').upsert(
            {id:session.user.id,name:p.name,email:p.email,role:p.role,subrole:p.subrole,dept:p.dept,provider:p.provider},
            {onConflict:'id'}
          ).then(({data:d2,error:e2})=>{if(e2)console.error("[PROFILE bg upsert]",JSON.stringify(e2,null,2));if(d2?.[0])setUser(profileFromDb(d2[0]));});
        }
      }).catch(()=>{});
    }else{
      setUser(null);setPg(null);
      setLeads([]);setInv([]);setTasks([]);setAutos([]);setPunch({});
    }
  });
  return()=>subscription.unsubscribe();
},[]);

/* ─── Data loading + real-time subscriptions ────────────────── */
useEffect(()=>{
  if(!user)return;
  /* Initial load */
  /* Paginated leads fetch — Supabase caps single select at 1000 rows by default. */
  const fetchAllLeads=async()=>{
    const all=[];const chunk=1000;
    for(let from=0;;from+=chunk){
      const{data,error}=await supabase.from('leads').select('*').order('created_at',{ascending:false}).range(from,from+chunk-1);
      if(error)return{data:all,error};
      if(!data||data.length===0)break;
      all.push(...data);
      if(data.length<chunk)break;
    }
    return{data:all,error:null};
  };
  Promise.all([
    fetchAllLeads(),
    supabase.from('invoices').select('*').order('created_at',{ascending:false}),
    supabase.from('tasks').select('*').order('created_at',{ascending:false}),
    supabase.from('automations').select('*'),
    supabase.from('punch_state').select('*'),
    supabase.from('punch_records').select('*').order('date',{ascending:false}),
    supabase.from('pipelines').select('*').order('sort_order'),
    /* Stages are loaded per active pipeline inside SalesP (see loadStagesForPipeline). */
    supabase.from('leaves').select('*').order('submitted_at',{ascending:false}),
    supabase.from('bank_payments').select('*').order('received_at',{ascending:false}),
    supabase.from('notifications').select('*').order('at',{ascending:false}),
    supabase.from('profiles').select('*'),
  ]).then(([{data:ld},{data:id},{data:td},{data:ad},{data:psd},{data:phd},{data:ppd},{data:lvd},{data:bpd},{data:nd},{data:pfd}])=>{
    if(ld)setLeads(ld.map(leadFromDb));
    if(id)setInv(id);
    if(td)setTasks(td);
    if(ad)setAutos(ad);
    if(psd&&phd)setPunch(punchStateFromDb(psd,phd));
    if(ppd&&ppd.length){
      /* DB stores only real pipelines (no "all" row). Always prepend the
         aggregate "all" entry from DEFAULT_PIPELINES so the dropdown
         contains it — otherwise activePipeline defaults to "all", but
         curPipeline falls back to pipelines[0] (e.g. Webinar), making the
         header label say "Webinar" while stagesEditable is still false
         and the Add/Edit/Delete stage controls stay hidden. */
      const allRow=DEFAULT_PIPELINES.find(p=>p.id==="all");
      const fromDb=ppd.map(p=>({...p,sources:Array.isArray(p.sources)?p.sources:(JSON.parse(p.sources||'[]'))}));
      setPipelines(fromDb.some(p=>p.id==="all")?fromDb:[allRow,...fromDb]);
    }
    else setPipelines(DEFAULT_PIPELINES);
    if(lvd)setLeaves(lvd.map(leaveFromDb));
    if(bpd)setBankPayments(bpd.map(bankPaymentFromDb));
    if(nd)setNotifications(nd.map(notifFromDb));
    if(pfd)setAllUsers(pfd.map(profileFromDb));
  });
  /* Real-time subscriptions */
  const subs=[
    supabase.channel('leads_rt').on('postgres_changes',{event:'*',schema:'public',table:'leads'},({eventType:et,new:n,old:o})=>{
      if(et==='INSERT')setLeads(p=>[leadFromDb(n),...p.filter(x=>x.id!==n.id)]);
      if(et==='UPDATE')setLeads(p=>p.map(x=>x.id===n.id?leadFromDb(n):x));
      if(et==='DELETE')setLeads(p=>p.filter(x=>x.id!==o.id));
    }).subscribe(),
    supabase.channel('invoices_rt').on('postgres_changes',{event:'*',schema:'public',table:'invoices'},({eventType:et,new:n,old:o})=>{
      if(et==='INSERT')setInv(p=>[n,...p.filter(x=>x.id!==n.id)]);
      if(et==='UPDATE')setInv(p=>p.map(x=>x.id===n.id?n:x));
      if(et==='DELETE')setInv(p=>p.filter(x=>x.id!==o.id));
    }).subscribe(),
    supabase.channel('tasks_rt').on('postgres_changes',{event:'*',schema:'public',table:'tasks'},({eventType:et,new:n,old:o})=>{
      if(et==='INSERT')setTasks(p=>[n,...p.filter(x=>x.id!==n.id)]);
      if(et==='UPDATE')setTasks(p=>p.map(x=>x.id===n.id?n:x));
      if(et==='DELETE')setTasks(p=>p.filter(x=>x.id!==o.id));
    }).subscribe(),
    supabase.channel('autos_rt').on('postgres_changes',{event:'UPDATE',schema:'public',table:'automations'},({new:n})=>{
      setAutos(p=>p.map(x=>x.id===n.id?n:x));
    }).subscribe(),
    supabase.channel('leaves_rt').on('postgres_changes',{event:'*',schema:'public',table:'leaves'},({eventType:et,new:n,old:o})=>{
      if(et==='INSERT')setLeaves(p=>[leaveFromDb(n),...p.filter(x=>x.id!==n.id)]);
      if(et==='UPDATE')setLeaves(p=>p.map(x=>x.id===n.id?leaveFromDb(n):x));
      if(et==='DELETE')setLeaves(p=>p.filter(x=>x.id!==o.id));
    }).subscribe(),
    supabase.channel('bankpay_rt').on('postgres_changes',{event:'*',schema:'public',table:'bank_payments'},({eventType:et,new:n,old:o})=>{
      if(et==='INSERT')setBankPayments(p=>[bankPaymentFromDb(n),...p.filter(x=>x.id!==n.id)]);
      if(et==='UPDATE')setBankPayments(p=>p.map(x=>x.id===n.id?bankPaymentFromDb(n):x));
      if(et==='DELETE')setBankPayments(p=>p.filter(x=>x.id!==o.id));
    }).subscribe(),
    supabase.channel('notifs_rt').on('postgres_changes',{event:'*',schema:'public',table:'notifications'},({eventType:et,new:n})=>{
      if(et==='INSERT')setNotifications(p=>[notifFromDb(n),...p.filter(x=>x.id!==n.id)]);
      if(et==='UPDATE')setNotifications(p=>p.map(x=>x.id===n.id?notifFromDb(n):x));
    }).subscribe(),
    supabase.channel('profiles_rt').on('postgres_changes',{event:'*',schema:'public',table:'profiles'},({eventType:et,new:n,old:o})=>{
      if(et==='INSERT'||et==='UPDATE')setAllUsers(p=>[...p.filter(x=>x.id!==n.id),profileFromDb(n)]);
      if(et==='DELETE')setAllUsers(p=>p.filter(x=>x.id!==o.id));
    }).subscribe(),
    supabase.channel('punch_rt').on('postgres_changes',{event:'*',schema:'public',table:'punch_state'},async()=>{
      const[{data:ps},{data:ph}]=await Promise.all([
        supabase.from('punch_state').select('*'),
        supabase.from('punch_records').select('*').order('date',{ascending:false}),
      ]);
      if(ps&&ph)setPunch(punchStateFromDb(ps,ph));
    }).subscribe(),
  ];
  return()=>subs.forEach(s=>s.unsubscribe());
},[user]);

/* Helpers exposed via context */
const submitLeave=(req)=>{
  const newLeave={id:uid(),...req,by:user.name,status:"pending",submittedAt:new Date().toISOString()};
  setLeaves(p=>[newLeave,...p]);
  supabase.from('leaves').insert(leaveToDb(newLeave));
  const notif={id:uid(),type:"leave",msg:user.name+" requested leave for "+req.from+(req.from!==req.to?" → "+req.to:""),at:new Date().toISOString(),read:false,for:"admin",linkTo:"leaves"};
  setNotifications(p=>[notif,...p]);
  supabase.from('notifications').insert(notifToDb(notif));
};
const updateLeave=(id,status)=>{
  const decidedAt=new Date().toISOString();const decidedBy=user.name;
  setLeaves(p=>p.map(l=>l.id===id?{...l,status,decidedAt,decidedBy}:l));
  supabase.from('leaves').update({status,decided_at:decidedAt,decided_by:decidedBy}).eq('id',id);
  const lv=leaves.find(l=>l.id===id);
  if(lv){
    const notif={id:uid(),type:"leave_decision",msg:"Your leave was "+status+" by "+user.name,at:new Date().toISOString(),read:false,forUser:lv.by,linkTo:"leaves"};
    setNotifications(p=>[notif,...p]);
    supabase.from('notifications').insert(notifToDb(notif));
  }
};
const markNotifRead=(id)=>{setNotifications(p=>p.map(n=>n.id===id?{...n,read:true}:n));supabase.from('notifications').update({read:true}).eq('id',id);};
const markAllRead=()=>{setNotifications(p=>p.map(n=>({...n,read:true})));supabase.from('notifications').update({read:true}).in('id',notifications.filter(n=>!n.read).map(n=>n.id));};

/* Notify on new lead — wrap setLeads, write to DB.
   Real-time pings fire only during work hours (10:00–19:00 local). */
const setLeadsNotify=(updater)=>{
  setLeads(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    if(next.length>prev.length){
      const newOnes=next.filter(n=>!prev.find(p=>p.id===n.id));
      newOnes.forEach(async l=>{
        await supabase.from('leads').insert(leadToDb(l));
        if(!isWorkHours())return;
        const notif={id:uid(),type:"new_lead",msg:"🔥 Hot lead: "+l.name+" ("+l.company+") via "+l.source,at:new Date().toISOString(),read:false,for:"sales",linkTo:"sales"};
        setNotifications(p=>[notif,...p]);
        await supabase.from('notifications').insert(notifToDb(notif));
      });
    }
    return next;
  });
};

/* Auto-link bank payment → invoice */
const linkBankPayment=(pmtId,leadId,invoiceId)=>{
  setBankPayments(p=>p.map(b=>b.id===pmtId?{...b,linkedLeadId:leadId,linkedInvoiceId:invoiceId,status:"linked"}:b));
  supabase.from('bank_payments').update({linked_lead_id:leadId,linked_invoice_id:invoiceId,status:'linked'}).eq('id',pmtId);
};

/* Punch handler that writes to Supabase */
const handlePunch=(updater)=>{
  setPunch(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    Object.keys(next).forEach(name=>{
      if(next[name]?.in!==prev[name]?.in||next[name]?.inT!==prev[name]?.inT){
        supabase.from('punch_state').upsert({person_name:name,dept:next[name].dept,clocked_in:next[name].in,in_time:next[name].inT,out_time:next[name].outT,hours_today:next[name].hrs||0,tasks_today:next[name].tasks||0,calls_today:next[name].calls||0,productivity:next[name].prod||0,updated_at:new Date().toISOString()});
      }
    });
    return next;
  });
};

/* No loading screen — session exists = dashboard, no session = login form */
if(!user)return <LoginPage/>;
const nav=getNav(user.role);
const myNotifs=notifications.filter(n=>n.read===false&&((n.for==="admin"&&user.role==="admin")||(n.for==="sales"&&(user.role==="admin"||user.role==="sales"))||n.forUser===user.name));
return(
<div style={{fontFamily:FONT,background:T.bg,color:T.tx,minHeight:"100vh",display:"flex",position:"relative"}}>
<link href="https://fonts.googleapis.com/css2?family=Satoshi:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>

{welcomeBack&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:2000,background:T.s2,border:"1px solid "+T.bdr,borderRadius:12,padding:"12px 22px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 8px 32px rgba(0,0,0,.5)",backdropFilter:"blur(8px)",fontFamily:FONT,animation:"slideDown .35s ease"}}>
  <style>{`@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
  <div style={{width:8,height:8,borderRadius:99,background:T.grn,flexShrink:0}}/>
  <span style={{fontSize:13,fontWeight:600,color:T.tx}}>Welcome back, {welcomeBack.split(" ")[0]}!</span>
  <span style={{fontSize:11,color:T.tx3}}>Loading your dashboard…</span>
</div>}
{/* Mobile overlay backdrop when sidebar is open */}
{isMobile&&sb&&<div onClick={()=>setSb(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:90,backdropFilter:"blur(2px)"}}/>}

<aside style={{
  width:isMobile?(sb?260:0):(sb?216:56),
  background:T.bg,
  borderRight:"1px solid "+T.bdr,
  display:"flex",
  flexDirection:"column",
  transition:"width .25s",
  overflow:"hidden",
  flexShrink:0,
  position:isMobile?"fixed":"relative",
  top:0,bottom:0,left:0,
  zIndex:isMobile?100:1,
  boxShadow:isMobile&&sb?"4px 0 20px rgba(0,0,0,.5)":"none"
}}>
<div style={{height:56,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",flexShrink:0}}>
{sb?<img src="/logo.png" alt="HTSyndicate" style={{width:120,height:40,objectFit:"contain",display:"block",margin:"0 auto"}}/>
   :<img src="/logo.png" alt="HTSyndicate" style={{width:36,height:36,objectFit:"contain",display:"block",margin:"0 auto"}}/>}
{sb&&isMobile&&<button onClick={()=>setSb(false)} style={{position:"absolute",top:10,right:10,background:"none",border:"none",color:T.tx3,cursor:"pointer",padding:4}}><Ic t="x" s={16}/></button>}
</div>
<nav style={{flex:1,padding:"4px 0",display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
{sb&&<div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:1.4,color:T.tx3,padding:"8px 16px 4px"}}>Menu</div>}
{nav.map(n=>{const on=pg===n.id;return <button key={n.id} onClick={()=>{setPg(n.id);if(isMobile)setSb(false)}} onMouseEnter={e=>{if(!on)e.currentTarget.style.background="rgba(255,255,255,0.05)"}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background="transparent"}} style={{display:"flex",alignItems:"center",gap:10,height:36,margin:"0 8px",padding:sb?"0 12px":"0",borderRadius:8,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:13,fontWeight:on?600:500,background:on?T.accBg:"transparent",color:on?T.acc:T.tx2,justifyContent:sb?"flex-start":"center",transition:"background .15s,color .15s"}}><Ic t={n.ic} s={17}/>{sb&&n.l}</button>})}
<button onClick={()=>{setPg("leaves");if(isMobile)setSb(false)}} onMouseEnter={e=>{if(pg!=="leaves")e.currentTarget.style.background="rgba(255,255,255,0.05)"}} onMouseLeave={e=>{if(pg!=="leaves")e.currentTarget.style.background="transparent"}} style={{display:"flex",alignItems:"center",gap:10,height:36,margin:"0 8px",padding:sb?"0 12px":"0",borderRadius:8,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:13,fontWeight:pg==="leaves"?600:500,background:pg==="leaves"?T.accBg:"transparent",color:pg==="leaves"?T.acc:T.tx2,justifyContent:sb?"flex-start":"center",transition:"background .15s,color .15s"}}><Ic t="cal" s={17}/>{sb&&"Leaves"}{sb&&user.role==="admin"&&leaves.filter(l=>l.status==="pending").length>0&&<span style={{marginLeft:"auto",fontSize:9,fontFamily:MONO,background:T.red,color:"#fff",padding:"1px 6px",borderRadius:99}}>{leaves.filter(l=>l.status==="pending").length}</span>}</button>
</nav>
<div style={{padding:"6px 4px"}}>
{sb&&<div style={{display:"flex",alignItems:"center",gap:10,padding:12,margin:"0 4px 4px",borderTop:"1px solid "+T.bdr}}>
<div style={{padding:1.5,borderRadius:99,border:"1.5px solid "+T.acc,display:"flex",flexShrink:0}}><Av name={user.name} sz={30}/></div>
<div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.name}</div><div style={{fontSize:11,color:T.tx2,textTransform:"capitalize",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.role}{user.dept?" · "+user.dept:""}</div></div>
</div>}
<button onClick={()=>setShowLeaveForm(true)} style={{display:"flex",alignItems:"center",gap:8,padding:isMobile?"10px 12px":"7px 9px",width:"100%",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:isMobile?12:10,color:T.acc,background:"transparent",justifyContent:sb?"flex-start":"center"}}><Ic t="cal" s={isMobile?15:13}/>{sb&&"Request Leave"}</button>
{!isMobile&&<button onClick={()=>setSb(!sb)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",width:"100%",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:10,color:T.tx3,background:"transparent",justifyContent:sb?"flex-start":"center"}}><Ic t="menu" s={13}/>{sb&&"Collapse"}</button>}
<button onClick={()=>{supabase.auth.signOut();setUser(null);setPg(null);setLeads([]);setInv([]);setTasks([]);setAutos([]);setPunch({});}} style={{display:"flex",alignItems:"center",gap:8,padding:isMobile?"10px 12px":"7px 9px",width:"100%",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:isMobile?12:10,color:T.red,background:"transparent",justifyContent:sb?"flex-start":"center"}}><Ic t="logout" s={isMobile?15:13}/>{sb&&"Logout"}</button></div></aside>
<main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0,width:"100%"}}>
<header style={{height:52,padding:isMobile?"0 14px":"0 24px",borderBottom:"1px solid "+T.bdr,display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(10,10,10,0.72)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",flexShrink:0,gap:8,position:"sticky",top:0,zIndex:40}}>
{isMobile&&<button onClick={()=>setSb(true)} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:T.tx,display:"flex",alignItems:"center"}}><Ic t="menu" s={20}/></button>}
<div style={{flex:1,minWidth:0}}><h1 style={{margin:0,fontSize:17,fontWeight:600,letterSpacing:-.3,color:T.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pg==="leaves"?"Leaves":(nav.find(n=>n.id===pg)?.l||"")}</h1>{!isMobile&&<p style={{margin:0,fontSize:12,color:T.tx2,marginTop:1}}>{time.toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>}</div>
<div style={{display:"flex",alignItems:"center",gap:isMobile?6:10,flexShrink:0}}>
{!isMobile&&<button onClick={()=>setShowLeaveForm(true)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:6,border:"1px solid "+T.bdr,background:"transparent",color:T.tx2,cursor:"pointer",fontSize:11,fontFamily:FONT,fontWeight:500}}><Ic t="cal" s={12}/>Request Leave</button>}
<button onClick={()=>setShowNotifs(!showNotifs)} style={{position:"relative",background:"transparent",border:"none",cursor:"pointer",padding:6}}><Ic t="bell" s={isMobile?18:16} c={myNotifs.length>0?T.acc:T.tx3}/>{myNotifs.length>0&&<span style={{position:"absolute",top:2,right:2,width:14,height:14,borderRadius:99,background:T.red,color:"#fff",fontSize:8,fontWeight:700,fontFamily:MONO,display:"flex",alignItems:"center",justifyContent:"center"}}>{myNotifs.length}</span>}</button>
<div style={{padding:2,borderRadius:99,border:"1.5px solid "+T.acc,display:"flex"}}><Av name={user.name} sz={isMobile?30:26}/></div></div></header>

{/* Notifications dropdown */}
{showNotifs&&<div style={{position:"absolute",top:isMobile?54:50,right:isMobile?10:20,left:isMobile?10:"auto",width:isMobile?"auto":340,maxHeight:420,background:T.s2,border:"1px solid "+T.bdr,borderRadius:10,zIndex:100,overflow:"hidden",boxShadow:"0 12px 40px rgba(0,0,0,.5)"}}>
<div style={{padding:"10px 14px",borderBottom:"1px solid "+T.bdr,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,fontWeight:600,color:T.tx}}>Notifications</span>{myNotifs.length>0&&<button onClick={markAllRead} style={{background:"none",border:"none",color:T.acc,fontSize:10,cursor:"pointer",fontFamily:FONT}}>Mark all read</button>}</div>
<div style={{maxHeight:360,overflowY:"auto"}}>
{myNotifs.length===0&&<div style={{padding:24,textAlign:"center",fontSize:11,color:T.tx3}}>No new notifications</div>}
{myNotifs.map(n=>{const ic=n.type==="leave"?"cal":n.type==="new_lead"?"users":n.type==="payment"?"dollar":n.type==="leave_decision"?"chk":"bell";const cl=n.type==="payment"?T.grn:n.type==="leave"?T.yel:n.type==="new_lead"?T.acc:T.blu;return(
<div key={n.id} onClick={()=>{markNotifRead(n.id);if(n.linkTo)setPg(n.linkTo);setShowNotifs(false)}} style={{display:"flex",gap:10,padding:"10px 14px",borderBottom:"1px solid "+T.bdr+"40",cursor:"pointer",alignItems:"flex-start"}}>
<div style={{width:28,height:28,borderRadius:6,background:cl+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic t={ic} s={14} c={cl}/></div>
<div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:T.tx,lineHeight:1.4}}>{n.msg}</div><div style={{fontSize:9,color:T.tx3,marginTop:2,fontFamily:MONO}}>{fmtDT(n.at)}</div></div>
</div>)})}
</div></div>}

<div style={{flex:1,overflow:"auto",padding:isMobile?12:18}}>
{user.role!=="admin"&&punch[user.name]&&<PunchBar user={user} punch={punch} setPunch={handlePunch}/>}
{pg==="overview"&&user.role==="admin"&&<OverP leads={leads} invoices={inv} tasks={tasks} autos={autos} punch={punch}/>}
{pg==="sales"&&<SalesP user={user} leads={leads} setLeads={setLeadsNotify} pipelines={pipelines} setPipelines={setPipelines} setterStages={setterStages} setSetterStages={setSetterStages} closerStages={closerStages} setCloserStages={setCloserStages} allUsers={allUsers}/>}
{pg==="revenue"&&user.role==="admin"&&<RevenueP leads={leads} pipelines={pipelines}/>}
{pg==="finance"&&<FinP invoices={inv} setInvoices={setInv} leads={leads} bankPayments={bankPayments} setBankPayments={setBankPayments} linkBankPayment={linkBankPayment}/>}
{pg==="auto"&&<AutoP autos={autos} setAutos={setAutos}/>}
{pg==="tasks"&&<TaskP tasks={tasks} setTasks={setTasks} dept={user.dept}/>}
{pg==="att"&&user.role==="admin"&&<AttP punch={punch}/>}
{pg==="leaves"&&<LeavesP user={user} leaves={leaves} updateLeave={updateLeave} onRequest={()=>setShowLeaveForm(true)}/>}
{pg==="team"&&user.role==="admin"&&<TeamP allUsers={allUsers} setAllUsers={setAllUsers}/>}
{pg==="integrations"&&user.role==="admin"&&<IntegrationsP integrations={integrations} setIntegrations={setIntegrations} leads={leads} setLeads={setLeads}/>}
</div></main>
{showLeaveForm&&<Mod title="Request Leave" onClose={()=>setShowLeaveForm(false)}><LeaveRequestForm onClose={()=>setShowLeaveForm(false)} onSubmit={(r)=>{submitLeave(r);setShowLeaveForm(false)}}/></Mod>}
</div>
)}
