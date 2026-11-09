// Vercel serverless endpoint: create one or many student accounts securely.
const USERNAME_RE=/^[a-zA-Z0-9._-]{3,32}$/;
const EMAIL_DOMAIN='students.icfeslab.app';
function reply(res,status,body){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');return res.status(status).json(body);}
async function sb(path,{key,token,method='GET',body}){
 const r=await fetch((process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, '')+path,{method,headers:{apikey:key,Authorization:'Bearer '+(token||key),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.msg||data.message||data.error_description||data.error||('Supabase '+r.status));
 return data;
}
export default async function handler(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Usa POST.'});
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY;
 const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!service)return reply(res,503,{error:'Configura SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y la clave pública en Vercel.'});
 const bearer=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!bearer)return reply(res,401,{error:'Debes iniciar sesión como docente.'});
 try{
  const auth=await fetch(url.replace(/\/$/, '')+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+bearer}});
  if(!auth.ok)return reply(res,401,{error:'La sesión no es válida o ha expirado.'});
  const actor=await auth.json();
  const profiles=await sb('/rest/v1/profiles?id=eq.'+encodeURIComponent(actor.id)+'&select=role',{key:service});
  if(!profiles[0]||!['teacher','teacher_admin'].includes(profiles[0].role))return reply(res,403,{error:'Solo un docente autorizado puede crear estudiantes.'});
  const rows=Array.isArray(req.body?.students)?req.body.students:[req.body];
  if(!rows.length||rows.length>100)return reply(res,400,{error:'Registra entre 1 y 100 estudiantes por lote.'});
  if(req.body?.school_id){const schools=await sb('/rest/v1/schools?id=eq.'+encodeURIComponent(req.body.school_id)+'&created_by=eq.'+encodeURIComponent(actor.id)+'&select=id',{key:service});if(!schools.length)return reply(res,403,{error:'El colegio seleccionado no pertenece a tu cuenta docente.'});}\n  const results=[];
  for(let i=0;i<rows.length;i++){
   const x=rows[i]||{},username=String(x.username||'').trim().toLowerCase(),password=String(x.password||''),displayName=String(x.display_name||username).trim().slice(0,120);
   if(!USERNAME_RE.test(username)){results.push({row:i+1,username,ok:false,error:'Usuario inválido: usa 3–32 letras, números, punto, guion o guion bajo.'});continue;}
   if(password.length<8||password.length>72){results.push({row:i+1,username,ok:false,error:'La contraseña debe tener entre 8 y 72 caracteres.'});continue;}
   const email=username+'@'+EMAIL_DOMAIN;
   try{
    const existing=await sb('/rest/v1/profiles?username=ilike.'+encodeURIComponent(username)+'&select=id',{key:service});
    if(existing.length){results.push({row:i+1,username,ok:false,error:'Ese usuario ya existe.'});continue;}
    const created=await sb('/auth/v1/admin/users',{key:service,method:'POST',body:{email,password,email_confirm:true,user_metadata:{display_name:displayName,username,account_type:'student'}}});
    try{
     await sb('/rest/v1/profiles',{key:service,method:'POST',body:{id:created.id,display_name:displayName,role:'student',username}});if(req.body?.school_id){await sb('/rest/v1/school_memberships',{key:service,method:'POST',body:{school_id:req.body.school_id,user_id:created.id,membership_role:'student'}})}
     results.push({row:i+1,username,display_name:displayName,ok:true});
    }catch(e){await sb('/auth/v1/admin/users/'+created.id,{key:service,method:'DELETE'}).catch(()=>{});throw e;}
   }catch(e){results.push({row:i+1,username,ok:false,error:e.message||'No se pudo crear la cuenta.'});}
  }
  return reply(res,200,{created:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results});
 }catch(e){return reply(res,500,{error:e.message||'Error interno al crear cuentas.'});}
}
