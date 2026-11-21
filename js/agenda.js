'use strict';
const $=id=>document.getElementById(id);
const iso=d=>d.toISOString().slice(0,10);
const date=s=>new Date(s+'T12:00:00Z');
const make=(y,m,d)=>new Date(Date.UTC(y,m,d,12));
const parts=s=>s.split('-').map(Number);
const add=(s,n)=>iso(new Date(date(s).getTime()+n*86400000));
const delta=(s,start)=>Math.round((date(s)-date(start))/86400000);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Costa_Rica'}).format(new Date());
const money=n=>n==null?'Monto pendiente':new Intl.NumberFormat('es-CR',{style:'currency',currency:'CRC'}).format(n);
const format=s=>new Intl.DateTimeFormat('es-CR',{dateStyle:'long',timeZone:'UTC'}).format(date(s));
const formData=form=>Object.fromEntries(new FormData(form));
const uid=()=>crypto.randomUUID();
let state=null,revision=0,busy=false,chosen=today(),view=chosen.slice(0,7),absenceId=null;
let hidden={};try{hidden=JSON.parse(localStorage.getItem('agenda-layers'))||{}}catch{}
const layers={A:'Equipo A',B:'Equipo B',regular:'Mi jornada',free:'Mis libres',payments:'Por pagar',paydays:'Quincenas',courses:'Cursos',holidays:'Feriados',vacations:'Vacaciones',medical:'Incapacidades'};
const absenceNames={pending:'Vacaciones · tipo por definir',ordinary:'Vacaciones ordinarias',prophylactic:'Vacaciones profilácticas',medical:'Incapacidad'};
const modules=[
['2026-11-07','2026-12-05','Derecho Tributario Costarricense'],
['2027-01-09','2027-02-06','IVA'],
['2027-02-20','2027-03-20','Impuestos a las Utilidades'],
['2027-04-03','2027-05-08','Otras Cédulas de Renta'],
['2027-05-22','2027-06-19','Normativa Contable'],
['2027-07-03','2027-07-31','Regímenes Especiales'],
['2027-08-21','2027-09-11','Impuestos Aduaneros'],
['2027-09-25','2027-10-23','Fiscalización Tributaria']];
const recessEnds=['2027-01-08','2027-02-13','2027-03-27','2027-05-15','2027-06-26','2027-08-07','2027-09-18'];
function initial(){
 return {version:1,cycles:[],dayEdits:{},courseEdits:{},paid:{},absences:[{id:'vacaciones-octubre-2026',type:'pending',start:'2026-10-06',end:'2026-10-28',notes:''}],bills:[
 ...[['cnfl','CNFL',15],['chatgpt','ChatGPT',15],['apps','Pagos de apps',26],['full-claro','Full Claro',28]].map(([id,name,day])=>({id:'preset-'+id,name,start:'2026-11-'+day,amount:null,repeat:'1'})),
 ...recessEnds.map((start,i)=>({id:'epi-modulo-'+(i+2),name:'PEC-EAN · '+modules[i+1][2],start,amount:110000,repeat:'0',projected:true,coursePayment:true}))
 ]};
}
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function button(text,fn){const n=node('button',text);n.type='button';n.onclick=fn;return n}
function notice(text){$('status').textContent=text}
function setBusy(value){busy=value;document.querySelectorAll('button').forEach(b=>b.disabled=value)}
function requireState(){if(!state)throw Error('Primero ingresa y carga la agenda.')}
function validDate(s){return typeof s==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)&&!isNaN(date(s))&&iso(date(s))===s}
function validTime(s){return typeof s==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s)}
function validBackup(x){
 if(!x||x.version!==1||!Array.isArray(x.cycles)||!Array.isArray(x.bills)||!x.paid||typeof x.paid!=='object'||Array.isArray(x.paid))return false;
 if(!x.cycles.every(c=>c&&validDate(c.start)&&Number.isInteger(c.work)&&c.work>0&&c.work<=365&&Number.isInteger(c.rest)&&c.rest>0&&c.rest<=365&&validTime(c.from)&&validTime(c.to)&&c.from!==c.to&&(!c.mode||['regular','split'].includes(c.mode))&&(c.mode!=='split'||(c.work===6&&validTime(c.aFrom)&&validTime(c.aTo)&&c.aFrom!==c.aTo))))return false;
 if(!x.bills.every(b=>b&&typeof b.id==='string'&&/^[A-Za-z0-9_.-]+$/.test(b.id)&&typeof b.name==='string'&&b.name.trim()&&validDate(b.start)&&(!b.end||validDate(b.end))&&(b.amount===null||(Number.isFinite(b.amount)&&b.amount>0))&&['0','1','3','12','7d'].includes(b.repeat)))return false;
 if(new Set(x.bills.map(b=>b.id)).size!==x.bills.length)return false;
 for(const [id,d] of Object.entries(x.paid)){const a=id.split('@');if(a.length!==2||!validDate(a[1])||!validDate(d)||!x.bills.some(b=>b.id===a[0]))return false;}
 if(x.absences!==undefined&&(!Array.isArray(x.absences)||!x.absences.every(a=>a&&typeof a.id==='string'&&Object.hasOwn(absenceNames,a.type)&&validDate(a.start)&&validDate(a.end)&&a.start<=a.end&&typeof a.notes==='string')))return false;
 for(const key of ['dayEdits','courseEdits']){
 if(x[key]===undefined)continue;
 if(!x[key]||typeof x[key]!=='object'||Array.isArray(x[key]))return false;
 for(const [d,e] of Object.entries(x[key])){
 if(!validDate(d)||!e||typeof e!=='object')return false;
 if(key==='dayEdits'&&(!['','work','free'].includes(e.work)||!['','A','B','none'].includes(e.team)||(e.work==='work'&&(!validTime(e.from)||!validTime(e.to)||e.from===e.to))))return false;
 if(key==='courseEdits'&&(e.mode!=='cancel'&&(e.mode!=='custom'||typeof e.title!=='string'||!e.title.trim()||!validTime(e.from)||!validTime(e.to)||e.from>=e.to)))return false;
 }
 }
 const p=x.paydays;
 return !p||(validDate(p.start)&&Number.isInteger(p.first)&&p.first>=1&&Number.isInteger(p.second)&&p.second>p.first&&p.second<=31&&Number.isFinite(p.amount)&&p.amount>=0);
}
async function load(){
 if(busy)return;setBusy(true);
 try{
 const result=await API.request('leerAgenda');
 if(result.data&&!validBackup(result.data))throw Error('La agenda guardada tiene un formato incompatible. Conserva tu respaldo.');
 state=result.data||initial();revision=result.revision;
 state.cycles.sort((a,b)=>a.start.localeCompare(b.start));
 render();fillSettings();$('login').hidden=true;
 notice(result.data?'Agenda cargada desde Sheets.':'Conexión lista. Puedes importar tu respaldo o guardar la agenda inicial.');
 }catch(e){notice(e.message);$('login').hidden=false;}finally{setBusy(false)}
}
async function commit(next,message){
 if(busy)return false;
 requireState();if(!validBackup(next))throw Error('Revisa los datos ingresados.');
 // Copia de recuperación antes de enviar, sin usarla como fuente compartida.
 try{localStorage.setItem('agenda-pending-backup',JSON.stringify(next))}catch{}
 setBusy(true);const operation=uid();
 try{
 const result=await API.request('guardarAgenda',{data:next,revision,operation});
 state=next;revision=result.revision;localStorage.removeItem('agenda-pending-backup');
 render();notice(message+' Guardado en Sheets.');return true;
 }catch(e){notice(e.message+' El cambio no se confirmó. Descarga el respaldo local antes de actualizar.');return false}
 finally{setBusy(false)}
}
function absenceOn(s){return (state.absences||[]).filter(a=>s>=a.start&&s<=a.end)}
function shiftOn(s){
 const e=state.dayEdits?.[s];
 if(e?.work==='free')return {working:false,layer:'free'};
 if(e?.work==='work')return {...e,working:true,layer:'regular'};
 const c=state.cycles.filter(c=>c.start<=s).at(-1);if(!c)return null;
 const position=delta(s,c.start)%(c.work+c.rest),working=position<c.work;
 return {...c,working,layer:working?'regular':'free',from:c.mode==='split'&&position>=3&&working?c.aFrom:c.from,to:c.mode==='split'&&position>=3&&working?c.aTo:c.to};
}
function teamOn(s){const e=state.dayEdits?.[s]?.team;if(e)return e==='none'?null:e;return ((delta(s,'2026-11-08')%12)+12)%12<6?'B':'A'}
const holidays={'01-01':'Año Nuevo','04-11':'Juan Santamaría','05-01':'Día del Trabajo','07-25':'Anexión del Partido de Nicoya','08-02':'Virgen de los Ángeles','08-15':'Día de la Madre','08-31':'Persona Negra y Cultura Afrocostarricense','09-15':'Independencia','12-01':'Abolición del Ejército','12-25':'Navidad'};
function holidayOn(s){
 if(holidays[s.slice(5)])return holidays[s.slice(5)];
 const y=Number(s.slice(0,4)),a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,l=(32+2*e+2*Math.floor(c/4)-h-c%4)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
 const easter=iso(make(y,Math.floor(n/31)-1,n%31+1));
 return s===add(easter,-3)?'Jueves Santo':s===add(easter,-2)?'Viernes Santo':null;
}
function courseOn(s){
 const edit=state.courseEdits?.[s];if(edit)return edit.mode==='cancel'?null:edit;
 if(date(s).getUTCDay()!==6||holidayOn(s))return null;
 const m=modules.find(([start,end])=>s>=start&&s<=end);
 return m?{title:m[2],from:'08:00',to:'13:00'}:null;
}
function isPayday(s,p=state.paydays){if(!p||s<p.start)return false;const [y,m,d]=parts(s),last=make(y,m,0).getUTCDate();return [p.first,p.second].some(n=>Math.min(n,last)===d)}
function coursePlan(b){
 const index=Number(b.id.split('-').at(-1))-2;
 const end=recessEnds[index]||b.start,start=add(end,index===0?-5:-6);
 const p=state.paydays||{first:15,second:31,start:'2026-01-01'};
 for(let i=0;i<40;i++){const s=add(end,-i);if(isPayday(s,p))return {date:s>=start?s:end,funding:s,start,end}}
 return {date:end,start,end};
}
function billsOn(s){
 return state.bills.flatMap(b=>{
 if(b.coursePayment){
 const plan=coursePlan(b),existing=Object.keys(state.paid).find(k=>k.startsWith(b.id+'@'));
 const due=existing?existing.split('@')[1]:plan.date;
 return s===due?[{...b,plan,date:s,key:b.id+'@'+s}]:[];
 }
 if(s<b.start||(b.end&&s>=b.end))return [];
 const [y,m,d]=parts(s),[by,bm,bd]=parts(b.start);
 const due=b.repeat==='0'?s===b.start:b.repeat==='7d'?delta(s,b.start)%7===0:((y-by)*12+m-bm)%Number(b.repeat)===0&&d===Math.min(bd,make(y,m,0).getUTCDate());
 return due?[{...b,date:s,key:b.id+'@'+s}]:[];
 });
}
function paid(b){return Object.hasOwn(state.paid,b.key)}
function fillForm(id,data){const f=$(id);f.reset();for(const [k,v] of Object.entries(data||{}))if(f.elements.namedItem(k))f.elements.namedItem(k).value=v??''}
function fillSettings(){
 fillForm('cycle',state.cycles.at(-1)||{start:today(),work:6});
 fillForm('paydays',state.paydays||{first:15,second:31,start:today()});
 $('bill').elements.start.value=today();
 if(!absenceId)fillForm('absence',{start:chosen,end:chosen});
}
function render(){
 if(!state)return;
 const [y,m]=parts(view);$('month').textContent=new Intl.DateTimeFormat('es-CR',{year:'numeric',month:'long',timeZone:'UTC'}).format(make(y,m-1,1));
 $('layers').replaceChildren();
 for(const [id,label] of Object.entries(layers)){
 const b=button(label,()=>{hidden[id]=!hidden[id];localStorage.setItem('agenda-layers',JSON.stringify(hidden));render()});b.setAttribute('aria-pressed',String(!hidden[id]));$('layers').append(b);
 }
 $('week').replaceChildren(...['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(x=>node('small',x)));
 const grid=$('calendar');grid.replaceChildren();
 for(let i=0;i<(make(y,m-1,1).getUTCDay()+6)%7;i++)grid.append(node('span'));
 for(let d=1;d<=make(y,m,0).getUTCDate();d++){
 const s=iso(make(y,m-1,d)),c=button('',()=>{chosen=s;render()});c.className='day';c.setAttribute('aria-pressed',String(s===chosen));c.append(node('strong',d));
 const tag=(text,layer)=>{if(!hidden[layer])c.append(node('span',text,'tag '+layer))};
 const t=teamOn(s),shift=shiftOn(s),absences=absenceOn(s);
 if(t)tag('Equipo '+t,t);
 if(shift&&!absences.length)tag(shift.working?'Trabajo':'Libre',shift.layer);
 absences.forEach(a=>tag(a.type==='medical'?'Incapacidad':'Vacaciones',a.type==='medical'?'medical':'vacations'));
 if(holidayOn(s))tag('Feriado','holidays');
 if(courseOn(s))tag('Clase','courses');
 if(isPayday(s))tag('Quincena','paydays');
 billsOn(s).forEach(b=>tag((paid(b)?'✓ ':'')+b.name,'payments'));
 grid.append(c);
 }
 $('chosen').textContent=format(chosen);const detail=$('detail');detail.replaceChildren();
 const shift=shiftOn(chosen),absences=absenceOn(chosen),team=teamOn(chosen);
 if(team&&!hidden[team])detail.append(node('p','Equipo '+team+' de servicio'));
 if(shift&&!hidden[shift.layer])detail.append(node('p',absences.length?'Turno previsto en el ciclo':shift.working?'Mi jornada · '+shift.from+' a '+shift.to+(shift.to<shift.from?' del día siguiente':''):'Mi día libre'));
 if(!shift)detail.append(node('small','Configura tu jornada o importa tu respaldo.'));
 absences.forEach(a=>{if(!hidden[a.type==='medical'?'medical':'vacations'])detail.append(node('p',absenceNames[a.type]+(a.notes?' · '+a.notes:'')))});
 const holiday=holidayOn(chosen),course=courseOn(chosen);
 if(holiday&&!hidden.holidays)detail.append(node('p',holiday));
 if(course&&!hidden.courses)detail.append(node('p',course.title+' · '+course.from+' a '+course.to));
 if(isPayday(chosen)&&!hidden.paydays)detail.append(node('p','Quincena recibida programada · '+money(state.paydays.amount||null)));
 if(!hidden.payments)for(const b of billsOn(chosen)){
 const row=node('div',null,'item');row.append(node('strong',b.name+' · '+money(b.amount)),node('p',paid(b)?'Pagado':chosen<today()?'Vencido':'Pendiente'));
 if(b.plan)row.append(node('small','Proyección · receso '+b.plan.start+' al '+b.plan.end+(b.plan.funding?' · Apartar de quincena '+b.plan.funding:'')));
 row.append(button(paid(b)?'Desmarcar pago':'Marcar pagado',async()=>{const payments={...state.paid};if(paid(b))delete payments[b.key];else payments[b.key]=today();await commit({...state,paid:payments},'Pago actualizado.')}));detail.append(row);
 }
 fillForm('day',state.dayEdits?.[chosen]);fillForm('course',state.courseEdits?.[chosen]);
 const list=$('absenceList');list.replaceChildren();
 for(const a of state.absences||[]){
 const row=node('div',null,'item');row.append(node('strong',absenceNames[a.type]),node('p',a.start+' al '+a.end),node('p',a.notes));
 row.append(button('Editar',()=>{absenceId=a.id;fillForm('absence',a)}),button('Eliminar',async()=>{if(confirm('¿Eliminar este período?')){await commit({...state,absences:state.absences.filter(x=>x.id!==a.id)},'Período eliminado.');absenceId=null}}));list.append(row);
 }
 const bills=$('billList');bills.replaceChildren();
 for(const b of state.bills){
 const row=node('div',null,'item');row.append(node('span',b.name+' · '+money(b.amount)));
 row.append(button('Editar',async()=>{
 const name=prompt('Concepto',b.name);if(name===null)return;
 const text=prompt('Monto en colones sin separadores de miles. Vacío = pendiente',b.amount??'');if(text===null)return;
 const amount=text.trim()?Number(text.replace(',','.')):null;
 let start=b.start;if(!b.coursePayment){start=prompt('Primer vencimiento AAAA-MM-DD',b.start);if(start===null)return;}
 await commit({...state,bills:state.bills.map(x=>x.id===b.id?{...x,name:name.trim(),amount,start}:x)},'Obligación actualizada.');
 }),button('Eliminar',async()=>{if(!confirm('¿Eliminar la obligación y sus marcas de pago?'))return;const payments=Object.fromEntries(Object.entries(state.paid).filter(([key])=>!key.startsWith(b.id+'@')));await commit({...state,bills:state.bills.filter(x=>x.id!==b.id),paid:payments},'Obligación eliminada.')}));bills.append(row);
 }
}
function handleForm(id,fn){$(id).onsubmit=async e=>{e.preventDefault();try{requireState();await fn(formData(e.currentTarget))}catch(error){notice(error.message)}}}
$('login').onsubmit=async e=>{
 e.preventDefault();if(busy)return;setBusy(true);
 try{const result=await API.validarAcceso($('password').value);if(!result.autorizado||!result.token)throw Error('Acceso incorrecto o backend pendiente de actualizar.');sessionStorage.setItem('presupuesto_token',result.token);$('password').value='';}catch(error){notice(error.message);setBusy(false);return}
 setBusy(false);await load();
};
$('initialize').onclick=async()=>{if(!state)return notice('Primero conecta la agenda.');try{await commit(state,'Agenda guardada.')}catch(e){notice(e.message)}};
$('refresh').onclick=load;
$('logout').onclick=async()=>{try{await API.request('cerrarSesion')}catch{}sessionStorage.removeItem('presupuesto_token');sessionStorage.removeItem('presupuesto_access');state=null;$('calendar').replaceChildren();$('detail').replaceChildren();$('billList').replaceChildren();$('absenceList').replaceChildren();document.querySelectorAll('form').forEach(f=>f.reset());$('login').hidden=false;notice('Sesión cerrada.');};
function navigate(n){const [y,m]=parts(view);view=iso(make(y,m-1+n,1)).slice(0,7);render()}
$('prev').onclick=()=>navigate(-1);$('next').onclick=()=>navigate(1);$('today').onclick=()=>{chosen=today();view=chosen.slice(0,7);render()};
handleForm('cycle',async c=>{
 c.work=Number(c.work);c.rest=Number(c.rest);
 if(state.cycles.some(x=>x.start===c.start)&&!confirm('¿Actualizar el ciclo que empieza en esta fecha?'))return;
 await commit({...state,cycles:[...state.cycles.filter(x=>x.start!==c.start),c].sort((a,b)=>a.start.localeCompare(b.start))},'Ciclo guardado.');
});
handleForm('day',async e=>{const edits={...state.dayEdits,[chosen]:e};if(!e.work&&!e.team)delete edits[chosen];await commit({...state,dayEdits:edits},'Día actualizado.')});
$('resetDay').onclick=async()=>{if(!state)return;const edits={...state.dayEdits};delete edits[chosen];await commit({...state,dayEdits:edits},'Día restaurado.')};
handleForm('bill',async b=>{b.amount=b.amount?Number(b.amount):null;b.id=uid();await commit({...state,bills:[...state.bills,b]},'Obligación agregada.')});
handleForm('paydays',async p=>{p.first=Number(p.first);p.second=Number(p.second);p.amount=Number(p.amount);await commit({...state,paydays:p},'Quincenas guardadas.')});
handleForm('absence',async a=>{
 a.id=absenceId||uid();
 if(a.start>a.end)throw Error('Revisa las fechas.');
 if((state.absences||[]).some(x=>x.id!==a.id&&x.start<=a.end&&x.end>=a.start))throw Error('El período coincide con otra ausencia.');
 if(await commit({...state,absences:[...(state.absences||[]).filter(x=>x.id!==a.id),a]},'Ausencia guardada.')){absenceId=null;fillForm('absence',{start:chosen,end:chosen})}
});
$('newAbsence').onclick=()=>{absenceId=null;fillForm('absence',{start:chosen,end:chosen})};
handleForm('course',async c=>{const edits={...state.courseEdits};if(c.mode)edits[chosen]=c;else delete edits[chosen];await commit({...state,courseEdits:edits},'Clase guardada.')});
$('backup').onclick=()=>{
 let data=state;const pending=localStorage.getItem('agenda-pending-backup');
 if(pending&&confirm('Hay un cambio sin confirmar. ¿Descargar esa copia local para recuperarlo?'))data=JSON.parse(pending);
 if(!data)return notice('Primero carga la agenda.');
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='respaldo-agenda-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('import').onclick=()=>{if(!state)return notice('Primero conecta la agenda.');$('file').click()};
$('file').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 try{const data=JSON.parse(await file.text());if(!validBackup(data))throw Error('Respaldo incompatible.');if(confirm('¿Reemplazar la agenda compartida con este respaldo? Descarga antes una copia de los datos actuales.')){if(await commit(data,'Respaldo importado.'))fillSettings()}}catch(error){notice(error.message)}
};
if(sessionStorage.getItem('presupuesto_token'))load();
