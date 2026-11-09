import {useEffect,useState,useCallback} from 'react'
import {supabase,tempClient} from './supabase'
import * as XLSX from 'xlsx'

const TYPES={extract:'مستخلص',material_in:'شراء خامات',material_out:'استهلاك خامات',labor:'يومية عمال',expense:'مصروف',income:'استلام فلوس',cheque_in:'شيك مستلم',cheque_out:'شيك صادر'}
const TABS=[['summary','الملخص'],['all','الكل'],['income','المقبوضات'],['extract','المستخلصات'],['material','الخامات'],['labor','العمال'],['expense','المصروفات'],['cheque','الشيكات']]
const PERMS={view:'عرض المشاريع',create_project:'إنشاء مشروع',add:'تسجيل بيانات',delete:'حذف بيانات'}
const money=n=>Number(n||0).toLocaleString('ar-EG')+' ج.م'
const when=d=>new Date(d).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'})
const SPENT=['material_in','labor','expense']

export default function App(){
  const [session,setSession]=useState(undefined),[me,setMe]=useState(null),[view,setView]=useState({page:'projects'})
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:l}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(session)supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data})=>setMe(data));else setMe(null)},[session])
  if(session===undefined)return null
  if(!session)return <Login/>
  if(!me)return <div className="center">...</div>
  const can=p=>me.role==='admin'||me.perms?.includes(p)
  return <div className="shell">
    <header><div className="brand"><span>◆</span> إدارة المقاولات</div>
      <nav><button onClick={()=>setView({page:'projects'})}>المشاريع</button>
      <button onClick={()=>setView({page:'quotes'})}>عروض الأسعار</button>
      {me.role==='admin'&&<button onClick={()=>setView({page:'users'})}>المستخدمين</button>}</nav>
      <div className="who">{me.full_name}<button className="ghost" onClick={()=>supabase.auth.signOut()}>خروج</button></div></header>
    <main>{view.page==='projects'&&<Projects can={can} open={id=>setView({page:'project',id})}/>}
      {view.page==='project'&&<Project id={view.id} can={can} back={()=>setView({page:'projects'})}/>}
      {view.page==='users'&&<Users/>}{view.page==='quotes'&&<Quotes can={can}/>}</main></div>
}

function Login(){
  const [email,setE]=useState(''),[pw,setP]=useState(''),[name,setN]=useState(''),[signup,setS]=useState(false),[err,setErr]=useState('')
  const go=async e=>{e.preventDefault();setErr('')
    const r=signup?await supabase.auth.signUp({email,password:pw,options:{data:{full_name:name}}}):await supabase.auth.signInWithPassword({email,password:pw})
    if(r.error)setErr(r.error.message)}
  return <div className="center"><form className="card login" onSubmit={go}>
    <div className="brand big"><span>◆</span> إدارة المقاولات</div>
    {signup&&<input placeholder="الاسم" value={name} onChange={e=>setN(e.target.value)} required/>}
    <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e=>setE(e.target.value)} required/>
    <input type="password" placeholder="كلمة المرور" value={pw} onChange={e=>setP(e.target.value)} required minLength={6}/>
    {err&&<p className="err">{err}</p>}
    <button className="gold">{signup?'إنشاء حساب':'دخول'}</button>
    <a onClick={()=>setS(!signup)}>{signup?'عندي حساب':'حساب جديد (أول حساب = أدمن)'}</a></form></div>
}

