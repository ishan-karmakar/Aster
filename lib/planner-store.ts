import { getD1 } from "@/db/runtime";
import { defaultPlannerState,normalizePlannerState,type PlannerState } from "@/lib/planner";
const local=new Map<string,PlannerState>();
async function ensure(db:D1Database){await db.prepare("CREATE TABLE IF NOT EXISTS planner_state (user_email TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()))").run()}
export async function readPlannerState(email:string){const db=await getD1();if(!db)return normalizePlannerState(local.get(email)||defaultPlannerState());await ensure(db);const row=await db.prepare("SELECT state FROM planner_state WHERE user_email=?").bind(email).first<{state:string}>();return row?normalizePlannerState(JSON.parse(row.state) as PlannerState):defaultPlannerState()}
export async function writePlannerState(email:string,state:PlannerState){const db=await getD1();if(!db){local.set(email,state);return}await ensure(db);await db.prepare("INSERT INTO planner_state (user_email,state) VALUES (?,?) ON CONFLICT(user_email) DO UPDATE SET state=excluded.state,updated_at=unixepoch()").bind(email,JSON.stringify(state)).run()}
