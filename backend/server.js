require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Configure backend/.env using .env.example'); process.exit(1);
}
const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/api/health', (req,res)=>res.json({ok:true}));
app.post('/api/auth/signup', async (req,res,next)=>{
 try {
  const {email,password}=req.body||{};
  if(typeof email!=='string'||!/^.{1,254}@.{1,254}\..+$/.test(email)||typeof password!=='string'||password.length<8||password.length>72)
    return res.status(400).json({error:'Enter a valid email and password (8–72 characters).'});
  const {data,error}=await publicClient.auth.signUp({email,password});
  if(error) return res.status(400).json({error:error.message});
  res.status(201).json({message:'Account created. Check email for confirmation if enabled.',session:data.session||null});
 } catch(e){next(e)}
});
app.post('/api/auth/login', async(req,res,next)=>{
 try {
  const {email,password}=req.body||{};
  if(typeof email!=='string'||typeof password!=='string') return res.status(400).json({error:'Email and password required.'});
  const {data,error}=await publicClient.auth.signInWithPassword({email,password});
  if(error) return res.status(401).json({error:'Invalid credentials or unconfirmed email.'});
  res.json({session:data.session});
 }catch(e){next(e)}
});
app.post('/api/auth/refresh',async(req,res,next)=>{
 try{
  const token=req.body?.refresh_token;
  if(typeof token!=='string') return res.status(400).json({error:'Refresh token required.'});
  const {data,error}=await publicClient.auth.refreshSession({refresh_token:token});
  if(error) return res.status(401).json({error:'Session expired. Log in again.'});
  res.json({session:data.session});
 }catch(e){next(e)}
});
app.use('/api',async(req,res,next)=>{
 try{
  const match=/^Bearer (.+)$/.exec(req.headers.authorization||'');
  if(!match) return res.status(401).json({error:'Log in first.'});
  const {data:{user},error}=await publicClient.auth.getUser(match[1]);
  if(error||!user) return res.status(401).json({error:'Invalid or expired session.'});
  req.user=user;
  req.db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${match[1]}`}},auth:{persistSession:false,autoRefreshToken:false}});
  next();
 }catch(e){next(e)}
});
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const str=(v,max,required=false)=>typeof v==='string'&&v.trim().length<=(max)&&(!required||v.trim().length>0);
function dbError(res,error){return res.status(400).json({error:error.code==='23505'?'Already added.':'Request could not be completed.'})}
app.get('/api/playlists',async(req,res,next)=>{
 try{const {data,error}=await req.db.from('playlists').select('*').order('created_at',{ascending:false});if(error)return dbError(res,error);res.json(data)}catch(e){next(e)}
});
app.post('/api/playlists',async(req,res,next)=>{
 try{
  const {name,description=''}=req.body||{};
  if(!str(name,100,true)||!str(description,500))return res.status(400).json({error:'Name (1–100) and description (max 500) required.'});
  const {data,error}=await req.db.from('playlists').insert({user_id:req.user.id,name:name.trim(),description:description.trim()}).select().single();
  if(error)return dbError(res,error);res.status(201).json(data);
 }catch(e){next(e)}
});
app.patch('/api/playlists/:id',async(req,res,next)=>{
 try{
  if(!uuid(req.params.id))return res.status(400).json({error:'Invalid ID.'});
  const {name,description}=req.body||{}, changes={};
  if(name!==undefined){if(!str(name,100,true))return res.status(400).json({error:'Invalid name.'});changes.name=name.trim()}
  if(description!==undefined){if(!str(description,500))return res.status(400).json({error:'Invalid description.'});changes.description=description.trim()}
  if(!Object.keys(changes).length)return res.status(400).json({error:'No changes provided.'});
  const {data,error}=await req.db.from('playlists').update(changes).eq('id',req.params.id).select().maybeSingle();
  if(error)return dbError(res,error);if(!data)return res.status(404).json({error:'Playlist not found.'});res.json(data)
 }catch(e){next(e)}
});
app.delete('/api/playlists/:id',async(req,res,next)=>{
 try{if(!uuid(req.params.id))return res.status(400).json({error:'Invalid ID.'});
 const {data,error}=await req.db.from('playlists').delete().eq('id',req.params.id).select('id').maybeSingle();
 if(error)return dbError(res,error);if(!data)return res.status(404).json({error:'Playlist not found.'});res.json({ok:true})
 }catch(e){next(e)}
});
app.get('/api/songs',async(req,res,next)=>{
 try{const {data,error}=await req.db.from('songs').select('*').order('created_at',{ascending:false});if(error)return dbError(res,error);res.json(data)}catch(e){next(e)}
});
app.post('/api/songs',async(req,res,next)=>{
 try{
  const {title,artist,album='',genre='',duration_seconds=0}=req.body||{};
  if(!str(title,150,true)||!str(artist,150,true)||!str(album,150)||!str(genre,80)||!Number.isInteger(duration_seconds)||duration_seconds<0||duration_seconds>86400)
   return res.status(400).json({error:'Check song fields and duration (0–86400 seconds).'});
  const {data,error}=await req.db.from('songs').insert({user_id:req.user.id,title:title.trim(),artist:artist.trim(),album:album.trim(),genre:genre.trim(),duration_seconds}).select().single();
  if(error)return dbError(res,error);res.status(201).json(data)
 }catch(e){next(e)}
});
app.delete('/api/songs/:id',async(req,res,next)=>{
 try{if(!uuid(req.params.id))return res.status(400).json({error:'Invalid ID.'});
 const {data,error}=await req.db.from('songs').delete().eq('id',req.params.id).select('id').maybeSingle();
 if(error)return dbError(res,error);if(!data)return res.status(404).json({error:'Song not found.'});res.json({ok:true})
 }catch(e){next(e)}
});
app.get('/api/playlists/:id/songs',async(req,res,next)=>{
 try{if(!uuid(req.params.id))return res.status(400).json({error:'Invalid ID.'});
 const {data:p,error:pe}=await req.db.from('playlists').select('id').eq('id',req.params.id).maybeSingle();
 if(pe)return dbError(res,pe);if(!p)return res.status(404).json({error:'Playlist not found.'});
 const {data,error}=await req.db.from('playlist_songs').select('song_id,added_at,songs(id,title,artist,album,genre,duration_seconds)').eq('playlist_id',req.params.id).order('added_at',{ascending:false});
 if(error)return dbError(res,error);res.json(data)
 }catch(e){next(e)}
});
app.post('/api/playlists/:id/songs',async(req,res,next)=>{
 try{const song_id=req.body?.song_id;if(!uuid(req.params.id)||!uuid(song_id))return res.status(400).json({error:'Invalid ID.'});
 const [{data:p},{data:s}]=await Promise.all([req.db.from('playlists').select('id').eq('id',req.params.id).maybeSingle(),req.db.from('songs').select('id').eq('id',song_id).maybeSingle()]);
 if(!p||!s)return res.status(404).json({error:'Playlist or song not found.'});
 const {error}=await req.db.from('playlist_songs').insert({playlist_id:req.params.id,song_id,user_id:req.user.id});
 if(error)return dbError(res,error);res.status(201).json({ok:true})
 }catch(e){next(e)}
});
app.delete('/api/playlists/:id/songs/:songId',async(req,res,next)=>{
 try{if(!uuid(req.params.id)||!uuid(req.params.songId))return res.status(400).json({error:'Invalid ID.'});
 const {data,error}=await req.db.from('playlist_songs').delete().eq('playlist_id',req.params.id).eq('song_id',req.params.songId).select('song_id').maybeSingle();
 if(error)return dbError(res,error);if(!data)return res.status(404).json({error:'Entry not found.'});res.json({ok:true})
 }catch(e){next(e)}
});
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found.'}));
app.use(express.static(path.join(__dirname,'..','frontend')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'..','frontend','index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Unexpected server error.'})});
app.listen(Number(process.env.PORT)||3000,()=>console.log(`Music Playlist Manager: http://localhost:${Number(process.env.PORT)||3000}`));