function Projects({can,open}){
  const [list,setList]=useState([]),[f,setF]=useState(null)
  const load=useCallback(async()=>{const {data}=await supabase.from('projects').select('*').order('created_at',{ascending:false});setList(data||[])},[])
  useEffect(()=>{load()},[load])
  const save=async e=>{e.preventDefault();const {error}=await supabase.from('projects').insert(f);if(error)alert(error.message);else{setF(null);load()}}
  return <>
    <div className="bar"><h2>المشاريع</h2>{can('create_project')&&<button className="gold" onClick={()=>setF({name:'',client:'',location:'',work_type:'',contract_value:0})}>+ إنشاء مشروع</button>}</div>
    {f&&<form className="card grid" onSubmit={save}>
      <input placeholder="اسم المشروع" value={f.name} onChange={e=>setF({...f,name:e.target.value})} required/>
      <input placeholder="العميل" value={f.client} onChange={e=>setF({...f,client:e.target.value})}/>
      <input placeholder="الموقع" value={f.location} onChange={e=>setF({...f,location:e.target.value})}/>
      <input placeholder="نوعية العمل" value={f.work_type} onChange={e=>setF({...f,work_type:e.target.value})}/>
      <input type="number" placeholder="قيمة العقد" value={f.contract_value} onChange={e=>setF({...f,contract_value:e.target.value})}/>
      <button className="gold">حفظ</button><button type="button" className="ghost" onClick={()=>setF(null)}>إلغاء</button></form>}
    <div className="cards">{list.map(p=><div key={p.id} className="card hover" onClick={()=>open(p.id)}>
      <h3>{p.name}</h3><p className="muted">{p.client||'—'} · {p.location||'—'}</p>
      <p className="gold-t">{money(p.contract_value)}</p><small className="muted">{when(p.created_at)}</small></div>)}
      {!list.length&&<p className="muted">لا توجد مشاريع بعد</p>}</div></>
}

