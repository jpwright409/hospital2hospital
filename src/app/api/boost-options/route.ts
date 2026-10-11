import { authenticatedClient, serviceError } from "@/lib/auth/server";
import { getAppMode } from "@/lib/app-mode";
export async function GET() {
 const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
 try {
  if (getAppMode() !== "connected") return Response.json({error:"Boost review requires a connected account."},{status:400,headers});
  const {supabase,user}=await authenticatedClient();
  if (!user?.email_confirmed_at) return Response.json({error:"Log in with a confirmed account."},{status:401,headers});
  const result=await supabase.rpc("my_boost_options");
  if(result.error) return Response.json({error:serviceError(result.error)},{status:503,headers});
  return Response.json({facilities:result.data},{headers});
 } catch(error){return Response.json({error:serviceError(error)},{status:503,headers});}
}
