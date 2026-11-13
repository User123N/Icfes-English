// Student-only AI English tutor for Vercel.
function reply(res,status,body){res.setHeader('Cache-Control','no-store');return res.status(status).json(body);}
export default async function handler(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Usa POST.'});
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),key=process.env.AI_PROVIDER_API_KEY;
 if(!url||!anon||!service)return reply(res,503,{error:'Falta configurar Supabase en Vercel.'});
 if(!key)return reply(res,503,{error:'El tutor IA todavía no está habilitado: configura AI_PROVIDER_API_KEY en Vercel.'});
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return reply(res,401,{error:'Inicia sesión.'});
 const question=String(req.body?.message||'').trim();if(!question||question.length>2500)return reply(res,400,{error:'Escribe una pregunta de máximo 2.500 caracteres.'});
 try{
  const auth=await fetch(url.replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+token}});if(!auth.ok)return reply(res,401,{error:'La sesión expiró.'});
  const user=await auth.json();const pr=await fetch(url.replace(/\/$/,'')+'/rest/v1/profiles?id=eq.'+user.id+'&select=role,display_name',{headers:{apikey:service,Authorization:'Bearer '+service}});const rows=await pr.json();
  if(!Array.isArray(rows)||rows[0]?.role!=='student')return reply(res,403,{error:'El tutor está disponible únicamente para estudiantes.'});
  const endpoint=(process.env.AI_API_URL||'https://api.openai.com/v1/chat/completions').replace(/\/$/,'');
  const completion=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.AI_MODEL||'gpt-4o-mini',temperature:0.35,max_tokens:900,messages:[{role:'system',content:'Eres un tutor pedagógico de inglés para estudiantes de secundaria que se preparan para Saber 11 en Colombia. Responde en español claro, explica el inglés con ejemplos sencillos, identifica la estrategia para resolver preguntas tipo ICFES, no inventes que una predicción es un puntaje oficial. Si el estudiante pide ejercicios, crea hasta 5 preguntas originales con cuatro opciones y explica las respuestas después de que intente resolverlas. Sé alentador y concreto.'},{role:'user',content:question}]})});
  const data=await completion.json().catch(()=>({}));if(!completion.ok)return reply(res,502,{error:data.error?.message||'El proveedor de IA no pudo responder. Revisa AI_PROVIDER_API_KEY y AI_MODEL.'});
  return reply(res,200,{answer:data.choices?.[0]?.message?.content||'No se recibió una respuesta.'});
 }catch(e){return reply(res,500,{error:e.message||'No se pudo conectar con el tutor.'});}
}
