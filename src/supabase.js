import {createClient} from '@supabase/supabase-js'
const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase=createClient(url,key)
// عميل مؤقت لإنشاء مستخدمين بدون تسجيل خروج الأدمن
export const tempClient=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
