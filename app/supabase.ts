export const SUPABASE_URL="https://javdazrrcybsxffdganl.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY="sb_publishable_FhKe7C9H3M1WvNJWsaJx6w_pqTY5tsi";
export type AuthSession={access_token:string;refresh_token:string;expires_in:number;user:{email:string}};
export function supabaseAuth(path:string,body:Record<string,unknown>){return fetch(`${SUPABASE_URL}/auth/v1/${path}`,{method:"POST",headers:{apikey:SUPABASE_PUBLISHABLE_KEY,"content-type":"application/json"},body:JSON.stringify(body)})}
