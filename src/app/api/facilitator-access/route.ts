import {authenticatedClient,serviceError} from "@/lib/auth/server";
import {getAppMode} from "@/lib/app-mode";

export async function GET(){
  const headers={"Cache-Control":"private, no-store",Vary:"Cookie"};
  try{
    if(getAppMode()!=="connected")return Response.json({isPlatformAdministrator:false},{headers});
    const {supabase,user}=await authenticatedClient();
    if(!user?.email_confirmed_at)return Response.json({isPlatformAdministrator:false},{headers});
    // Caller-only live database permission; never trust role metadata or input.
    const {data,error}=await supabase.rpc("is_platform_administrator");
    if(error)throw error;
    return Response.json({isPlatformAdministrator:data===true},{headers});
  }catch(error){return Response.json({isPlatformAdministrator:false,error:serviceError(error)},{status:503,headers});}
}
