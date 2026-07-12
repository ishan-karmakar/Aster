"use client";
import { FormEvent,useEffect,useState } from "react";
import type { Commitment,PlannerState } from "@/lib/planner";

const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export function ScheduleSettings({token}:{token:string}){
 const [state,setState]=useState<PlannerState|null>(null),[message,setMessage]=useState("");
 useEffect(()=>{void fetch("/api/planner",{headers:{authorization:`Bearer ${token}`}}).then(r=>r.json()).then(data=>setState(data.state))},[token]);
 async function persist(next:PlannerState,text:string){const response=await fetch("/api/planner",{method:"PUT",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify(next)}),body=await response.json();setState(body.state);setMessage(text)}
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!state)return;const data=new FormData(event.currentTarget),availability=[0,1,2,3,4,5,6].filter(day=>data.get(`enabled-${day}`)==="on").map(day=>({day,start:String(data.get(`start-${day}`)),end:String(data.get(`end-${day}`))})),next={...state,preferences:{...state.preferences,timezone:String(data.get("timezone")),sessionMinutes:Number(data.get("sessionMinutes")),maxDailyMinutes:Number(data.get("maxDailyMinutes")),availability}};await persist(next,"Schedule preferences saved.")}
 async function addCommitment(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!state)return;const form=event.currentTarget,data=new FormData(form),commitment:Commitment={id:crypto.randomUUID(),title:String(data.get("title")),day:Number(data.get("day")),start:String(data.get("start")),end:String(data.get("end"))};await persist({...state,preferences:{...state.preferences,commitments:[...state.preferences.commitments,commitment]}},"Commitment added.");form.reset()}
 async function removeCommitment(id:string){if(state)await persist({...state,preferences:{...state.preferences,commitments:state.preferences.commitments.filter(item=>item.id!==id)}},"Commitment removed.")}
 if(!state)return <div className="settings-card">Loading schedule…</div>;
 return <div className="settings-card">
  <form className="term-form" onSubmit={save}>
   <div className="settings-card-head"><span className="settings-class-icon">◷</span><div><h2>Weekly availability</h2><p>Aster schedules only inside enabled windows.</p></div></div>
   <div className="form-pair"><label>Timezone<input name="timezone" defaultValue={state.preferences.timezone}/></label><label>Session length<select name="sessionMinutes" defaultValue={state.preferences.sessionMinutes}><option value="25">25 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label></div>
   <label>Maximum study minutes per day<input name="maxDailyMinutes" type="number" min="30" step="15" defaultValue={state.preferences.maxDailyMinutes}/></label>
   <div className="schedule-grid">{days.map((label,day)=>{const window=state.preferences.availability.find(item=>item.day===day);return <div className="schedule-day" key={label}><strong>{label}</strong><input aria-label={`Enable ${label}`} name={`enabled-${day}`} type="checkbox" defaultChecked={Boolean(window)}/><input name={`start-${day}`} type="time" defaultValue={window?.start||"16:00"}/><input name={`end-${day}`} type="time" defaultValue={window?.end||"20:00"}/></div>})}</div>
   <button className="bright-button">Save schedule</button>
  </form>
  <form className="term-form" onSubmit={addCommitment}><h3>Recurring commitments</h3><div className="form-pair"><label>Name<input name="title" placeholder="Soccer practice" required/></label><label>Day<select name="day">{days.map((day,index)=><option value={index} key={day}>{day}</option>)}</select></label></div><div className="form-pair"><label>Starts<input name="start" type="time" required/></label><label>Ends<input name="end" type="time" required/></label></div><button className="bright-button">Add commitment</button></form>
  <div className="class-preview class-actions">{state.preferences.commitments.map(item=><button type="button" key={item.id} onClick={()=>void removeCommitment(item.id)}>{item.title} · {days[item.day]} {item.start}<span>×</span></button>)}</div>{message&&<p className="settings-message">{message}</p>}
 </div>
}

export function IntegrationSettings({token}:{token:string}){
 const [status,setStatus]=useState<{configured:boolean;connected:boolean;email?:string}|null>(null),[message,setMessage]=useState("");
 useEffect(()=>{void fetch("/api/calendar/google",{headers:{authorization:`Bearer ${token}`}}).then(r=>r.json()).then(setStatus)},[token]);
 async function connect(){const response=await fetch("/api/calendar/google",{method:"POST",headers:{authorization:`Bearer ${token}`}}),data=await response.json();if(!response.ok){setMessage(data.error||"Connection could not start.");return}window.location.assign(data.url)}
 async function disconnect(){await fetch("/api/calendar/google",{method:"DELETE",headers:{authorization:`Bearer ${token}`}});setStatus(current=>current?{...current,connected:false}:current)}
 async function sync(){setMessage("Syncing…");const response=await fetch("/api/calendar/google/sync",{method:"POST",headers:{authorization:`Bearer ${token}`}}),data=await response.json();setMessage(response.ok?`Synced ${data.sessions} study sessions and ${data.busy} busy events.`:data.error||"Sync failed.")}
 return <div className="settings-card"><div className="settings-card-head"><span className="settings-class-icon">G</span><div><h2>Calendar integrations</h2><p>Busy events protect study time from conflicts.</p></div></div><div className="integration-card"><strong>Google Calendar</strong><div><h3>{status?.connected?"Connected":status?.configured?"Ready to connect":"Configuration required"}</h3><p>{status?.connected?status.email:"Creates a dedicated Aster study calendar with two-way sync."}</p></div>{status?.connected?<><button className="bright-button" onClick={()=>void sync()}>Sync now</button><button className="ghost-button" onClick={()=>void disconnect()}>Disconnect</button></>:<button className="bright-button" onClick={()=>void connect()}>Connect</button>}</div>{!status?.configured&&<p className="settings-message">Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and TOKEN_ENCRYPTION_KEY to enable connection.</p>}{message&&<p className="settings-message">{message}</p>}</div>
}