function Project({id,can,back}){
  const [p,setP]=useState(null),[rows,setRows]=useState([]),[tab,setTab]=useState('summary'),[f,setF]=useState(null),[rep,setRep]=useState(false),[focus,setFocus]=useState(null)
  const load=useCallback(async()=>{
    const a=await supabase.from('projects').select('*').eq('id',id).single();setP(a.data)
    const b=await supabase.from('entries').select('*').eq('project_id',id).order('created_at',{ascending:false});setRows(b.data||[])},[id])
  useEffect(()=>{load()},[load])
  useEffect(()=>{if(focus)setTimeout(()=>document.getElementById('r'+focus)?.scrollIntoView({behavior:'smooth',block:'center'}),150)},[tab,focus])
  const sum=t=>rows.filter(r=>t.includes(r.type)).reduce((s,r)=>s+Number(r.amount),0)
  const income=sum(['income']),spent=sum(SPENT),extracts=sum(['extract'])
  const stock={};rows.filter(r=>r.type.startsWith('material')).forEach(r=>{const s=stock[r.title]??={in:0,out:0,unit:r.unit};
    s[r.type==='material_in'?'in':'out']+=Number(r.qty||0)})
  const shown=rows.filter(r=>tab==='all'||(['material','cheque'].includes(tab)?r.type.startsWith(tab):r.type===tab))
  const save=async e=>{e.preventDefault();const {file}=f;let image_path=null
    if(file){image_path=`${id}/${crypto.randomUUID()}.${file.name.split('.').pop()}`;const u=await supabase.storage.from('attachments').upload(image_path,file);if(u.error)return alert(u.error.message)}
    const ex=f.type==='extract',ch=f.type.startsWith('cheque')
    const row={project_id:id,type:f.type,title:ex?`مستخلص رقم ${f.d.num}`:f.title,note:f.note,unit:f.unit,image_path,
      details:ex?{...f.d,items:f.items}:ch?{due:f.d?.due||null}:null,
      amount:ex?extTotal(f.items):f.type==='material_out'?0:f.amount||0,qty:f.qty||null}
    const {error}=await supabase.from('entries').insert(row);if(error)alert(error.message);else{setF(null);load()}}
  const del=async r=>{if(confirm('حذف السجل؟')){if(r.image_path)await supabase.storage.from('attachments').remove([r.image_path]);await supabase.from('entries').delete().eq('id',r.id);load()}}
  if(!p)return null
  const isMat=f?.type?.startsWith('material'),isExt=f?.type==='extract'
  return <>
    <div className="bar"><div><a onClick={back} className="muted">→ رجوع</a><h2>{p.name}</h2><p className="muted">{p.client} · {p.location}</p></div>
      <div className="acts"><button className="ghost brd" onClick={()=>setRep(!rep)}>📄 التقارير</button>
      {can('add')&&<button className="gold" onClick={()=>setF({type:'expense',title:'',amount:'',qty:'',unit:'',note:'',d:{},items:[]})}>+ تسجيل</button>}</div></div>
    {rep&&<Reports p={p} rows={rows}/>}
    <div className="stats">
      <Stat l="قيمة العقد" v={money(p.contract_value)}/><Stat l="إجمالي المستلم" v={money(income)} c="pos"/>
      <Stat l="إجمالي المصروف" v={money(spent)} c="neg"/><Stat l="الرصيد" v={money(income-spent)} c={income-spent>=0?'pos':'neg'}/>
      <Stat l="المستخلصات" v={money(extracts)}/>
      <Stat l="شيكات مستلمة" v={money(sum(['cheque_in']))}/><Stat l="شيكات صادرة" v={money(sum(['cheque_out']))}/></div>
    {f&&<form className="card grid" onSubmit={save}>
      <select value={f.type} onChange={e=>{const v=e.target.value;setF({...f,type:v,d:v==='extract'?{num:rows.filter(r=>r.type==='extract').length+1,status:'جاري',prev:0,date:ymd(new Date())}:{},items:v==='extract'?[{}]:[]})}}>{Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      {!isExt&&<input placeholder={isMat?'اسم الخامة':'البيان'} value={f.title} onChange={e=>setF({...f,title:e.target.value})} required/>}
      {isMat&&<><input type="number" step="any" placeholder="الكمية" value={f.qty} onChange={e=>setF({...f,qty:e.target.value})} required/>
        <input placeholder="الوحدة (طن، م³…)" value={f.unit} onChange={e=>setF({...f,unit:e.target.value})}/></>}
      {f.type!=='material_out'&&!isExt&&<input type="number" step="any" placeholder="المبلغ" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} required/>}
      {isExt&&<div className="span"><div className="grid">
        <input placeholder="رقم المستخلص" value={f.d.num} onChange={e=>setF({...f,d:{...f.d,num:e.target.value}})}/>
        <select value={f.d.status} onChange={e=>setF({...f,d:{...f.d,status:e.target.value}})}><option>جاري</option><option>منتهي</option></select>
        <input type="date" value={f.d.date} onChange={e=>setF({...f,d:{...f.d,date:e.target.value}})}/>
        <input type="number" placeholder="دفعات سابقة" value={f.d.prev} onChange={e=>setF({...f,d:{...f.d,prev:e.target.value}})}/></div>
        <Items items={f.items} set={items=>setF({...f,items})} cols={EXT_COLS}/><b>إجمالي المستخلص: {money(extTotal(f.items))}</b></div>}
      {f.type.startsWith('cheque')&&<input type="date" title="تاريخ الاستحقاق" value={f.d?.due||''} onChange={e=>setF({...f,d:{...f.d,due:e.target.value}})}/>}
      <input placeholder="ملاحظات" value={f.note} onChange={e=>setF({...f,note:e.target.value})}/>
      <label className="muted">📎 صورة مرفقة <input type="file" accept="image/*" onChange={e=>setF({...f,file:e.target.files[0]})}/></label>
      <button className="gold">حفظ</button><button type="button" className="ghost" onClick={()=>setF(null)}>إلغاء</button></form>}
    <div className="tabs">{TABS.map(([k,v])=><button key={k} className={tab===k?'on':''} onClick={()=>{setTab(k);setFocus(null)}}>{v}</button>)}</div>
    {tab==='material'&&<div className="card"><h4>رصيد الخامات</h4>{Object.entries(stock).map(([n,s])=>
      <div key={n} className="line"><span>{n}</span><span>وارد {s.in} · مستهلك {s.out} · متبقي <b className="gold-t">{s.in-s.out}</b> {s.unit}</span></div>)}</div>}
    {tab==='summary'&&<Summary p={p} rows={rows} go={(t,i)=>{setTab(t);setFocus(i)}}/>}
    {tab!=='summary'&&<div className="card table"><table><thead><tr><th>التاريخ والوقت</th><th>النوع</th><th>البيان</th><th>الكمية</th><th>المبلغ</th><th>ملاحظات</th><th/></tr></thead>
      <tbody>{shown.map(r=><tr key={r.id} id={'r'+r.id} className={focus===r.id?'hl':''}><td data-label="التاريخ">{when(r.created_at)}</td><td data-label="النوع"><span className={'tag '+r.type}>{TYPES[r.type]}</span></td><td data-label="البيان">{r.title}</td>
        <td data-label="الكمية">{r.qty?`${r.qty} ${r.unit||''}`:'—'}</td><td data-label="المبلغ">{r.type==='material_out'?'—':money(r.amount)}</td><td data-label="ملاحظات">{r.note}{r.details?.due&&` · استحقاق ${r.details.due}`}</td>
        <td><span className="acts">{r.image_path&&<a onClick={()=>openImg(r.image_path)}>📎</a>}<a onClick={()=>printRow(p,r)}>🖨</a>{can('delete')&&<a onClick={()=>del(r)}>✕</a>}</span></td></tr>)}</tbody></table>
      {!shown.length&&<p className="muted pad">لا توجد سجلات</p>}</div>}</>
}
const Stat=({l,v,c})=><div className="card stat"><small className="muted">{l}</small><div className={'val '+(c||'')}>{v}</div></div>

