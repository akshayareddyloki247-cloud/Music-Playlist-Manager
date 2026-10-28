const $=id=>document.getElementById(id);
let session=null, playlists=[], songs=[], selected=null, register=false;
const msg=t=>{$('message').textContent=t;};
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e}
function button(label,action,cls='secondary'){const b=node('button',label,cls);b.type='button';b.onclick=action;return b}
async function api(url,method='GET',body,auth=true){
 const headers={};if(body!==undefined)headers['Content-Type']='application/json';
 if(auth&&session)headers.Authorization=`Bearer ${session.access_token}`;
 let r=await fetch('/api'+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 let data=await r.json().catch(()=>({error:'Invalid server response.'}));
 if(r.status===401&&auth&&session?.refresh_token){
  const rr=await fetch('/api/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
  if(rr.ok){session=(await rr.json()).session;return api(url,method,body,auth)}
  logout();throw Error('Session expired. Please log in again.');
 }
 if(!r.ok)throw Error(data.error||'Request failed');return data;
}
async function run(fn){try{msg('');await fn()}catch(e){msg(e.message)}}
function login(s){session=s;$('auth').hidden=true;$('dashboard').hidden=false;$('account').hidden=false;$('who').textContent=s.user?.email||'Signed in';load()}
function logout(){session=null;selected=null;$('auth').hidden=false;$('dashboard').hidden=true;$('account').hidden=true;msg('Logged out.')}
$('logout').onclick=logout;
$('switchAuth').onclick=()=>{register=!register;$('authButton').textContent=register?'Sign up':'Log in';$('switchAuth').textContent=register?'Already registered? Log in':'Create an account'};
$('authForm').onsubmit=e=>{e.preventDefault();run(async()=>{const s=await api(register?'/auth/signup':'/auth/login','POST',{email:$('email').value.trim(),password:$('password').value},false);if(s.session)login(s.session);else msg(s.message||'Check your email.');$('password').value=''})};
async function load(){await run(async()=>{[playlists,songs]=await Promise.all([api('/playlists'),api('/songs')]);renderPlaylists();renderSongs();if(selected&&playlists.some(p=>p.id===selected))await showPlaylist(selected);else{$('selectedTitle').textContent='Select a playlist';$('selectedDescription').textContent='';$('addToPlaylist').hidden=true;$('playlistSongs').replaceChildren()}})}
$('playlistForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/playlists','POST',{name:$('playlistName').value,description:$('playlistDescription').value});e.target.reset();msg('Playlist created.');await load()})};
$('songForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/songs','POST',{title:$('title').value,artist:$('artist').value,album:$('album').value,genre:$('genre').value,duration_seconds:Number($('duration').value)});e.target.reset();$('duration').value=0;msg('Song saved.');await load()})};
$('search').oninput=renderSongs;
function renderPlaylists(){const box=$('playlists');box.replaceChildren();if(!playlists.length)box.append(node('p','No playlists yet.','empty'));
 for(const p of playlists){const item=node('div',undefined,'item'),info=node('div'),acts=node('div',undefined,'actions');info.append(node('strong',p.name),node('small',p.description||'No description'));acts.append(button('Open',()=>run(()=>showPlaylist(p.id))),button('Rename',()=>run(async()=>{const name=prompt('New playlist name:',p.name);if(name===null)return;await api('/playlists/'+p.id,'PATCH',{name});await load()})),button('Delete',()=>run(async()=>{if(!confirm(`Delete playlist "${p.name}"? Songs remain in your library.`))return;await api('/playlists/'+p.id,'DELETE');if(selected===p.id)selected=null;await load()}),'danger'));item.append(info,acts);box.append(item)}}
function renderSongs(){const box=$('songs'),q=$('search').value.toLowerCase();box.replaceChildren();const found=songs.filter(s=>[s.title,s.artist,s.album,s.genre].join(' ').toLowerCase().includes(q));if(!found.length)box.append(node('p','No matching songs.','empty'));for(const s of found){const item=node('div',undefined,'item'),info=node('div');info.append(node('strong',s.title),node('small',`${s.artist} · ${s.album||'No album'} · ${s.genre||'No genre'} · ${Math.floor(s.duration_seconds/60)}:${String(s.duration_seconds%60).padStart(2,'0')}`));item.append(info,button('Delete',()=>run(async()=>{if(!confirm(`Delete "${s.title}" from your library and playlists?`))return;await api('/songs/'+s.id,'DELETE');await load()}),'danger'));box.append(item)}}
async function showPlaylist(id){selected=id;const p=playlists.find(x=>x.id===id);if(!p)return;const entries=await api('/playlists/'+id+'/songs');$('selectedTitle').textContent=p.name;$('selectedDescription').textContent=p.description||'Your playlist';$('addToPlaylist').hidden=false;const choices=$('songChoice');choices.replaceChildren();const used=new Set(entries.map(e=>e.song_id));for(const s of songs.filter(x=>!used.has(x.id))){const o=node('option',`${s.title} — ${s.artist}`);o.value=s.id;choices.append(o)}$('addToPlaylist').querySelector('button').disabled=!choices.options.length;
 const box=$('playlistSongs');box.replaceChildren();if(!entries.length)box.append(node('p','This playlist is empty. Add a song above.','empty'));for(const e of entries){if(!e.songs)continue;const item=node('div',undefined,'item');item.append(node('span',`${e.songs.title} — ${e.songs.artist}`),button('Remove',()=>run(async()=>{await api('/playlists/'+id+'/songs/'+e.song_id,'DELETE');await showPlaylist(id)}),'danger'));box.append(item)}}
$('addToPlaylist').onsubmit=e=>{e.preventDefault();run(async()=>{if(!selected||!$('songChoice').value)return;await api('/playlists/'+selected+'/songs','POST',{song_id:$('songChoice').value});msg('Song added to playlist.');await showPlaylist(selected)})};
