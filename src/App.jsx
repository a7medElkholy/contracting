import {useEffect,useState,useCallback} from 'react'
import {supabase,tempClient} from './supabase'
import * as XLSX from 'xlsx'

const TYPES={extract:'مستخلص',material_in:'شراء خامات',material_out:'استهلاك خامات',labor:'يومية عمال',expense:'مصروف',income:'استلام فلوس',cheque_in:'شيك مستلم',cheque_out:'شيك صادر',transport:'مواصلات'}
const TABS=[['summary','الملخص'],['all','الكل'],['income','المقبوضات'],['extract','المستخلصات'],['material','الخامات'],['labor','العمال'],['expense','المصروفات'],['transport','المواصلات'],['cheque','الشيكات'],['ext','مستخلصات خارجية'],['bills','فواتير المشتريات']]
const PERMS={view:'عرض المشاريع',create_project:'إنشاء مشروع',add:'إضافة/تعديل بطلب موافقة',direct:'إضافة وتعديل مباشر بدون موافقة',delete:'طلب حذف'}
const money=n=>Number(n||0).toLocaleString('ar-EG')+' ج.م'
const when=d=>new Date(d).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'})
const SPENT=['material_in','labor','expense','transport']

export default function App(){
  const [session,setSession]=useState(undefined),[me,setMe]=useState(null),[pend,setPend]=useState(0),[view,setView]=useState({page:'home'})
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:l}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(session)supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data})=>setMe(data));else setMe(null)},[session])
  useEffect(()=>{if(me?.role!=='admin')return;const f=()=>supabase.from('requests').select('id',{count:'exact',head:true}).eq('status','pending').then(({count})=>setPend(count||0));f();const t=setInterval(f,30000);return()=>clearInterval(t)},[me,view])
  if(session===undefined)return null
  if(!session)return <Login/>
  if(!me)return <div className="center">...</div>
  const can=p=>me.role==='admin'||me.perms?.includes(p)
  return <div className="shell">
    <header><div className="brand"><img src="/logo.png" className="hlogo" alt="الكيان"/><small className="muted">إدارة المشاريع</small></div>
      <nav><button onClick={()=>setView({page:'home'})}>الشركات</button>
      <button onClick={()=>setView({page:'quote'})}>عروض الأسعار</button><button onClick={()=>setView({page:'invoice'})}>الفواتير</button><button onClick={()=>setView({page:'receipt'})}>أذون الاستلام</button>
      {can('add')&&<button onClick={()=>setView({page:'requests'})}>الطلبات{pend>0&&<b className="badge">{pend}</b>}</button>}
      {me.role==='admin'&&<button onClick={()=>setView({page:'users'})}>المستخدمين</button>}</nav>
      <div className="who">{me.full_name}<button className="ghost" title="تغيير كلمة المرور" onClick={async()=>{const v=prompt('كلمة المرور الجديدة (6 حروف على الأقل)');if(!v||v.length<6)return;const {error}=await supabase.auth.updateUser({password:v});alert(error?error.message:'تم تغيير كلمة المرور')}}>🔑</button><button className="ghost" onClick={()=>supabase.auth.signOut()}>خروج</button></div></header>
    <main>{view.page==='home'&&<Companies can={can} open={id=>setView({page:'company',id})}/>}
      {view.page==='company'&&<Company id={view.id} can={can} admin={me.role==='admin'} back={()=>setView({page:'home'})} open={id=>setView({page:'project',id,cid:view.id})}/>}
      {view.page==='project'&&<Project id={view.id} can={can} admin={me.role==='admin'} back={()=>setView(view.cid?{page:'company',id:view.cid}:{page:'home'})}/>}
      {view.page==='requests'&&<Requests admin={me.role==='admin'}/>}
      {view.page==='users'&&<Users/>}{['quote','invoice','receipt'].includes(view.page)&&<Docs key={view.page} kind={view.page} can={can}/>}</main></div>
}

function Login(){
  const [email,setE]=useState(''),[pw,setP]=useState(''),[name,setN]=useState(''),[signup,setS]=useState(false),[err,setErr]=useState('')
  const go=async e=>{e.preventDefault();setErr('')
    const r=signup?await supabase.auth.signUp({email,password:pw,options:{data:{full_name:name}}}):await supabase.auth.signInWithPassword({email,password:pw})
    if(r.error)setErr(r.error.message)}
  return <div className="center"><form className="card login" onSubmit={go}>
    <div><img src="/logo.png" className="llogo" alt="الكيان للمقاولات"/><p className="muted" style={{textAlign:"center",margin:0}}>نظام إدارة المشاريع</p></div>
    {signup&&<input placeholder="الاسم" value={name} onChange={e=>setN(e.target.value)} required/>}
    <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e=>setE(e.target.value)} required/>
    <input type="password" placeholder="كلمة المرور" value={pw} onChange={e=>setP(e.target.value)} required minLength={6}/>
    {err&&<p className="err">{err}</p>}
    <button className="gold">{signup?'إنشاء حساب':'دخول'}</button>
    <a onClick={()=>setS(!signup)}>{signup?'عندي حساب':'حساب جديد (أول حساب = أدمن)'}</a></form></div>
}