function Users(){
  const [list,setList]=useState([]),[n,setN]=useState({name:'',email:'',pw:''})
  const load=useCallback(async()=>{const {data}=await supabase.from('profiles').select('*').order('created_at');setList(data||[])},[])
  useEffect(()=>{load()},[load])
  const toggle=async(u,p)=>{const perms=u.perms.includes(p)?u.perms.filter(x=>x!==p):[...u.perms,p]
    await supabase.from('profiles').update({perms}).eq('id',u.id);load()}
  const pw=async u=>{const v=prompt('كلمة المرور الجديدة (6 حروف على الأقل)');if(!v||v.length<6)return;const {error}=await supabase.rpc('admin_set_password',{uid:u.id,pw:v});alert(error?error.message:'تم تغيير كلمة المرور')}
  const rm=async u=>{if(!confirm(`حذف ${u.full_name}؟`))return;const {error}=await supabase.rpc('admin_delete_user',{uid:u.id});if(error)alert(error.message);else load()}
  const add=async e=>{e.preventDefault();const {error}=await tempClient().auth.signUp({email:n.email,password:n.pw,options:{data:{full_name:n.name}}})
    if(error)alert(error.message);else{setN({name:'',email:'',pw:''});setTimeout(load,800)}}
  return <>
    <h2>المستخدمين والصلاحيات</h2>
    <form className="card grid" onSubmit={add}>
      <input placeholder="الاسم" value={n.name} onChange={e=>setN({...n,name:e.target.value})} required/>
      <input type="email" placeholder="البريد" value={n.email} onChange={e=>setN({...n,email:e.target.value})} required/>
      <input placeholder="كلمة مرور (6+)" minLength={6} value={n.pw} onChange={e=>setN({...n,pw:e.target.value})} required/>
      <button className="gold">+ إضافة مستخدم</button></form>
    {list.map(u=><div key={u.id} className="card line"><b>{u.full_name} {u.role==='admin'&&<span className="tag income">أدمن</span>}</b>
      <span className="acts"><a onClick={()=>pw(u)}>🔑 كلمة المرور</a><a onClick={()=>rm(u)}>🗑 حذف</a></span>
      {u.role==='admin'?<span className="muted">كل الصلاحيات</span>:<div className="perms">{Object.entries(PERMS).map(([k,v])=>
        <label key={k}><input type="checkbox" checked={u.perms.includes(k)} onChange={()=>toggle(u,k)}/>{v}</label>)}</div>}</div>)}</>
}

const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
const ymd=d=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*6e4);return z.toISOString().slice(0,10)}
const dshort=d=>d.toLocaleDateString('ar-EG',{dateStyle:'medium'})
function range(kind,anchor){const d=new Date(anchor+'T00:00:00');let s,e
  if(kind==='month'){s=new Date(d.getFullYear(),d.getMonth(),1);e=new Date(d.getFullYear(),d.getMonth()+1,1)}
  else{s=new Date(d);s.setDate(d.getDate()-((d.getDay()+1)%7));e=new Date(s);e.setDate(s.getDate()+7)}
  return [s,e]}

