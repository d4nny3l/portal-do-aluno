// Offline operator primitive, NOT an API, backup exporter or application recovery.
// Caller must keep the library closed and supply an independently held, current
// fence manifest + its separately approved SHA-256 and freshness cutoff.
import {createHash} from 'node:crypto';
export const fenceHash=manifest=>createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
export function reconcileRestoredDatabase(sqlite,manifest,{approvedSha256,minimumCapturedAt}={}){
 if(!/^[a-f0-9]{64}$/.test(approvedSha256||'')||fenceHash(manifest)!==approvedSha256||
    manifest?.schemaVersion!=='salta-lifecycle-fences-v1'||!Number.isFinite(minimumCapturedAt)||
    !Number.isFinite(Date.parse(manifest.capturedAt))||Date.parse(manifest.capturedAt)<minimumCapturedAt||
    !Array.isArray(manifest.fences))throw Error('Independent current fence evidence required; keep service closed');
 const keys=['assessment_id','owner_id','institution_id','class_id','period_id','revision_floor','deleted','updated_at'];
 const seen=new Set();
 for(const f of manifest.fences){
  if(Object.keys(f).sort().join()!==[...keys].sort().join()||keys.slice(0,5).some(k=>typeof f[k]!=='string'||!f[k])||
    !Number.isSafeInteger(f.revision_floor)||f.revision_floor<1||![0,1].includes(f.deleted)||!Number.isFinite(Date.parse(f.updated_at))||seen.has(f.assessment_id))throw Error('Invalid fence manifest');
  seen.add(f.assessment_id);
 }
 const present=sqlite.prepare('SELECT * FROM av_lifecycle_fences').all();
 for(const f of present){const witness=manifest.fences.find(x=>x.assessment_id===f.assessment_id);
  if(!witness||witness.revision_floor<f.revision_floor||witness.deleted<f.deleted)throw Error('Fence witness is incomplete or stale');
 }
 sqlite.exec('BEGIN IMMEDIATE');
 try{
  for(const f of manifest.fences){
   const a=sqlite.prepare('SELECT * FROM av_assessments WHERE id=?').get(f.assessment_id);
   if(a){
    if(['owner_id','institution_id','class_id','period_id'].some(k=>a[k]!==f[k]))throw Error('Restored scope mismatch');
    if(sqlite.prepare('SELECT 1 FROM av_retention_holds WHERE assessment_id=?').get(a.id))throw Error('Retention hold requires independent decision');
    if(!f.deleted&&(a.current_revision!==f.revision_floor||!sqlite.prepare('SELECT 1 FROM av_revisions WHERE assessment_id=? AND revision=?').get(a.id,f.revision_floor)))throw Error('Newest definition absent: never fall back to replaced content');
    sqlite.prepare('INSERT INTO av_purge_guards VALUES(?,?,?,?,?)').run(a.id,a.owner_id,a.current_revision,'offline-restore',f.deleted?'delete':'replace');
    sqlite.prepare('DELETE FROM av_selections WHERE assessment_id=?').run(a.id);
    sqlite.prepare('DELETE FROM av_revisions WHERE assessment_id=? AND (?=1 OR revision<?)').run(a.id,f.deleted,f.revision_floor);
    sqlite.prepare('DELETE FROM av_purge_guards WHERE assessment_id=?').run(a.id);
    if(f.deleted)sqlite.prepare('DELETE FROM av_assessments WHERE id=?').run(a.id);
   }else if(!f.deleted)throw Error('Current definition missing; keep service closed');
   sqlite.prepare('INSERT INTO av_lifecycle_fences VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id) DO UPDATE SET revision_floor=excluded.revision_floor,deleted=excluded.deleted,updated_at=excluded.updated_at').run(...keys.map(k=>f[k]));
  }
  if(sqlite.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key failure');
  sqlite.exec('COMMIT');
 }catch(e){sqlite.exec('ROLLBACK');throw e;}
 return {checked:manifest.fences.length,serviceMayBeActivated:false};
}
