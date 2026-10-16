import {createClient} from '@supabase/supabase-js';
import {emitKeypressEvents} from 'node:readline';
import {createInterface} from 'node:readline/promises';
import {TARGET_EMAIL,PROJECT_ORIGIN,recoveryConfig,findRecoveryAccount,resetRecoveryPassword,validatePassword} from './owner-password-recovery.mjs';

// Input is never echoed, placed in command arguments, environment or files.
function hiddenPassword(prompt) {
  const input=process.stdin,output=process.stdout;
  output.write(prompt);
  emitKeypressEvents(input);
  const wasRaw=input.isRaw;
  input.setRawMode(true);input.resume();
  return new Promise((resolve,reject)=>{
    const characters=[];
    function finish(error) {
      input.off('keypress',onKey);process.off('SIGTERM',cancel);
      input.setRawMode(wasRaw??false);input.pause();output.write('\n');
      const value=characters.join('');characters.fill('');
      if(error)reject(error);else resolve(value);
    }
    function cancel(){finish(new Error('Recovery cancelled. Nothing was changed.'));}
    function onKey(text,key) {
      if ((key?.ctrl && ['c','d'].includes(key.name)) || key?.name==='escape') return cancel();
      if (key?.name==='return' || key?.name==='enter') return finish();
      if (key?.name==='backspace') {characters.pop();return;}
      if (!key?.ctrl && !key?.meta && text && !/[\u0000-\u001f\u007f-\u009f]/u.test(text)) {
        characters.push(...text);
      }
    }
    input.on('keypress',onKey);process.once('SIGTERM',cancel);
  });
}

async function main() {
  const args=process.argv.slice(2);
  if(args.some(arg=>!['--execute','--help'].includes(arg))) throw new Error('Use --execute or --help only. Never pass a password as an argument.');
  if(args.includes('--help')) {
    console.log('Local check: node --env-file=.env.local scripts/recover-owner-password.mjs');
    console.log('Interactive reset: append --execute. Password entry is hidden. Ctrl+C cancels.');
    return;
  }
  const config=recoveryConfig(process.env);
  if(!args.includes('--execute')) {
    console.log(JSON.stringify({mode:'local configuration check only; no service connection or password change',target:TARGET_EMAIL,project:PROJECT_ORIGIN,configured:config.configured}));
    return;
  }
  if(!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this interactively in your own terminal. Piped password input is not supported.');
  if(!config.configured) throw new Error('Set the expected project URL and server-only SUPABASE_SECRET_KEY in ignored .env.local. This tool is restricted to the existing Hospital2Hospital project.');
  console.log(`Project: ${PROJECT_ORIGIN}\nAccount: ${TARGET_EMAIL}`);
  console.log('This changes only the existing account password. Email confirmation, MFA and facility/platform permissions are not changed.');
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  let confirmation;
  try {confirmation=await terminal.question(`Type ${TARGET_EMAIL} to continue, or press Enter to cancel: `);}
  finally {terminal.close();}
  if(confirmation!==TARGET_EMAIL) throw new Error('Recovery cancelled. Nothing was changed.');
  const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const account=await findRecoveryAccount(client.auth.admin);
  console.log('Account verified. Type your new password below; no characters or asterisks will appear.');
  let password='',repeat='';
  try {
    password=await hiddenPassword('New password (12-128 characters): ');
    validatePassword(password);
    repeat=await hiddenPassword('Repeat new password: ');
    if(password!==repeat) throw new Error('Passwords did not match. Nothing was changed.');
    await resetRecoveryPassword(client.auth.admin,account.id,password);
  } finally {password='';repeat='';}
  console.log('Password updated successfully. Log in at https://hospital2hospital.vercel.app using your new password.');
  console.log('Normal email recovery still needs its SMTP/template configuration checked separately.');
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
