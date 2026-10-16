import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {serviceError} from "@/lib/auth/server";
import {ActionForm} from "./account-forms";
import {discardListingSetup} from "@/app/wizard-actions";
export async function WizardSetupDrafts({facilityId}:{facilityId:string}){
 const result=await (await createClient()).from("listing_wizard_drafts").select("id,revision,updated_at,products(name,catalog_number)").eq("facility_id",facilityId).is("listing_id",null).is("published_at",null).order("updated_at",{ascending:false}).limit(100);
 if(result.error)throw new Error(serviceError(result.error));if(!result.data.length)return null;
 return <section className="panel wizard-setup-drafts"><h2>Continue a listing setup</h2><p>These private drafts have incomplete details and are not stock or public listings.</p>{result.data.map(d=>{const product=d.products as unknown as {name:string;catalog_number:string};return <div key={d.id} className="wizard-setup-row"><div><strong>{product.name}</strong><p>CAT # {product.catalog_number}</p></div><Link className="button secondary" href={`/listings/new?draft=${d.id}`}>Resume setup</Link><details><summary>Discard setup</summary><ActionForm action={discardListingSetup} submit="Delete setup draft"><input type="hidden" name="id" value={d.id}/><input type="hidden" name="revision" value={d.revision}/><p>This removes the saved setup details. No stock or photos have been created.</p></ActionForm></details></div>;})}</section>;
}
