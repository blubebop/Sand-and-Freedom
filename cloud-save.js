/* Supabase Auth + revision-checked saves. No administrator credentials. */
(() => {
  'use strict';
  let client, timer, booting=true, sessionUser=null, status='Connecting…', switching=false, tabBlocked=false;
  const engine=new SFSave.SaveEngine(localStorage, {
    async read(user) {
      const {data,error}=await client.from('game_saves').select('revision,payload,updated_at').eq('user_id',user).maybeSingle();
      if(error) throw error; return data;
    },
    async write(user,revision,payload) {
      const {data:{session}}=await client.auth.getSession();
      if(session?.user.id!==user) throw Error('Please sign in again.');
      const {data,error}=await client.rpc('save_game',{expected_revision:revision,save_payload:payload});
      if(error) throw error; return data?.[0]||null;
    }
  },()=>{status='Saved on this device · syncing…';paint();clearTimeout(timer);timer=setTimeout(sync,1000);});
  window.sfStorage={
    getItem:k=>engine.getItem(k),
    setItem:(k,v)=>{if(tabBlocked)throw Error('Game open in another tab');try{engine.setItem(k,v);}catch(e){status='Could not save on this device';paint();throw e;}},
    removeItem:k=>{if(tabBlocked)throw Error('Game open in another tab');engine.removeItem(k);}
  };
  const el=id=>document.getElementById(id);
  function paint() {
    if(!el('sf-cloud-status'))return;
    el('sf-cloud-status').textContent=engine.conflict?'Different progress found on another device':status;
    el('sf-account').textContent=sessionUser?'Account & saves':'Sign in / cloud saves';
  }
  function message(text) {el('sf-message').textContent=text;}
  function open() {
    if(window.sfCanSwitch&&!window.sfCanSwitch()){status='Finish the current fight before changing saves';paint();return;}
    el('sf-dialog').showModal();refreshDialog();
  }
  function refreshDialog() {
    el('sf-login').hidden=!!sessionUser;
    el('sf-signed').hidden=!sessionUser;
    el('sf-conflict').hidden=!engine.conflict;
    el('sf-email-label').textContent=sessionUser?.email||'';
    el('sf-import').hidden=!sessionUser||!engine.guest().values.sand_freedom_v1;
    if(engine.conflict) message('Both copies are preserved locally. Choose which progress to continue.');
  }
  async function sync() {
    if(!sessionUser||switching||tabBlocked)return;
    try {
      await engine.flush();
      status=engine.conflict?'Choose a save to continue':engine.record.dirty?'Saved on this device · waiting to sync':'Cloud saved';
      if(engine.conflict&&window.sfCanSwitch?.())open();
    } catch(e) {status='Saved on this device · cloud unavailable';}
    paint();
  }
  async function activate(user) {
    if(switching||user?.id===sessionUser?.id)return;
    if(!booting&&!window.sfCanSwitch?.()){status='Account changed. Finish this fight, then reload to sync.';paint();return;}
    switching=true;document.getElementById('app').inert=true;
    try {
      if(user) {
        sessionUser=user;
        await engine.connect(user.id);
        status=engine.conflict?'Choose a save to continue':engine.record.dirty?'Saved on this device · syncing…':'Cloud saved';
      } else {engine.disconnect();sessionUser=null;status='Playing as guest · saved on this device';}
      window.sfReloadGame?.();
      if(engine.conflict)open();
    } catch(e) {status='Cloud unavailable · local progress retained'; window.sfReloadGame?.();}
    finally {switching=false;document.getElementById('app').inert=tabBlocked;paint();refreshDialog();}
    if(user&&!engine.conflict)await sync();
  }
  async function bootstrap() {
    document.getElementById('app').insertAdjacentHTML('beforebegin',`<aside id="sf-cloud-bar"><span id="sf-cloud-status" role="status" aria-live="polite"></span><button id="sf-account" type="button">Sign in / cloud saves</button></aside>
    <dialog id="sf-dialog" aria-labelledby="sf-title"><h2 id="sf-title">Your road to freedom</h2><p>Sign in on any device to continue your saved game. Cloud progress resumes from the last saved checkpoint.</p>
    <div id="sf-login"><form id="sf-send"><label>Email<input id="sf-email" type="email" autocomplete="email" required maxlength="254"></label><button type="submit">Email me a sign-in link</button></form><p>Open the email link on this device. No password needed.</p><form id="sf-verify"><label>Code from email (if provided)<input id="sf-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required></label><button type="submit">Verify code</button></form></div>
    <div id="sf-signed" hidden><p id="sf-email-label"></p><button id="sf-sync">Save to cloud now</button><button id="sf-check">Check other devices</button><button id="sf-import">Use this device’s guest progress</button><button id="sf-signout">Sign out</button></div>
    <div id="sf-conflict" hidden><h3>Choose your progress</h3><button id="sf-use-cloud">Continue the cloud save</button><button id="sf-use-local">Keep this device’s save</button></div>
    <p id="sf-message" role="status" aria-live="polite"></p><button id="sf-close">Back to game</button></dialog>`);
    const style=document.createElement('style');style.textContent='#sf-cloud-bar{max-width:960px;margin:8px auto 0;padding:8px 12px;background:var(--panel);border:1px solid var(--edge);display:flex;gap:12px;align-items:center;justify-content:space-between;font-size:12px}#sf-dialog{background:var(--panel);color:var(--txt);border:2px solid var(--edge);max-width:480px;width:calc(100% - 24px);max-height:90vh;overflow:auto}#sf-dialog::backdrop{background:#000b}#sf-dialog label{display:block;margin:12px 0}#sf-dialog input{display:block;width:100%;margin-top:6px}#sf-dialog button{margin:4px}#sf-dialog [hidden]{display:none}#sf-message{color:var(--gold)}';document.head.append(style);
    el('sf-account').onclick=open;el('sf-close').onclick=()=>el('sf-dialog').close();
    el('sf-send').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
      if(!client)throw Error('Sign-in is unavailable. Please try again shortly.');
      const {error}=await client.auth.signInWithOtp({email:el('sf-email').value.trim(),options:{emailRedirectTo:location.origin+location.pathname}});
      if(error)throw error;message('Check your email for a sign-in link. You can continue playing as a guest while you wait.');
    }catch(e){message(e.message);}finally{b.disabled=false;}};
    el('sf-verify').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
      if(!client)throw Error('Sign-in unavailable.');
      const {data,error}=await client.auth.verifyOtp({email:el('sf-email').value.trim(),token:el('sf-code').value.trim(),type:'email'});
      if(error)throw error;message('Signed in.');await activate(data.user);
    }catch(e){message(e.message);}finally{b.disabled=false;}};
    el('sf-sync').onclick=sync;
    el('sf-check').onclick=async()=>{try{if(engine.busy)return;await engine.pull();if(!engine.conflict)window.sfReloadGame();refreshDialog();await sync();}catch(e){message('Could not check cloud saves. Your local progress is safe.');}};
    el('sf-import').onclick=async()=>{if(engine.busy)return;if(!confirm('Replace this account’s current progress with the guest game on this device? The old copy will be backed up locally.'))return;engine.importGuest();window.sfReloadGame();await sync();};
    el('sf-use-cloud').onclick=()=>{engine.resolve(true);window.sfReloadGame();status='Cloud saved';refreshDialog();paint();};
    el('sf-use-local').onclick=async()=>{engine.resolve(false);refreshDialog();await sync();};
    el('sf-signout').onclick=async()=>{await sync();if(engine.busy||engine.record?.dirty||engine.conflict){message('Resolve or sync your pending save before signing out.');return;}const {error}=await client.auth.signOut({scope:'local'});if(error){message(error.message);return;}await activate(null);};
    paint();
    // One writable game tab per browser origin avoids local-cache races.
    if(navigator.locks)navigator.locks.request('sf-game-tab',{ifAvailable:true},lock=>{if(!lock){tabBlocked=true;document.getElementById('app').inert=true;el('sf-account').disabled=true;status='Game already open in another tab. Close it, then reload this page.';paint();return;}return new Promise(()=>{});});
    try {
      const config=window.SF_CLOUD_CONFIG;
      client=supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal||AbortSignal.timeout(15000)})}});
      document.getElementById('app').inert=true;
      const {data,error}=await client.auth.getSession();if(error)throw error;
      await activate(data.session?.user||null);
      if(!data.session)status='Playing as guest · saved on this device';
      client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(()=>activate(session?.user||null),0);});
    }catch(e){status='Playing offline · cloud sign-in unavailable';}
    finally{booting=false;document.getElementById('app').inert=tabBlocked;paint();}
    setInterval(sync,15000);addEventListener('online',sync);
    addEventListener('pagehide',()=>{void sync();});
    addEventListener('beforeunload',e=>{if(engine.record?.dirty){e.preventDefault();e.returnValue='';}});
  }
  window.sfCloudBoot=bootstrap;
})();
