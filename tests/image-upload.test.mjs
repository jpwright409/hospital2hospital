import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import {validatePhoto,MAX_PHOTO_BYTES} from '../src/lib/photos/image.ts';
let source=await readFile(new URL('../src/lib/photos/pipeline.ts',import.meta.url),'utf8');
source=source.replace('"./image"',JSON.stringify(new URL('../src/lib/photos/image.ts',import.meta.url).href));
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {uploadValidatedPhoto,cleanupPhoto}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
test('actual JPEG/PNG/WebP decode and sanitized re-encoding reject SVG, fake MIME, damaged and oversized input',async()=>{
  for(const format of ['jpeg','png','webp']) {
    const input=await sharp({create:{width:40,height:30,channels:3,background:'#118899'}}).toFormat(format).toBuffer();
    const result=await validatePhoto(input);assert.equal((await sharp(result.data).metadata()).format,'webp');assert.equal(result.width,40);assert.equal(result.height,30);
  }
  await assert.rejects(validatePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),/Only actual/);
  await assert.rejects(validatePhoto(Buffer.from('not an image')),/Only actual/);
  await assert.rejects(validatePhoto(Buffer.from([255,216,255,1,2,3])),/decoded safely/);
  await assert.rejects(validatePhoto(Buffer.alloc(MAX_PHOTO_BYTES+1)),/3 MB/);
});
function fakeClients({uploadError,finalizeError,cleanupError,claimPath='facility/listing/photo.webp'}={}) {
  const calls=[];
  const user={rpc:async()=>({data:{id:'photo-id',object_path:'facility/listing/photo.webp'},error:null}),storage:{from:bucket=>({upload:async(path)=>{calls.push(['upload',bucket,path]);return {error:uploadError};}})}};
  const admin={rpc:async(name,args)=>{calls.push([name,args]);return name==='finalize_listing_photo' ? {error:finalizeError} : name==='claim_photo_cleanup' ? {data:claimPath,error:null} : {error:null};},storage:{from:bucket=>({remove:async(paths)=>{calls.push(['remove',bucket,paths]);return {error:cleanupError};}})}};
  return {user,admin,calls};
}
test('failed Storage upload and failed finalization compensate only their exact reservation path',async()=>{
  for(const scenario of [{uploadError:new Error('upload failed')},{finalizeError:new Error('finalize failed')}]) {
    const {user,admin,calls}=fakeClients(scenario);
    await assert.rejects(uploadValidatedPhoto(user,admin,'listing',{data:Buffer.from('validated'),width:1,height:1,size:9}));
    assert.deepEqual(calls.find(c=>c[0]==='remove'),['remove','listing-photos',['facility/listing/photo.webp']]);
    assert.ok(calls.some(c=>c[0]==='finish_photo_cleanup'));
  }
});
test('cleanup failures retain journal rows; a ready row or lost successful response is never deleted',async()=>{
  const failed=fakeClients({uploadError:new Error('upload failed'),cleanupError:new Error('remove failed')});
  await assert.rejects(uploadValidatedPhoto(failed.user,failed.admin,'listing',{data:Buffer.from('x'),width:1,height:1,size:1}),/cleanup is pending/);
  assert.equal(failed.calls.some(c=>c[0]==='finish_photo_cleanup'),false);
  const committed=fakeClients({claimPath:null});await cleanupPhoto(committed.admin,'photo-id',false);
  assert.equal(committed.calls.some(c=>c[0]==='remove'),false);
});
