const encoder=new TextEncoder(),decoder=new TextDecoder();
async function key(secret:string){return crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",encoder.encode(secret)),"AES-GCM",false,["encrypt","decrypt"])}
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(value:string)=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));
export async function encryptToken(value:string,secret:string){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(secret),encoder.encode(value));return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`}
export async function decryptToken(value:string,secret:string){const [iv,payload]=value.split(".");const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv)},await key(secret),decode(payload));return decoder.decode(decrypted)}
