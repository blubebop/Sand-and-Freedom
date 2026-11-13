(function (root) {
  'use strict';
  const KEYS = ['sand_freedom_v1', 'sf_legacy', 'sf_tips_off'];
  const empty = () => ({version: 1, values: Object.fromEntries(KEYS.map(k => [k, null]))});
  function validate(p) {
    if (!p || p.version !== 1 || !p.values || JSON.stringify(p).length > 1000000) throw Error('Unsupported cloud save. Your local save is unchanged.');
    const result = empty();
    for (const k of KEYS) {
      const value = p.values[k];
      if (value !== null && typeof value !== 'string') throw Error('Invalid cloud save.');
      result.values[k] = value;
    }
    if (result.values.sand_freedom_v1) {
      const s = JSON.parse(result.values.sand_freedom_v1);
      if (s !== null && (!s.stats || typeof s.name !== 'string')) throw Error('Invalid character save.');
    }
    if (result.values.sf_legacy) {
      const l = JSON.parse(result.values.sf_legacy);
      if (!l || !Array.isArray(l.runs) || !l.ach || typeof l.ach !== 'object') throw Error('Invalid legacy save.');
    }
    return result;
  }
  const equal = (a,b) => JSON.stringify(validate(a)) === JSON.stringify(validate(b));
  class SaveEngine {
    constructor(storage, transport, changed = () => {}) {
      this.storage=storage; this.transport=transport; this.changed=changed;
      this.user=null; this.record=null; this.conflict=null; this.busy=false; this.generation=0;
    }
    key(id=this.user) {return 'sf_cloud_account:'+id;}
    guest() {const p=empty(); for(const k of KEYS) p.values[k]=this.storage.getItem(k); return validate(p);}
    persist() {this.storage.setItem(this.key(),JSON.stringify(this.record));}
    async connect(id) {
      this.generation++; this.user=id; this.conflict=null;
      const raw=this.storage.getItem(this.key());
      this.record=raw?JSON.parse(raw):{revision:0,payload:empty(),dirty:false};
      validate(this.record.payload);
      await this.pull();
      return !raw;
    }
    disconnect() {this.generation++; this.user=null; this.record=null; this.conflict=null;}
    getItem(k) {return this.user&&KEYS.includes(k)?this.record.payload.values[k]:this.storage.getItem(k);}
    setItem(k,v) {
      if(!this.user||!KEYS.includes(k)) return this.storage.setItem(k,v);
      const old=this.record; this.record={...old,payload:{...old.payload,values:{...old.payload.values,[k]:v}},dirty:true};
      try {this.persist();} catch(e) {this.record=old; throw e;} this.changed();
    }
    removeItem(k) {
      if(!this.user||!KEYS.includes(k)) return this.storage.removeItem(k);
      this.setItem(k,null); // A tombstone prevents a finished/dead run returning on another device.
    }
    async pull() {
      const generation=this.generation, user=this.user;
      const remote=await this.transport.read(user);
      if(generation!==this.generation) return;
      if(!remote) {if(this.record.revision>0) throw Error('Cloud save missing. Local progress preserved.');return;}
      remote.payload=validate(remote.payload);
      if(this.record.dirty && !equal(this.record.payload,remote.payload)) {
        if(remote.revision!==this.record.revision) this.conflict=remote;
      } else {
        this.record={revision:remote.revision,payload:remote.payload,dirty:false}; this.persist();
      }
    }
    async flush() {
      if(!this.user||this.busy||this.conflict||!this.record.dirty) return false;
      this.busy=true; const generation=this.generation, user=this.user;
      const snapshot=JSON.stringify(this.record.payload);
      try {
        const remote=await this.transport.write(user,this.record.revision,JSON.parse(snapshot));
        if(generation!==this.generation) return false;
        if(!remote) {await this.pull();return false;}
        this.record.revision=remote.revision;
        this.record.dirty=JSON.stringify(this.record.payload)!==snapshot;
        this.persist();return true;
      } finally {this.busy=false;}
    }
    resolve(useCloud) {
      if(!this.conflict) return;
      // Retain both alternatives locally before resolving.
      this.storage.setItem(this.key()+':conflict-backup',JSON.stringify({local:this.record,cloud:this.conflict}));
      this.record={revision:this.conflict.revision,payload:useCloud?this.conflict.payload:this.record.payload,dirty:!useCloud};
      this.conflict=null;this.persist();
    }
    importGuest() {
      this.storage.setItem(this.key()+':before-import',JSON.stringify(this.record));
      this.record={...this.record,payload:this.guest(),dirty:true};this.persist();
    }
  }
  root.SFSave={SaveEngine,validate,equal,empty,KEYS};
  if(typeof module!=='undefined') module.exports=root.SFSave;
})(typeof window==='undefined'?globalThis:window);
