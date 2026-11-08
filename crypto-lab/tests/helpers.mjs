import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createSaltaIdentity, createSaltaScope, EncryptedRepository, fingerprintPublicKey, serializeIdentityPublicKey } from "../../security/crypto/index.js";

const migration = await readFile(new URL("../migrations/0001_e2ee_schema.sql", import.meta.url), "utf8");

export class MemoryD1Statement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) { return new MemoryD1Statement(this.database,this.sql,params); }
  all() {
    const result=this.database.sqlite.prepare(this.sql).all(...this.params);
    return {results:result,success:true};
  }
  first() { return this.database.sqlite.prepare(this.sql).get(...this.params) ?? null; }
  run() {
    const result=this.database.sqlite.prepare(this.sql).run(...this.params);
    return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
  }
}

export class MemoryD1 {
  constructor() {
    this.sqlite=new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.sqlite.exec(migration);
  }
  prepare(sql) { return new MemoryD1Statement(this,sql); }
}

export function localWorkerRequest(path, { method="GET", body, actor, hostname="127.0.0.1" }={}) {
  const headers=new Headers({ "Origin":"http://127.0.0.1:8788" });
  if(actor)headers.set("X-SALTA-Lab-Principal",actor);
  if(body!==undefined)headers.set("Content-Type","application/json");
  return new Request("http://"+hostname+":8788"+path,{
    method,
    headers,
    body:body===undefined?undefined:JSON.stringify(body)
  });
}

export async function createFixture(db) {
  const tenantA="tenant-lab-alpha";
  const tenantB="tenant-lab-beta";
  const scopeA="scope-lab-class-alpha";
  const scopeB="scope-lab-class-beta";
  const ids={
    owner:"teacher-lab-owner",
    colleague:"teacher-lab-colleague",
    outsider:"teacher-lab-outsider",
    noAccess:"teacher-lab-no-access"
  };
  const identities={};
  for(const id of Object.values(ids)) identities[id]=await createSaltaIdentity({tenantId:id===ids.outsider?tenantB:tenantA,userId:id,keyVersion:1});
  db.prepare("INSERT INTO tenants(id,status) VALUES(?,'active')").bind(tenantA).run();
  db.prepare("INSERT INTO tenants(id,status) VALUES(?,'active')").bind(tenantB).run();
  for(const [userId,identity] of Object.entries(identities)) {
    const tenant=userId===ids.outsider?tenantB:tenantA;
    const raw=await serializeIdentityPublicKey(identity.identity.publicKey);
    const fingerprint=await fingerprintPublicKey(raw);
    db.prepare("INSERT INTO principals(id,public_key,key_alg,key_version,fingerprint,status) VALUES(?,?,?,?,?,'active')")
      .bind(userId,identity.publicKey,"DHKEM(P-256,HKDF-SHA256)",1,fingerprint).run();
    db.prepare("INSERT INTO memberships(id,tenant_id,principal_id,role,status) VALUES(?,?,?,?,'active')")
      .bind("membership-"+userId,tenant,userId,userId===ids.owner?"tenant_admin":"teacher").run();
  }
  db.prepare("INSERT INTO cryptographic_scopes(id,tenant_id,scope_type,academic_year,status,key_version) VALUES(?,?,'class',2026,'active',1)")
    .bind(scopeA,tenantA).run();
  db.prepare("INSERT INTO cryptographic_scopes(id,tenant_id,scope_type,academic_year,status,key_version) VALUES(?,?,'class',2026,'active',1)")
    .bind(scopeB,tenantB).run();
  const grants=[
    [tenantA,scopeA,ids.owner,1,1,1],
    [tenantA,scopeA,ids.colleague,1,1,0],
    [tenantA,scopeA,ids.noAccess,0,0,0],
    [tenantB,scopeB,ids.outsider,1,1,1]
  ];
  for(const [tenant,scope,user,read,write,share] of grants) {
    db.prepare("INSERT INTO scope_grants(tenant_id,scope_id,principal_id,membership_id,can_read,can_write,can_share) VALUES(?,?,?,?,?,?,?)")
      .bind(tenant,scope,user,"membership-"+user,read,write,share).run();
  }
  const scopeKeys=await createSaltaScope({
    tenantId:tenantA,
    scopeId:scopeA,
    keyVersion:1,
    recipients:[
      {recipientId:ids.owner,publicKey:identities[ids.owner].identity.publicKey,confirmedFingerprint:await fingerprintPublicKey(await serializeIdentityPublicKey(identities[ids.owner].identity.publicKey))},
      {recipientId:ids.colleague,publicKey:identities[ids.colleague].identity.publicKey,confirmedFingerprint:await fingerprintPublicKey(await serializeIdentityPublicKey(identities[ids.colleague].identity.publicKey))}
    ]
  });
  return {tenantA,tenantB,scopeA,scopeB,ids,identities,scopeKeys};
}

export function createWorkerEnv(db, { labMode="local-only" }={}) {
  return { SALTA_E2EE_LAB:labMode, E2EE_DB:db };
}

export function repositoryFor({ identity, userId, tenantId, scopeId, membershipId, keyVersion=1, scopeKey, permissions, db, worker, spy, labPrincipalHeader=true }) {
  const fetchImpl=async (input,init={})=>{
    const request=input instanceof Request?input:new Request(new URL(input,"http://127.0.0.1:8788"),init);
    if(spy){
      const cloned=request.clone();
      const text=await cloned.text();
      spy.push({method:request.method,url:new URL(request.url).pathname+new URL(request.url).search,body:text});
    }
    return worker.fetch(request,createWorkerEnv(db));
  };
  return new EncryptedRepository({
    endpoint:"http://127.0.0.1:8788",
    actorId:userId,
    membershipId,
    tenantId,
    scopeId,
    keyVersion,
    scopeKey,
    permissions,
    fetchImpl,
    labPrincipalHeader
  });
}

export async function postEnvelope(worker,db,actor,envelope) {
  return worker.fetch(localWorkerRequest("/v1/envelopes",{method:"POST",body:envelope,actor}),createWorkerEnv(db));
}
