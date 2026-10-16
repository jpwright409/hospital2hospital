import {authenticatedClient} from "@/lib/auth/server";
import {getAppMode} from "@/lib/app-mode";
import {catalogProducts} from "@/lib/inventory/server";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
 try{
  if(getAppMode()!=="connected")return Response.json({error:"Connected inventory required."},{status:404,headers});
  const {supabase,user}=await authenticatedClient();if(!user?.email_confirmed_at)return Response.json({error:"Sign in to choose a product."},{status:401,headers});
  const params=new URL(request.url).searchParams;const permission=await supabase.rpc("wizard_can_manage",{p_facility_id:params.get("facility")});
  if(permission.error||!permission.data)return Response.json({error:"An approved facility and active owner or inventory editor membership are required."},{status:403,headers});
  return Response.json({products:await catalogProducts((params.get("q")??"").slice(0,100))},{headers});
 }catch{return Response.json({error:"The catalog could not be loaded. Retry."},{status:503,headers});}
}
