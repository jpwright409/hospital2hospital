import QRCode from "qrcode";
import {authenticatedClient} from "@/lib/auth/server";
import {getAppMode,getSiteUrl} from "@/lib/app-mode";
import {validUuid} from "@/lib/auth/policy";
import {listingPhotos} from "@/lib/photos/server";

const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    if(getAppMode()!=="connected")return Response.json({error:"Connected inventory is required."},{status:404,headers});
    const {id}=await params;if(!validUuid(id))return Response.json({error:"Listing unavailable."},{status:404,headers});
    const {supabase,user}=await authenticatedClient();
    if(!user?.email_confirmed_at)return Response.json({error:"Sign in with a confirmed account to manage photos."},{status:401,headers});
    const permission=await supabase.rpc("photo_can_manage",{p_listing_id:id});
    if(permission.error)throw permission.error;
    if(!permission.data)return Response.json({error:"Photo access is unavailable. Check your facility approval and membership."},{status:403,headers});
    if(new URL(request.url).searchParams.get("handoff")==="1") {
      const url=`${getSiteUrl()}/listings/${id}/photos`;
      return Response.json({url,qr:await QRCode.toDataURL(url,{width:256,margin:4,errorCorrectionLevel:"M"})},{headers});
    }
    return Response.json({photos:await listingPhotos([id],true)},{headers});
  } catch {return Response.json({error:"Photos could not be refreshed. Retry and check the account and Storage service."},{status:503,headers});}
}
