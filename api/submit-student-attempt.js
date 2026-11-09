// Secure scoring endpoint for completed student attempts on Vercel.
function reply(res,status,body){res.setHeader('Cache-Control','no-store');return res.status(status).json(body);}
async function request(path,key,method='GET',body){const r=await fetch(process.env.SUPABASE_URL.replace(/\/$/, '')+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.msg||d.error||'Error de Supabase '+r.status);return d;}
export default async function handler(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Usa POST.'});
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!service)return reply(res,503,{error:'Falta configurar la conexión segura de Supabase en Vercel.'});
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return reply(res,401,{error:'Inicia sesión.'});
 try{
  const auth=await fetch(url.replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+token}});
  if(!auth.ok)return reply(res,401,{error:'La sesión expiró.'});const user=await auth.json();
  const p=await request('/rest/v1/profiles?id=eq.'+user.id+'&select=role',service);
  if(!p[0]||p[0].role!=='student')return reply(res,403,{error:'Solo las cuentas estudiantiles pueden entregar intentos.'});
  const id=String(req.body?.attempt_id||''),answers=req.body?.answers;
  if(!/^[0-9a-f-]{36}$/i.test(id)||!answers||typeof answers!=='object'||Array.isArray(answers))return reply(res,400,{error:'Datos de entrega inválidos.'});
  const attempts=await request('/rest/v1/exam_attempts?id=eq.'+id+'&student_id=eq.'+user.id+'&select=id,exam_id,completed_at',service);
  if(!attempts[0])return reply(res,404,{error:'No se encontró el intento de este estudiante.'});
  if(attempts[0].completed_at)return reply(res,409,{error:'Esta prueba ya fue entregada.'});
  const qs=await request('/rest/v1/questions?exam_id=eq.'+attempts[0].exam_id+'&status=eq.published&select=id,part,question,options,correct_index,explanation,difficulty&order=part',service);
  if(!qs.length)return reply(res,422,{error:'La prueba no contiene preguntas publicadas.'});
  let correct=0;const detail=qs.map((q,i)=>{const selected=Number.isInteger(answers[q.id])?answers[q.id]:null;const ok=selected===q.correct_index;if(ok)correct++;return {number:i+1,question_id:q.id,part:q.part,question:q.question,options:q.options,selected,correct_index:q.correct_index,correct:ok,explanation:q.explanation||'Revisa el concepto y vuelve a practicar.',difficulty:q.difficulty||'medium'};});
  const score=Math.round(correct/qs.length*10000)/100;
  const byPart=Array.from({length:7},(_,i)=>{const items=detail.filter(x=>x.part===i+1),hits=items.filter(x=>x.correct).length;return {part:i+1,total:items.length,correct:hits,incorrect:items.length-hits,accuracy:items.length?Math.round(hits/items.length*100):null};});
  const result_detail={total:qs.length,answered:detail.filter(x=>x.selected!==null).length,correct,incorrect:qs.length-correct,score,by_part:byPart,questions:detail,submitted_at:new Date().toISOString()};
  const saved=await request('/rest/v1/exam_attempts?id=eq.'+id+'&student_id=eq.'+user.id,service,'PATCH',{answers,score,completed_at:new Date().toISOString(),result_detail});
  return reply(res,200,{score,result_detail,attempt:saved[0]||null});
 }catch(e){return reply(res,500,{error:e.message||'No se pudo calificar la prueba.'});}
}
