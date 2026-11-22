import {requireUser} from "@/lib/auth/server";
import {catalogProducts} from "@/lib/inventory/server";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request) {
 try {
  await requireUser();
  const query=new URL(request.url).searchParams.get("q")??"";
  if(query.length>100)return Response.json({error:"Search with 100 characters or fewer."},{status:400,headers});
  const products=await catalogProducts(query);
  return Response.json({products:products.map(p=>({id:p.id,name:p.name,catalog_number:p.catalog_number,manufacturer:p.manufacturer}))},{headers});
 } catch {return Response.json({error:"Sign in and retry the catalog search."},{status:503,headers});}
}
