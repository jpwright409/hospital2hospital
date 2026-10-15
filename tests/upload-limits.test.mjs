import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {validatePhoto} from '../src/lib/photos/image.ts';
import {MAX_IMAGE_UPLOAD_BYTES, MAX_SERVER_ACTION_BYTES, imageUploadSizeError} from '../src/lib/upload-limits.mjs';

test('the 3 MB boundary is accepted; one byte over is rejected before decoding', async () => {
  const jpeg = await sharp({create:{width:40,height:30,channels:3,background:'#118899'}}).jpeg().toBuffer();
  const atLimit = Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES);
  jpeg.copy(atLimit);
  assert.equal(imageUploadSizeError(atLimit.length), '');
  const image = await validatePhoto(atLimit);
  assert.equal((await sharp(image.data).metadata()).format, 'webp');
  assert.match(imageUploadSizeError(MAX_IMAGE_UPLOAD_BYTES + 1), /3 MB/);
  await assert.rejects(validatePhoto(Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1)), /3 MB/);
  assert.equal(imageUploadSizeError(0), ''); // Optional screenshots/headshots.
});

test('maximum image plus support form and multipart overhead fits below both request limits', async () => {
  const form = new FormData();
  form.set('screenshot', new File([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES)], 'screenshot.png', {type:'image/png'}));
  form.set('ticket_id', '00000000-0000-4000-8000-000000000001');
  form.set('contact_name', '界'.repeat(120));
  form.set('contact_email', 'a'.repeat(242) + '@example.com');
  form.set('contact_phone', '1'.repeat(40));
  form.set('facility_name', '界'.repeat(160));
  form.set('issue', '界'.repeat(5000));
  form.set('$ACTION_ID_test', '');
  const request = new Request('https://example.test/help', {method:'POST', body:form});
  const bytes = (await request.arrayBuffer()).byteLength;
  assert.ok(bytes > MAX_IMAGE_UPLOAD_BYTES);
  assert.ok(bytes < MAX_SERVER_ACTION_BYTES);
  assert.ok(MAX_SERVER_ACTION_BYTES < 4_500_000);
});