function Reports({p,rows}){
  const [kind,setKind]=useState('week'),[anchor,setAnchor]=useState(ymd(new Date()))
  const [s,e]=range(kind,anchor)
  const sel=rows.filter(r=>{const t=new Date(r.created_at);return t>=s&&t<e}).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
  const sum=t=>sel.filter(r=>t.includes(r.type)).reduce((x,r)=>x+Number(r.amount),0)
  const income=sum(['income']),spent=sum(SPENT),ext=sum(['extract'])
  const last=new Date(e-864e5)
  const label=kind==='month'?s.toLocaleDateString('ar-EG',{month:'long',year:'numeric'}):`من ${dshort(s)} إلى ${dshort(last)}`
  const title=`${p.name} - ${kind==='month'?'تقرير شهري':'تقرير أسبوعي'}`
  const sumRows=[['إجمالي المستلم',income],['إجمالي المصروف',spent],['الرصيد',income-spent],['المستخلصات',ext],
    ['شراء خامات',sum(['material_in'])],['يوميات العمال',sum(['labor'])],['مصروفات أخرى',sum(['expense'])]]
  const excel=()=>{
    const wb=XLSX.utils.book_new()
    const w1=XLSX.utils.aoa_to_sheet([[title],['الفترة',label],[],...sumRows]);w1['!cols']=[{wch:24},{wch:28}]
    const w2=XLSX.utils.aoa_to_sheet([['التاريخ والوقت','النوع','البيان','الكمية','الوحدة','المبلغ','ملاحظات'],
      ...sel.map(r=>[when(r.created_at),TYPES[r.type],r.title,r.qty??'',r.unit??'',r.type==='material_out'?'':Number(r.amount),r.note??''])])
    w2['!cols']=[{wch:24},{wch:16},{wch:26},{wch:10},{wch:10},{wch:14},{wch:30}]
    XLSX.utils.book_append_sheet(wb,w1,'ملخص');XLSX.utils.book_append_sheet(wb,w2,'السجلات')
    wb.Workbook={Views:[{RTL:true}]}
    XLSX.writeFile(wb,`${title} ${ymd(s)}.xlsx`)}
  const pdf=()=>printDoc({title:kind==='month'?'تقرير شهري':'تقرير أسبوعي',meta:[['الفترة',label],['السجلات',sel.length]],
    party:[['المشروع',p.name],['العميل',p.client||'—'],['الموقع',p.location||'—'],['نوعية العمل',p.work_type||'—']],
    head:['م','التاريخ والوقت','النوع','البيان','الكمية','المبلغ','ملاحظات'],
    rows:sel.map((r,i)=>[i+1,when(r.created_at),TYPES[r.type],r.title,r.qty?`${r.qty} ${r.unit||''}`:'—',r.type==='material_out'?'—':money(r.amount),r.note||'']),
    totals:sumRows.map(([k,v])=>[k,money(v)])})
  return <div className="card">
    <div className="grid"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="week">تقرير أسبوعي</option><option value="month">تقرير شهري</option></select>
      <input type="date" value={anchor} onChange={e=>setAnchor(e.target.value)}/>
      <button className="gold" onClick={pdf}>تصدير PDF</button><button className="gold" onClick={excel}>تصدير Excel</button></div>
    <p className="muted">{label} · {sel.length} سجل · مستلم <b className="pos">{money(income)}</b> · مصروف <b className="neg">{money(spent)}</b> · رصيد <b>{money(income-spent)}</b></p></div>
}

const CO={name:'كيان',addr:'أبو الغيط',phone:'01142326817'}
const num=n=>Number(n||0),pc=x=>x.pct===undefined||x.pct===''?100:num(x.pct)
const lineTot=x=>num(x.qty)*num(x.price)*pc(x)/100,extTotal=it=>(it||[]).reduce((s,x)=>s+lineTot(x),0)
const EXT_COLS=[['name','البند'],['unit','الوحدة'],['qty','الكمية','n'],['price','السعر','n'],['pct','% (100)','n']]
const openImg=async p=>{const {data,error}=await supabase.storage.from('attachments').createSignedUrl(p,3600);if(error)alert(error.message);else window.open(data.signedUrl,'_blank')}
const O=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر']
const T=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'],H=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة']
const w3=n=>{const h=Math.floor(n/100),r=n%100,p=[];if(h)p.push(H[h]);if(r)p.push(r<20?O[r]:(r%10?O[r%10]+' و':'')+T[Math.floor(r/10)]);return p.join(' و')}
function toWords(n){n=Math.round(n);if(!n)return 'صفر جنيه مصري';const o=[]
  for(const [v,s,d,pl] of [[1e6,'مليون','مليونان','ملايين'],[1e3,'ألف','ألفان','آلاف']]){const q=Math.floor(n/v);if(q){o.push(q===1?s:q===2?d:w3(q)+' '+(q<=10?pl:s));n%=v}}
  if(n)o.push(w3(n));return o.join(' و ')+' جنيه مصري'}