function Projects({can,open,cid}){
  const [list,setList]=useState([]),[f,setF]=useState(null)
  const load=useCallback(async()=>{let q=supabase.from('projects').select('*').order('created_at',{ascending:false});q=cid==='none'?q.is('company_id',null):q.eq('company_id',cid);const {data}=await q;setList(data||[])},[cid])
  useEffect(()=>{load()},[load])
  const save=async e=>{e.preventDefault();const {error}=await supabase.from('projects').insert({...f,company_id:cid==='none'?null:cid});if(error)alert(error.message);else{setF(null);load()}}
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

function Project({id,can,admin,back}){
  const [p,setP]=useState(null),[rows,setRows]=useState([]),[tab,setTab]=useState('summary'),[f,setF]=useState(null),[rep,setRep]=useState(false),[focus,setFocus]=useState(null),[pe,setPe]=useState(null)
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
    const row={project_id:id,type:f.type,title:ex?`مستخلص رقم ${f.d.num}`:f.title,note:f.note,unit:f.unit,image_path:image_path||f.image_path||null,
      details:ex?{...f.d,items:f.items}:ch?{due:f.d?.due||null}:null,
      amount:ex?extTotal(f.items):f.type==='material_out'?0:f.amount||0,qty:f.qty||null}
    const direct=can('direct');let r2
    if(f.id)r2=direct?await supabase.from('entries').update(row).eq('id',f.id):await supabase.from('requests').insert({kind:'edit_entry',project_id:id,payload:{...row,entry_id:f.id,old:f.old}})
    else r2=direct?await supabase.from('entries').insert(row):await supabase.from('requests').insert({kind:'entry',project_id:id,payload:row})
    const {error}=r2
    if(error)alert(error.message);else{if(!can('direct'))alert('تم إرسال الطلب للأدمن للموافقة');setF(null);load()}}
  const edit=r=>{setF({id:r.id,old:{title:r.title,amount:r.amount,qty:r.qty},type:r.type,title:r.title,amount:r.amount??'',qty:r.qty??'',unit:r.unit||'',note:r.note||'',image_path:r.image_path,
    d:r.type==='extract'?{...r.details}:{due:r.details?.due},items:r.details?.items||[]});window.scrollTo({top:0,behavior:'smooth'})}
  const saveP=async e=>{e.preventDefault();const {id:_i,created_at,created_by,...row}=pe;const {error}=await supabase.from('projects').update({...row,contract_value:num(row.contract_value)}).eq('id',id);if(error)alert(error.message);else{setPe(null);load()}}
  const del=async r=>{if(!admin){if(confirm('إرسال طلب حذف للأدمن؟')){const {error}=await supabase.from('requests').insert({kind:'delete_entry',project_id:id,payload:{entry_id:r.id,title:r.title,type:r.type,amount:r.amount}});alert(error?error.message:'تم إرسال طلب الحذف')}return}
  if(confirm('حذف السجل؟')){if(r.image_path)await supabase.storage.from('attachments').remove([r.image_path]);await supabase.from('entries').delete().eq('id',r.id);load()}}
  if(!p)return null
  const isMat=f?.type?.startsWith('material'),isExt=f?.type==='extract'
  return <>
    <div className="bar"><div><a onClick={back} className="muted">→ رجوع</a><h2>{p.name}</h2><p className="muted">{p.client} · {p.location}</p>{can('direct')&&<a onClick={()=>setPe({...p})}>✏ تعديل المشروع</a>}</div>
      <div className="acts"><button className="ghost brd" onClick={()=>setRep(!rep)}>📄 التقارير</button>
      {can('add')&&<button className="gold" onClick={()=>setF({type:'expense',title:'',amount:'',qty:'',unit:'',note:'',d:{},items:[]})}>+ تسجيل</button>}</div></div>
    {pe&&<form className="card grid" onSubmit={saveP}><b className="span">✏ تعديل بيانات المشروع</b>
      {[['name','اسم المشروع'],['client','العميل'],['location','الموقع'],['work_type','نوعية العمل'],['contract_value','قيمة العقد']].map(([k,ph])=><input key={k} placeholder={ph} title={ph} type={k==='contract_value'?'number':'text'} value={pe[k]??''} onChange={e=>setPe({...pe,[k]:e.target.value})}/>)}
      <button className="gold">حفظ</button><button type="button" className="ghost" onClick={()=>setPe(null)}>إلغاء</button></form>}
    {rep&&<Reports p={p} rows={rows}/>}
    <div className="stats">
      <Stat l="قيمة العقد" v={money(p.contract_value)}/><Stat l="إجمالي المستلم" v={money(income)} c="pos"/>
      <Stat l="إجمالي المصروف" v={money(spent)} c="neg"/><Stat l="الرصيد" v={money(income-spent)} c={income-spent>=0?'pos':'neg'}/>
      <Stat l="المستخلصات" v={money(extracts)}/>
      <Stat l="شيكات مستلمة" v={money(sum(['cheque_in']))}/><Stat l="شيكات صادرة" v={money(sum(['cheque_out']))}/></div>
    {f&&<form className="card grid" onSubmit={save}>
      {f.id&&<b className="span">✏ تعديل سجل (تاريخ التسجيل الأصلي يفضل ثابت)</b>}
      <select value={f.type} disabled={!!f.id} onChange={e=>{const v=e.target.value;setF({...f,type:v,d:v==='extract'?{num:rows.filter(r=>r.type==='extract').length+1,status:'جاري',prev:0,date:ymd(new Date())}:{},items:v==='extract'?[{}]:[]})}}>{Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
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
    {tab==='extract'&&<ExtractsPanel p={p} rows={rows}/>}
    {tab==='ext'&&<Files cat="external_extract" projectId={id} p={p} can={can} admin={admin}/>}
    {tab==='bills'&&<Files cat="bill" projectId={id} p={p} can={can} admin={admin}/>}
    {!['summary','ext','bills'].includes(tab)&&<div className="card table"><table><thead><tr><th>التاريخ والوقت</th><th>النوع</th><th>البيان</th><th>الكمية</th><th>المبلغ</th><th>ملاحظات</th><th/></tr></thead>
      <tbody>{shown.map(r=><tr key={r.id} id={'r'+r.id} className={focus===r.id?'hl':''}><td data-label="التاريخ">{when(r.created_at)}</td><td data-label="النوع"><span className={'tag '+r.type}>{TYPES[r.type]}</span></td><td data-label="البيان">{r.title}{r.updated_at&&<small className="muted"> (معدّل {when(r.updated_at)})</small>}</td>
        <td data-label="الكمية">{r.qty?`${r.qty} ${r.unit||''}`:'—'}</td><td data-label="المبلغ">{r.type==='material_out'?'—':money(r.amount)}</td><td data-label="ملاحظات">{r.note}{r.details?.due&&` · استحقاق ${r.details.due}`}</td>
        <td><span className="acts">{r.image_path&&<a onClick={()=>openImg(r.image_path)}>📎</a>}{can('add')&&<a onClick={()=>edit(r)}>✏</a>}<a onClick={()=>printRow(p,r)}>🖨</a>{can('delete')&&<a onClick={()=>del(r)}>✕</a>}</span></td></tr>)}</tbody></table>
      {!shown.length&&<p className="muted pad">لا توجد سجلات</p>}</div>}</>
}
const Stat=({l,v,c})=><div className="card stat"><small className="muted">{l}</small><div className={'val '+(c||'')}>{v}</div></div>

function Users(){
  const [list,setList]=useState([]),[n,setN]=useState({name:'',email:'',pw:''})
  const load=useCallback(async()=>{const {data}=await supabase.from('profiles').select('*').eq('hidden',false).order('created_at');setList(data||[])},[])
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
    ['شراء خامات',sum(['material_in'])],['يوميات العمال',sum(['labor'])],['مواصلات',sum(['transport'])],['مصروفات أخرى',sum(['expense'])]]
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

const CO={name:'الكيان للمقاولات',addr:'أبو الغيط',phone:'01142326817'}
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

function printDoc({title,meta=[],party,head,rows,totals=[],words:w,img,sign,note:nt}){
  const win=window.open('','_blank');if(!win)return alert('اسمح بالنوافذ المنبثقة')
  const now=new Date(),m=meta.some(x=>x[0]==='التاريخ')?meta:[...meta,['التاريخ',dshort(now)],['الوقت',now.toLocaleTimeString('ar-EG',{timeStyle:'short'})]]
  win.document.write(`<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet"><style>
  @page{size:A4;margin:12mm}body{font-family:Cairo,Tahoma,sans-serif;color:#222;font-size:12px;margin:0}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #999;padding-bottom:8px}
  h1{margin:0;font-size:34px;color:#d9531e}.logo{height:92px;display:block;border-radius:8px;margin-bottom:4px}.co p{margin:2px 0}.party{width:270px}.party div{display:flex;margin-bottom:2px}
  .party b{background:#f28c28;color:#fff;padding:2px 8px;width:120px;font-weight:400}.party span{padding:2px 8px;font-weight:700}
  .band{display:flex;margin:14px 0;background:#2f80d9;color:#fff}.band h2{margin:0;padding:14px 24px;font-size:24px;width:30%}
  .m{flex:1;display:flex}.m div{flex:1;text-align:center;padding:8px 4px;border-right:1px solid #fff6}.m small{display:block;opacity:.85}
  table{width:100%;border-collapse:collapse;margin-top:8px}th{border-bottom:2px solid #888;padding:8px 6px;text-align:right}
  td{padding:7px 6px;border-bottom:1px solid #ddd}.tot{width:300px;margin-top:12px}.tot div{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:6px 4px}
  .tot div:last-child{font-weight:700;background:#eaf2fc}.w{margin-top:14px;font-weight:600}.sig{display:flex;justify-content:space-around;margin-top:44px;text-align:center}.f{margin-top:22px;color:#888;font-size:10px;border-top:1px solid #ccc;padding-top:4px}</style></head><body>
  <div class="top"><div class="co"><img class="logo" src="${location.origin}/logo.jpg" alt="${esc(CO.name)}"><p>${esc(CO.addr)}</p><p>ت: ${esc(CO.phone)}</p></div>
  ${party?`<div class="party">${party.map(([k,v])=>`<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>`:''}</div>
  <div class="band"><h2>${esc(title)}</h2><div class="m">${m.map(([k,v])=>`<div><small>${esc(k)}</small>${esc(v)}</div>`).join('')}</div></div>
  <table><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
  <div class="tot">${totals.map(([k,v])=>`<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>
  ${w?`<div class="w">${esc(w)}</div>`:''}${img?`<img src="${img}" style="max-width:100%;max-height:430px;margin-top:16px;border:1px solid #ccc">`:''}${nt?`<div class="w">${esc(nt)}</div>`:''}${sign?`<div class="sig">${sign.map(s=>`<div>${esc(s)}<br><br>____________</div>`).join('')}</div>`:''}<div class="f">${esc(CO.name)} · ${esc(CO.phone)}</div></body></html>`)
  win.document.close();win.focus()
  const imgs=[...win.document.images];Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>win.print(),400))}

const printExtract=(p,r,img)=>{const d=r.details||{},it=d.items||[],t=extTotal(it),net=t-num(d.prev)
  printDoc({title:`مستخلص رقم ${d.num}`,meta:[['الحالة',d.status],['التاريخ',dshort(new Date(d.date||r.created_at))]],
    party:[['الشركة',p.client||'—'],['المشروع',p.name],['نوعية العمل',p.work_type||'—']],
    head:['م','البيان','الوحدة','الكمية','السعر','%','الإجمالي'],
    rows:it.map((x,i)=>[i+1,x.name,x.unit||'',x.qty,x.price,pc(x)+'%',money(lineTot(x))]),
    totals:[['إجمالي قيمة المستخلص',money(t)],['دفعات سابقة',money(d.prev)],['الصافي المستحق',money(net)]],words:toWords(net),img})}

const KIND={quote:{t:'عرض سعر',h:'عروض الأسعار',price:1},invoice:{t:'فاتورة',h:'فواتير الخامات',price:1,paid:1},receipt:{t:'إذن استلام',h:'أذون الاستلام'}}
function Docs({kind,can}){
  const K=KIND[kind],[list,setList]=useState([]),[f,setF]=useState(null)
  const load=useCallback(async()=>{const {data}=await supabase.from('quotes').select('*').eq('kind',kind).order('number',{ascending:false});setList(data||[])},[kind])
  useEffect(()=>{load()},[load])
  const calc=q=>{const sub=(q.items||[]).reduce((s,x)=>s+num(x.qty)*num(x.price),0),vat=sub*num(q.vat)/100;return{sub,vat,total:sub-num(q.discount)+num(q.addition)+vat}}
  const I=(k,ph,t='text')=><input type={t} step="any" placeholder={ph} title={ph} value={f[k]??''} onChange={e=>setF({...f,[k]:e.target.value})}/>
  const cols=[['code','الكود'],['name','الصنف'],['qty','الكمية','n'],['unit','الوحدة'],...(K.price?[['price','السعر','n']]:[])]
  const blank=()=>setF({customer:'',phone:'',address:'',vat_no:'',due_date:'',items:[{}],discount:0,addition:0,vat:0,paid:0,note:''})
  const save=async e=>{e.preventDefault();if(!f.customer)return alert('اكتب الاسم')
    const row={kind,customer:f.customer,phone:f.phone,address:f.address,vat_no:f.vat_no,due_date:f.due_date||null,items:f.items,discount:num(f.discount),addition:num(f.addition),vat:num(f.vat),paid:num(f.paid),note:f.note||null}
    const {error}=f.id?await supabase.from('quotes').update(row).eq('id',f.id):await supabase.from('quotes').insert({...row,number:Math.max(0,...list.map(x=>x.number))+1})
    if(error)alert(error.message);else{setF(null);load()}}
  const del=async q=>{if(confirm('حذف؟')){await supabase.from('quotes').delete().eq('id',q.id);load()}}
  const print=q=>{const c=calc(q),t=new Date(q.created_at),pr=K.price
    printDoc({title:K.t,meta:[['الرقم',q.number],['التاريخ',dshort(t)],['الوقت',t.toLocaleTimeString('ar-EG',{timeStyle:'short'})],...(pr?[['الاستحقاق',q.due_date||'—']]:[])],
      party:[[pr?'الاسم / Name':'المورد / المسلّم',q.customer],['التليفون / Phone',q.phone||''],['العنوان / Address',q.address||''],...(pr?[['الرقم الضريبي / VAT',q.vat_no||'']]:[])],
      head:['م','الكود','الصنف','الكمية','الوحدة',...(pr?['السعر','الإجمالي']:[])],
      rows:q.items.map((x,i)=>[i+1,x.code||'',x.name,x.qty,x.unit||'',...(pr?[x.price,money(num(x.qty)*num(x.price))]:[])]),
      totals:pr?[['الإجمالي بدون ضريبة',money(c.sub)],['الخصم',money(q.discount)],['الإضافي',money(q.addition)],['الضريبة',money(c.vat)],[K.paid?'الإجمالي':'الإجمالي المطلوب',money(c.total)],
        ...(K.paid?[['المدفوع',money(q.paid)],['الباقي',money(c.total-num(q.paid))]]:[])]:[],
      words:pr?toWords(c.total):null,note:!pr&&q.note?`المستلم / ملاحظات: ${q.note}`:null,sign:pr?null:['المستلم','المسلّم','الاعتماد']})}
  return <>
    <div className="bar"><h2>{K.h}</h2>{can('add')&&<button className="gold" onClick={blank}>+ جديد</button>}</div>
    {f&&<form className="card" onSubmit={save}>{f.id&&<b>✏ تعديل رقم {f.number}</b>}
      <div className="grid">{I('customer',K.price?'اسم العميل':'اسم المورد / المسلّم')}{I('phone','التليفون')}{I('address','العنوان')}
        {K.price?<>{I('vat_no','الرقم الضريبي')}{I('due_date','تاريخ الاستحقاق','date')}</>:I('note','اسم المستلم / ملاحظات')}</div>
      <Items items={f.items} set={items=>setF({...f,items})} cols={cols}/>
      {K.price&&<div className="grid">{I('discount','الخصم','number')}{I('addition','إضافي','number')}{I('vat','ضريبة %','number')}{K.paid&&I('paid','المدفوع','number')}<b>الإجمالي: {money(calc(f).total)}</b></div>}
      <button className="gold">حفظ</button> <button type="button" className="ghost" onClick={()=>setF(null)}>إلغاء</button></form>}
    <div className="card table"><table><thead><tr><th>الرقم</th><th>الاسم</th><th>التاريخ</th>{K.price&&<th>الإجمالي</th>}<th/></tr></thead>
      <tbody>{list.map(q=><tr key={q.id}><td data-label="الرقم">{q.number}</td><td data-label="الاسم">{q.customer}</td><td data-label="التاريخ">{when(q.created_at)}{q.updated_at&&<small className="muted"> (معدّل)</small>}</td>
        {K.price&&<td data-label="الإجمالي">{money(calc(q).total)}</td>}
        <td><span className="acts">{can('direct')&&<a onClick={()=>{setF({...q,due_date:q.due_date||'',paid:q.paid??0,note:q.note||''});window.scrollTo({top:0,behavior:'smooth'})}}>✏</a>}<a onClick={()=>print(q)}>🖨</a>{can('delete')&&<a onClick={()=>del(q)}>✕</a>}</span></td></tr>)}</tbody></table>
      {!list.length&&<p className="muted pad">لا توجد سجلات</p>}</div></>
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
  ['material','الخامات',['material_in','material_out']],['labor','يوميات العمال',['labor']],['expense','المصروفات',['expense']],['transport','المواصلات',['transport']]]
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

function Companies({can,open}){
  const [list,setList]=useState([]),[f,setF]=useState(null),[orph,setO]=useState(0)
  const load=useCallback(async()=>{const {data}=await supabase.from('companies').select('*, projects(count)').order('name');setList(data||[])
    const {count}=await supabase.from('projects').select('id',{count:'exact',head:true}).is('company_id',null);setO(count||0)},[])
  useEffect(()=>{load()},[load])
  const save=async e=>{e.preventDefault();const {error}=await supabase.from('companies').insert(f);if(error)alert(error.message);else{setF(null);load()}}
  return <>
    <div className="bar"><h2>الشركات</h2>{can('create_project')&&<button className="gold" onClick={()=>setF({name:'',phone:'',address:'',note:''})}>+ إضافة شركة</button>}</div>
    {f&&<form className="card grid" onSubmit={save}>
      <input placeholder="اسم الشركة" value={f.name} onChange={e=>setF({...f,name:e.target.value})} required/>
      <input placeholder="التليفون" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/>
      <input placeholder="العنوان" value={f.address} onChange={e=>setF({...f,address:e.target.value})}/>
      <button className="gold">حفظ</button><button type="button" className="ghost" onClick={()=>setF(null)}>إلغاء</button></form>}
    <div className="cards">{list.map(c=><div key={c.id} className="card hover" onClick={()=>open(c.id)}>
      <h3>{c.name}</h3><p className="muted">{c.phone||'—'} · {c.address||'—'}</p><p className="gold-t">{c.projects?.[0]?.count||0} مشروع</p></div>)}
      {orph>0&&<div className="card hover" onClick={()=>open('none')}><h3>مشاريع بدون شركة</h3><p className="gold-t">{orph} مشروع</p></div>}
      {!list.length&&!orph&&<p className="muted">لا توجد شركات بعد</p>}</div></>
}

function Company({id,can,admin,back,open}){
  const [c,setC]=useState(null),[tab,setTab]=useState('projects'),[projs,setProjs]=useState([]),[ce,setCe]=useState(null)
  useEffect(()=>{if(id!=='none')supabase.from('companies').select('*').eq('id',id).single().then(({data})=>setC(data))
    let q=supabase.from('projects').select('id,name');q=id==='none'?q.is('company_id',null):q.eq('company_id',id);q.then(({data})=>setProjs(data||[]))},[id,tab])
  const saveC=async e=>{e.preventDefault();const {error}=await supabase.from('companies').update({name:ce.name,phone:ce.phone,address:ce.address}).eq('id',id);if(error)alert(error.message);else{setC({...c,...ce});setCe(null)}}
  return <><a onClick={back} className="muted">→ الشركات</a><h2>{c?.name||'مشاريع بدون شركة'}</h2><p className="muted">{c?.phone} {c?.address}</p>
    {c&&can('direct')&&<a onClick={()=>setCe({...c})}>✏ تعديل بيانات الشركة</a>}
    {ce&&<form className="card grid" onSubmit={saveC}>{[['name','اسم الشركة'],['phone','التليفون'],['address','العنوان']].map(([k,ph])=><input key={k} placeholder={ph} value={ce[k]||''} onChange={e=>setCe({...ce,[k]:e.target.value})}/>)}
      <button className="gold">حفظ</button><button type="button" className="ghost" onClick={()=>setCe(null)}>إلغاء</button></form>}
    {id!=='none'&&<div className="tabs">{[['projects','المشاريع'],['dues','المستحقات والدفعات'],['stmt','كشف الحساب'],['bills','فواتير المشتريات']].map(([k,v])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{v}</button>)}</div>}
    {tab==='projects'&&<Projects can={can} open={open} cid={id}/>}
    {tab==='dues'&&c&&<Dues c={c} can={can} admin={admin}/>}
    {tab==='stmt'&&c&&<Statement c={c}/>}
    {tab==='bills'&&c&&<Files cat="bill" companyId={id} projects={projs} c={c} can={can} admin={admin}/>}</>
}

function Statement({c}){
  const [rows,setRows]=useState([])
  useEffect(()=>{(async()=>{const {data:ps}=await supabase.from('projects').select('id,name').eq('company_id',c.id),R=[]
    const nm=Object.fromEntries((ps||[]).map(x=>[x.id,x.name]))
    if(ps?.length){const {data}=await supabase.from('entries').select('*').in('project_id',ps.map(x=>x.id)).in('type',['extract','income','cheque_in'])
      ;(data||[]).forEach(r=>R.push({id:r.id,at:r.created_at,label:when(r.created_at),pname:nm[r.project_id],title:r.title,amount:num(r.amount),debit:r.type==='extract',k:r.type==='extract'?'extract':r.type==='income'?'cash':'cheque',ty:r.type}))}
    const {data:ds}=await supabase.from('company_dues').select('*').eq('company_id',c.id)
    ;(ds||[]).forEach(d=>R.push({id:d.id,at:d.due_date,label:d.due_date,pname:'مستحقات مباشرة',title:d.title,amount:num(d.amount),debit:true,k:'due',ty:'extract'}))
    if(ds?.length){const {data:pp}=await supabase.from('due_payments').select('*').in('due_id',ds.map(x=>x.id));const dn=Object.fromEntries(ds.map(x=>[x.id,x.title]))
      ;(pp||[]).forEach(x=>R.push({id:x.id,at:x.pay_date,label:x.pay_date,pname:'مستحقات مباشرة',title:'دفعة من: '+dn[x.due_id],amount:num(x.amount),debit:false,k:x.method==='cash'?'cash':'cheque',ty:x.method==='cash'?'income':'cheque_in'}))}
    R.sort((a,b)=>new Date(a.at)-new Date(b.at));setRows(R)})()},[c.id])
  const KL={extract:'مستخلص',due:'مستحق',cash:'استلام نقدي',cheque:'استلام شيك'}
  let bal=0;const L=rows.map(r=>{bal+=r.debit?r.amount:-r.amount;return {...r,bal}})
  const sum=f=>L.filter(f).reduce((s,r)=>s+r.amount,0)
  const ext=sum(r=>r.k==='extract'),due=sum(r=>r.k==='due'),cash=sum(r=>r.k==='cash'),chq=sum(r=>r.k==='cheque'),rest=ext+due-cash-chq
  const tot=[['إجمالي المستخلصات',money(ext)],['مستحقات مباشرة',money(due)],['مستلم نقدي',money(cash)],['مستلم شيكات',money(chq)],['المتبقي على الشركة',money(rest)]]
  const print=()=>printDoc({title:'كشف حساب',meta:[['الحركات',L.length]],party:[['الشركة',c.name],['التليفون',c.phone||'—'],['العنوان',c.address||'—']],
    head:['م','التاريخ','المشروع','البيان','النوع','مدين','دائن','الرصيد'],
    rows:L.map((r,i)=>[i+1,r.label,r.pname,r.title,KL[r.k],r.debit?money(r.amount):'',r.debit?'':money(r.amount),money(r.bal)]),totals:tot,words:rest>0?toWords(rest):null})
  return <>
    <div className="bar"><span className="muted">المستخلصات والمستحقات = مدين · النقدي والشيكات المستلمة = دائن</span><button className="gold" onClick={print}>🖨 طباعة كشف الحساب</button></div>
    <div className="stats"><Stat l="المستخلصات + المستحقات" v={money(ext+due)}/><Stat l="مستلم نقدي" v={money(cash)} c="pos"/><Stat l="مستلم شيكات" v={money(chq)} c="pos"/><Stat l="المتبقي" v={money(rest)} c={rest>0?'neg':'pos'}/></div>
    <div className="card table"><table><thead><tr><th>التاريخ</th><th>المشروع</th><th>البيان</th><th>النوع</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
      <tbody>{L.map(r=><tr key={r.id}><td data-label="التاريخ">{r.label}</td><td data-label="المشروع">{r.pname}</td><td data-label="البيان">{r.title}</td><td data-label="النوع"><span className={'tag '+r.ty}>{KL[r.k]}</span></td>
        <td data-label="مدين">{r.debit?money(r.amount):'—'}</td><td data-label="دائن">{r.debit?'—':money(r.amount)}</td><td data-label="الرصيد">{money(r.bal)}</td></tr>)}</tbody></table>
      {!L.length&&<p className="muted pad">لا توجد حركات</p>}</div></>
}

function Dues({c,can,admin}){
  const [dues,setD]=useState([]),[pays,setP]=useState([]),[f,setF]=useState(null),[pf,setPF]=useState(null)
  const load=useCallback(async()=>{const a=await supabase.from('company_dues').select('*').eq('company_id',c.id).order('due_date',{ascending:false});setD(a.data||[])
    const ids=(a.data||[]).map(x=>x.id);if(!ids.length)return setP([]);const b=await supabase.from('due_payments').select('*').in('due_id',ids).order('pay_date');setP(b.data||[])},[c.id])
  useEffect(()=>{load()},[load])
  const up=async file=>{if(!file)return null;const p=`dues/${crypto.randomUUID()}.${file.name.split('.').pop()}`;const u=await supabase.storage.from('attachments').upload(p,file);if(u.error){alert(u.error.message);return false}return p}
  const saveDue=async e=>{e.preventDefault();const img=await up(f.file);if(img===false)return
    const row={company_id:c.id,title:f.title,amount:num(f.amount),due_date:f.due_date,note:f.note||null,image_path:img||f.image_path||null}
    const {error}=f.id?await supabase.from('company_dues').update(row).eq('id',f.id):await supabase.from('company_dues').insert(row);if(error)alert(error.message);else{setF(null);load()}}
  const savePay=async e=>{e.preventDefault();if(!pf.id&&num(pf.amount)>pf.max&&!confirm('المبلغ أكبر من المتبقي. متابعة؟'))return
    const img=await up(pf.file);if(img===false)return
    const row={due_id:pf.due_id,amount:num(pf.amount),method:pf.method,pay_date:pf.pay_date,note:pf.note||null,image_path:img||pf.image_path||null}
    const {error}=pf.id?await supabase.from('due_payments').update(row).eq('id',pf.id):await supabase.from('due_payments').insert(row);if(error)alert(error.message);else{setPF(null);load()}}
  const delDue=async d=>{if(confirm('حذف المستحق وكل دفعاته؟')){await supabase.from('company_dues').delete().eq('id',d.id);load()}}
  const delPay=async x=>{if(confirm('حذف الدفعة؟')){await supabase.from('due_payments').delete().eq('id',x.id);load()}}
  const printDue=(d,ps,paid,rest)=>printDoc({title:'كشف مستحق',meta:[['من تاريخ',d.due_date]],party:[['الشركة',c.name],['البيان',d.title],['التليفون',c.phone||'—']],
    head:['م','التاريخ','النوع','المبلغ','ملاحظات'],rows:ps.map((x,i)=>[i+1,x.pay_date,x.method==='cash'?'نقدي':'شيك',money(x.amount),x.note||'']),
    totals:[['إجمالي المستحق',money(d.amount)],['إجمالي المدفوع',money(paid)],['المتبقي',money(rest)]],words:rest>0?toWords(rest):null})
  const tAmt=dues.reduce((s,d)=>s+num(d.amount),0),tPaid=pays.reduce((s,x)=>s+num(x.amount),0)
  const fileIn=(o,s)=><label className="muted">📎 مرفق <input type="file" accept="image/*,application/pdf" onChange={e=>s({...o,file:e.target.files[0]})}/></label>
  return <>
    <div className="bar"><span className="muted">مبالغ ليك عند الشركة ودفعاتها</span>{can('direct')&&<button className="gold" onClick={()=>setF({title:'',amount:'',due_date:ymd(new Date()),note:''})}>+ مستحق جديد</button>}</div>
    <div className="stats"><Stat l="إجمالي المستحقات" v={money(tAmt)}/><Stat l="المدفوع" v={money(tPaid)} c="pos"/><Stat l="المتبقي" v={money(tAmt-tPaid)} c={tAmt-tPaid>0?'neg':'pos'}/></div>
    {f&&<form className="card grid" onSubmit={saveDue}><b className="span">{f.id?'✏ تعديل مستحق':'مستحق جديد (مبلغ ليك عند الشركة)'}</b>
      <input placeholder="البيان" value={f.title} onChange={e=>setF({...f,title:e.target.value})} required/>
      <input type="number" step="any" placeholder="المبلغ" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} required/>
      <input type="date" title="من تاريخ" value={f.due_date} onChange={e=>setF({...f,due_date:e.target.value})} required/>
      <input placeholder="ملاحظات" value={f.note||''} onChange={e=>setF({...f,note:e.target.value})}/>{fileIn(f,setF)}
      <button className="gold">حفظ</button><button type="button" className="ghost" onClick={()=>setF(null)}>إلغاء</button></form>}
    {pf&&<form className="card grid" onSubmit={savePay}><b className="span">{pf.id?'✏ تعديل دفعة':'تسجيل دفعة'} · {dues.find(d=>d.id===pf.due_id)?.title}</b>
      <input type="number" step="any" placeholder="المبلغ" value={pf.amount} onChange={e=>setPF({...pf,amount:e.target.value})} required/>
      <select value={pf.method} onChange={e=>setPF({...pf,method:e.target.value})}><option value="cash">نقدي</option><option value="cheque">شيك</option></select>
      <input type="date" value={pf.pay_date} onChange={e=>setPF({...pf,pay_date:e.target.value})} required/>
      <input placeholder="ملاحظات" value={pf.note||''} onChange={e=>setPF({...pf,note:e.target.value})}/>{fileIn(pf,setPF)}
      <button className="gold">حفظ</button><button type="button" className="ghost" onClick={()=>setPF(null)}>إلغاء</button></form>}
    {dues.map(d=>{const ps=pays.filter(x=>x.due_id===d.id),paid=ps.reduce((s,x)=>s+num(x.amount),0),rest=num(d.amount)-paid
      return <div key={d.id} className="card">
        <div className="line"><div><h3>{d.title}{d.updated_at&&<small className="muted"> (معدّل)</small>}</h3><small className="muted">من تاريخ {d.due_date}{d.note&&` · ${d.note}`}</small></div>
          <div><b className="gold-t">{money(d.amount)}</b><br/><small>مدفوع <span className="pos">{money(paid)}</span> · متبقي <span className={rest>0?'neg':'pos'}>{money(rest)}</span></small></div></div>
        <div className="bar2"><i style={{width:Math.min(100,paid/Math.max(num(d.amount),1)*100)+'%'}}/></div>
        {ps.map(x=><div key={x.id} className="sitem" style={{cursor:'default'}}><span>{x.method==='cash'?'نقدي':'شيك'} · {x.pay_date}<small className="muted">{x.note}</small></span>
          <span>{money(x.amount)} {x.image_path&&<a onClick={()=>openImg(x.image_path)}>📎</a>} {can('direct')&&<a onClick={()=>setPF({...x})}>✏</a>} {admin&&<a onClick={()=>delPay(x)}>✕</a>}</span></div>)}
        <div className="acts" style={{marginTop:10}}>{can('direct')&&<button className="gold" onClick={()=>setPF({due_id:d.id,amount:'',method:'cash',pay_date:ymd(new Date()),note:'',max:rest})}>+ دفعة</button>}
          {can('direct')&&<a onClick={()=>{setF({...d});window.scrollTo({top:0,behavior:'smooth'})}}>✏ تعديل</a>}<a onClick={()=>printDue(d,ps,paid,rest)}>🖨 كشف</a>{admin&&<a onClick={()=>delDue(d)}>🗑 حذف</a>}</div></div>})}
    {!dues.length&&<p className="muted">لا توجد مستحقات</p>}</>
}

function Files({cat,projectId,companyId,projects,p,c,can,admin}){
  const [rows,setRows]=useState([]),[f,setF]=useState(null)
  const load=useCallback(async()=>{let q=supabase.from('files').select('*, project:projects(name)').eq('category',cat).order('created_at',{ascending:false})
    q=projectId?q.eq('project_id',projectId):q.eq('company_id',companyId);const {data}=await q;setRows(data||[])},[cat,projectId,companyId])
  useEffect(()=>{load()},[load])
  const total=rows.reduce((s,r)=>s+num(r.amount),0)
  const save=async e=>{e.preventDefault();if(!f.file)return alert('اختر ملف')
    const path=`files/${crypto.randomUUID()}.${f.file.name.split('.').pop()}`
    const u=await supabase.storage.from('attachments').upload(path,f.file);if(u.error)return alert(u.error.message)
    const {error}=await supabase.from('files').insert({category:cat,project_id:projectId||f.project||null,company_id:companyId||p?.company_id||null,title:f.title,
      amount:f.amount===''?null:num(f.amount),doc_date:f.date,file_path:path,file_name:f.file.name});if(error)alert(error.message);else{setF(null);load()}}
  const del=async r=>{if(confirm('حذف الملف؟')){await supabase.storage.from('attachments').remove([r.file_path]);await supabase.from('files').delete().eq('id',r.id);load()}}
  const print=()=>printDoc({title:'كشف مشتريات',meta:[['عدد الفواتير',rows.length]],party:c?[['الشركة',c.name],['التليفون',c.phone||'—']]:[['المشروع',p.name],['العميل',p.client||'—']],
    head:['م','التاريخ','البيان','المشروع','المبلغ'],rows:[...rows].reverse().map((r,i)=>[i+1,r.doc_date,r.title,r.project?.name||'—',r.amount!=null?money(r.amount):'—']),
    totals:[['إجمالي المشتريات',money(total)]],words:total?toWords(total):null})
  const bill=cat==='bill'
  return <>
    <div className="bar"><h3>{bill?'فواتير المشتريات':'المستخلصات الخارجية'} <small className="muted">(ملفات للقراءة فقط)</small></h3><div className="acts">
      {bill&&<button className="ghost brd" onClick={print}>🖨 كشف المشتريات</button>}
      {can('add')&&<button className="gold" onClick={()=>setF({title:'',amount:'',date:ymd(new Date()),project:''})}>+ رفع ملف</button>}</div></div>
    {f&&<form className="card grid" onSubmit={save}>
      <input placeholder={bill?'البيان / رقم الفاتورة':'رقم أو بيان المستخلص'} value={f.title} onChange={e=>setF({...f,title:e.target.value})} required/>
      <input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/>
      <input type="number" step="any" placeholder="المبلغ (اختياري)" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/>
      {projects&&<select value={f.project} onChange={e=>setF({...f,project:e.target.value})}><option value="">بدون مشروع</option>{projects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      <input type="file" accept="image/*,application/pdf" onChange={e=>setF({...f,file:e.target.files[0]})} required/>
      <button className="gold">رفع</button><button type="button" className="ghost" onClick={()=>setF(null)}>إلغاء</button></form>}
    <div className="card table"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>المشروع</th><th>المبلغ</th><th>الملف</th><th/></tr></thead>
      <tbody>{rows.map(r=><tr key={r.id}><td data-label="التاريخ">{r.doc_date}</td><td data-label="البيان">{r.title}</td><td data-label="المشروع">{r.project?.name||'—'}</td>
        <td data-label="المبلغ">{r.amount!=null?money(r.amount):'—'}</td><td data-label="الملف"><a onClick={()=>openImg(r.file_path)}>📎 فتح</a></td>
        <td>{admin&&<a onClick={()=>del(r)}>✕</a>}</td></tr>)}</tbody></table>
      {!rows.length&&<p className="muted pad">لا توجد ملفات</p>}{total>0&&<p className="pad">الإجمالي: <b className="gold-t">{money(total)}</b></p>}</div></>
}

function ExtractsPanel({p,rows}){
  const ex=rows.filter(r=>r.type==='extract').sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
  if(!ex.length)return null
  const prev=r=>num(r.details?.prev),tv=ex.reduce((s,r)=>s+num(r.amount),0),tp=ex.reduce((s,r)=>s+prev(r),0)
  const print=()=>printDoc({title:'ملخص المستخلصات',meta:[['عدد المستخلصات',ex.length]],party:[['المشروع',p.name],['العميل',p.client||'—'],['نوعية العمل',p.work_type||'—']],
    head:['م','رقم المستخلص','التاريخ','الحالة','القيمة','دفعات سابقة','الصافي'],
    rows:ex.map((r,i)=>[i+1,r.details?.num,dshort(new Date(r.details?.date||r.created_at)),r.details?.status||'',money(r.amount),money(prev(r)),money(num(r.amount)-prev(r))]),
    totals:[['إجمالي المستخلصات',money(tv)],['دفعات سابقة',money(tp)],['الصافي',money(tv-tp)]],words:toWords(tv-tp)})
  return <div className="card"><div className="line"><h4>ملخص المستخلصات ({ex.length})</h4><button className="gold" onClick={print}>🖨 طباعة ملخص كل المستخلصات</button></div>
    {ex.map(r=><div key={r.id} className="sitem" style={{cursor:'default'}}><span>مستخلص رقم {r.details?.num}<small className="muted">{r.details?.status} · {when(r.created_at)}</small></span>
      <span>{money(r.amount)} <a onClick={()=>printRow(p,r)}>⬇ تنزيل</a></span></div>)}</div>
}

function Requests({admin}){
  const [list,setList]=useState([])
  const load=useCallback(async()=>{const {data}=await supabase.from('requests').select('*, projects(name), requester:profiles!requested_by(full_name)').order('created_at',{ascending:false});setList(data||[])},[])
  useEffect(()=>{load()},[load])
  const ok=async r=>{const {error}=await supabase.rpc('approve_request',{rid:r.id});if(error)alert(error.message);load()}
  const no=async r=>{const why=prompt('سبب الرفض (اختياري)');if(why===null)return;const {error}=await supabase.rpc('reject_request',{rid:r.id,why});if(error)alert(error.message);load()}
  const S={pending:'قيد المراجعة',approved:'تمت الموافقة',rejected:'مرفوض'}
  return <><h2>{admin?'طلبات الموافقة':'طلباتي'}</h2>
    {list.map(r=>{const p=r.payload,del=r.kind==='delete_entry';return <div key={r.id} className="card">
      <div className="line"><b>{r.requester?.full_name||'—'} {{entry:'يطلب إضافة',delete_entry:'يطلب حذف',edit_entry:'يطلب تعديل'}[r.kind]} {TYPES[p.type]}: {p.title}</b><span className={'tag '+(r.status==='approved'?'income':r.status==='rejected'?'expense':'extract')}>{S[r.status]}</span></div>
      <p className="muted">مشروع {r.projects?.name} · {when(r.created_at)}</p>
      {p.old&&<p className="muted">قبل التعديل: {p.old.title} · {money(p.old.amount)}{p.old.qty?` · ${p.old.qty}`:''}</p>}
      <p>{p.type==='extract'?`مستخلص رقم ${p.details?.num} · ${p.details?.items?.length||0} بند · `:''}{p.qty?`الكمية ${p.qty} ${p.unit||''} · `:''}{p.type!=='material_out'&&<b className="gold-t">{money(p.type==='extract'?extTotal(p.details?.items):p.amount)}</b>} {p.note&&`· ${p.note}`}</p>
      {p.image_path&&<a onClick={()=>openImg(p.image_path)}>📎 الصورة المرفقة</a>}
      {r.reason&&<p className="neg">سبب الرفض: {r.reason}</p>}
      {admin&&r.status==='pending'&&<div className="acts"><button className="gold" onClick={()=>ok(r)}>✓ موافقة</button><button className="ghost brd" onClick={()=>no(r)}>✕ رفض</button></div>}</div>})}
    {!list.length&&<p className="muted">لا توجد طلبات</p>}</>
}