function Items({items,set,cols}){
  const up=(i,k,v)=>set(items.map((x,j)=>j===i?{...x,[k]:v}:x))
  return <div className="items">{items.map((x,i)=><div key={i} className="irow">
    {cols.map(([k,ph,t])=><input key={k} type={t==='n'?'number':'text'} step="any" placeholder={ph} value={x[k]??''} onChange={e=>up(i,k,e.target.value)} style={k==='name'?{flex:2}:null}/>)}
    <a onClick={()=>set(items.filter((_,j)=>j!==i))}>✕</a></div>)}<a onClick={()=>set([...items,{}])}>+ بند</a></div>
}

function printDoc({title,meta=[],party,head,rows,totals=[],words:w,img}){
  const win=window.open('','_blank');if(!win)return alert('اسمح بالنوافذ المنبثقة')
  const now=new Date(),m=meta.some(x=>x[0]==='التاريخ')?meta:[...meta,['التاريخ',dshort(now)],['الوقت',now.toLocaleTimeString('ar-EG',{timeStyle:'short'})]]
  win.document.write(`<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet"><style>
  @page{size:A4;margin:12mm}body{font-family:Cairo,Tahoma,sans-serif;color:#222;font-size:12px;margin:0}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #999;padding-bottom:8px}
  h1{margin:0;font-size:34px;color:#d9531e}.co p{margin:2px 0}.party{width:270px}.party div{display:flex;margin-bottom:2px}
  .party b{background:#f28c28;color:#fff;padding:2px 8px;width:120px;font-weight:400}.party span{padding:2px 8px;font-weight:700}
  .band{display:flex;margin:14px 0;background:#2f80d9;color:#fff}.band h2{margin:0;padding:14px 24px;font-size:24px;width:30%}
  .m{flex:1;display:flex}.m div{flex:1;text-align:center;padding:8px 4px;border-right:1px solid #fff6}.m small{display:block;opacity:.85}
  table{width:100%;border-collapse:collapse;margin-top:8px}th{border-bottom:2px solid #888;padding:8px 6px;text-align:right}
  td{padding:7px 6px;border-bottom:1px solid #ddd}.tot{width:300px;margin-top:12px}.tot div{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:6px 4px}
  .tot div:last-child{font-weight:700;background:#eaf2fc}.w{margin-top:14px;font-weight:600}.f{margin-top:22px;color:#888;font-size:10px;border-top:1px solid #ccc;padding-top:4px}</style></head><body>
  <div class="top"><div class="co"><h1>${esc(CO.name)}</h1><p>${esc(CO.addr)}</p><p>ت: ${esc(CO.phone)}</p></div>
  ${party?`<div class="party">${party.map(([k,v])=>`<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>`:''}</div>
  <div class="band"><h2>${esc(title)}</h2><div class="m">${m.map(([k,v])=>`<div><small>${esc(k)}</small>${esc(v)}</div>`).join('')}</div></div>
  <table><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
  <div class="tot">${totals.map(([k,v])=>`<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>
  ${w?`<div class="w">${esc(w)}</div>`:''}${img?`<img src="${img}" style="max-width:100%;max-height:430px;margin-top:16px;border:1px solid #ccc">`:''}<div class="f">${esc(CO.name)} · ${esc(CO.phone)}</div></body></html>`)
  win.document.close();win.focus();setTimeout(()=>win.print(),img?1800:700)}

const printExtract=(p,r,img)=>{const d=r.details||{},it=d.items||[],t=extTotal(it),net=t-num(d.prev)
  printDoc({title:`مستخلص رقم ${d.num}`,meta:[['الحالة',d.status],['التاريخ',dshort(new Date(d.date||r.created_at))]],
    party:[['الشركة',p.client||'—'],['المشروع',p.name],['نوعية العمل',p.work_type||'—']],
    head:['م','البيان','الوحدة','الكمية','السعر','%','الإجمالي'],
    rows:it.map((x,i)=>[i+1,x.name,x.unit||'',x.qty,x.price,pc(x)+'%',money(lineTot(x))]),
    totals:[['إجمالي قيمة المستخلص',money(t)],['دفعات سابقة',money(d.prev)],['الصافي المستحق',money(net)]],words:toWords(net),img})}

const Q_COLS=[['code','الكود'],['name','الصنف'],['qty','الكمية','n'],['unit','الوحدة'],['price','السعر','n']]
function Quotes({can}){
  const [list,setList]=useState([]),[f,setF]=useState(null)
  const load=useCallback(async()=>{const {data}=await supabase.from('quotes').select('*').order('created_at',{ascending:false});setList(data||[])},[])
  useEffect(()=>{load()},[load])
  const calc=q=>{const sub=(q.items||[]).reduce((s,x)=>s+num(x.qty)*num(x.price),0),vat=sub*num(q.vat)/100;return{sub,vat,total:sub-num(q.discount)+num(q.addition)+vat}}
  const I=(k,ph,t='text')=><input type={t} step="any" placeholder={ph} title={ph} value={f[k]??''} onChange={e=>setF({...f,[k]:e.target.value})}/>
  const save=async e=>{e.preventDefault();if(!f.customer)return alert('اكتب اسم العميل')
    const {error}=await supabase.from('quotes').insert({...f,due_date:f.due_date||null,discount:num(f.discount),addition:num(f.addition),vat:num(f.vat)});if(error)alert(error.message);else{setF(null);load()}}
  const del=async q=>{if(confirm('حذف عرض السعر؟')){await supabase.from('quotes').delete().eq('id',q.id);load()}}
  const print=q=>{const c=calc(q),t=new Date(q.created_at)
    printDoc({title:'عرض سعر',meta:[['الرقم',q.number],['التاريخ',dshort(t)],['الوقت',t.toLocaleTimeString('ar-EG',{timeStyle:'short'})],['الاستحقاق',q.due_date||'—']],
      party:[['الاسم / Name',q.customer],['التليفون / Phone',q.phone||''],['العنوان / Address',q.address||''],['الرقم الضريبي / VAT',q.vat_no||'']],
      head:['م','الكود','الصنف','الكمية','الوحدة','السعر','الإجمالي'],
      rows:q.items.map((x,i)=>[i+1,x.code||'',x.name,x.qty,x.unit||'',x.price,money(num(x.qty)*num(x.price))]),
      totals:[['الإجمالي بدون ضريبة',money(c.sub)],['الخصم',money(q.discount)],['الإضافي',money(q.addition)],['الضريبة',money(c.vat)],['الإجمالي المطلوب',money(c.total)]],words:toWords(c.total)})}
  return <>
    <div className="bar"><h2>عروض الأسعار</h2>{can('add')&&<button className="gold" onClick={()=>setF({customer:'',phone:'',address:'',vat_no:'',due_date:'',items:[{}],discount:0,addition:0,vat:0})}>+ عرض سعر</button>}</div>
    {f&&<form className="card" onSubmit={save}><div className="grid">{I('customer','اسم العميل')}{I('phone','التليفون')}{I('address','العنوان')}{I('vat_no','الرقم الضريبي')}{I('due_date','تاريخ الاستحقاق','date')}</div>
      <Items items={f.items} set={items=>setF({...f,items})} cols={Q_COLS}/>
      <div className="grid">{I('discount','الخصم','number')}{I('addition','إضافي','number')}{I('vat','ضريبة %','number')}<b>الإجمالي: {money(calc(f).total)}</b></div>
      <button className="gold">حفظ</button> <button type="button" className="ghost" onClick={()=>setF(null)}>إلغاء</button></form>}
    <div className="card table"><table><thead><tr><th>الرقم</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th/></tr></thead>
      <tbody>{list.map(q=><tr key={q.id}><td data-label="الرقم">{q.number}</td><td data-label="العميل">{q.customer}</td><td data-label="التاريخ">{when(q.created_at)}</td><td data-label="الإجمالي">{money(calc(q).total)}</td>
        <td><span className="acts"><a onClick={()=>print(q)}>🖨 طباعة / PDF</a>{can('delete')&&<a onClick={()=>del(q)}>✕</a>}</span></td></tr>)}</tbody></table>
      {!list.length&&<p className="muted pad">لا توجد عروض أسعار</p>}</div></>
}

const printRow=async(p,r)=>{let img;if(r.image_path){const {data}=await supabase.storage.from('attachments').createSignedUrl(r.image_path,900);img=data?.signedUrl}
  if(r.type==='extract')return printExtract(p,r,img)
  const t=new Date(r.created_at),mo=r.type==='material_out'
  printDoc({title:TYPES[r.type],meta:[['التاريخ',dshort(t)],['الوقت',t.toLocaleTimeString('ar-EG',{timeStyle:'short'})]],
    party:[['المشروع',p.name],['العميل',p.client||'—'],['الموقع',p.location||'—']],
    head:['م','البيان','الكمية','المبلغ','ملاحظات'],
    rows:[[1,r.title,r.qty?`${r.qty} ${r.unit||''}`:'—',mo?'—':money(r.amount),(r.note||'')+(r.details?.due?` · استحقاق ${r.details.due}`:'')]],
    totals:mo?[]:[['المبلغ',money(r.amount)]],words:mo?null:toWords(r.amount),img})}

const CATS=[['income','المقبوضات',['income']],['extract','المستخلصات',['extract']],['cheque','الشيكات',['cheque_in','cheque_out']],
  ['material','الخامات',['material_in','material_out']],['labor','يوميات العمال',['labor']],['expense','المصروفات',['expense']]]
function Summary({p,rows,go}){
  const sum=t=>rows.filter(r=>t.includes(r.type)).reduce((s,r)=>s+num(r.amount),0)
  const income=sum(['income']),spent=sum(SPENT)
  const tot=[['قيمة العقد',money(p.contract_value)],['إجمالي المستلم',money(income)],['إجمالي المصروف',money(spent)],['الرصيد',money(income-spent)],
    ['المستخلصات',money(sum(['extract']))],['شيكات مستلمة',money(sum(['cheque_in']))],['شيكات صادرة',money(sum(['cheque_out']))]]
  const printAll=()=>printDoc({title:'ملخص المشروع',meta:[['السجلات',rows.length]],
    party:[['المشروع',p.name],['العميل',p.client||'—'],['الموقع',p.location||'—'],['نوعية العمل',p.work_type||'—']],
    head:['م','التاريخ والوقت','النوع','البيان','الكمية','المبلغ'],
    rows:[...rows].reverse().map((r,i)=>[i+1,when(r.created_at),TYPES[r.type],r.title,r.qty?`${r.qty} ${r.unit||''}`:'—',r.type==='material_out'?'—':money(r.amount)]),totals:tot})
  return <>
    <div className="bar"><span className="muted">آخر التسجيلات من كل قسم، اضغط على أي سجل للوصول له</span><button className="gold" onClick={printAll}>🖨 طباعة الملخص</button></div>
    <div className="cards">{CATS.map(([k,name,types])=>{const rs=rows.filter(r=>types.includes(r.type))
      return <div key={k} className="card">
        <div className="line"><h3>{name} <small className="muted">({rs.length})</small></h3>
          <b className="gold-t">{k==='cheque'?`مستلم ${money(sum(['cheque_in']))} · صادر ${money(sum(['cheque_out']))}`:money(sum(types))}</b></div>
        {rs.slice(0,5).map(r=><div key={r.id} className="sitem" onClick={()=>go(k,r.id)}>
          <span>{r.title}<small className="muted">{when(r.created_at)}</small></span>
          <span>{r.type==='material_out'?'—':money(r.amount)} <a onClick={e=>{e.stopPropagation();printRow(p,r)}}>🖨</a></span></div>)}
        {!rs.length&&<small className="muted">لا يوجد</small>}
        {rs.length>0&&<a onClick={()=>go(k,null)}>عرض الكل ({rs.length}) ←</a>}</div>})}</div></>
}
