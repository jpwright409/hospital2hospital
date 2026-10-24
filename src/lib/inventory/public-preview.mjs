// Fixed public query and narrow projection; never accept caller-selected facility,
// status, user IDs or object paths. The supplied client must be session-free anon.
export async function publicListingPreview(client) {
 const result=await client.rpc('search_inventory_v2',{p_query:'',p_sort:'newest',p_page:1,p_page_size:12,p_facility_id:null,p_saved:false,p_status:'active'});
 if(result.error||!Array.isArray(result.data?.items))throw new Error('Public inventory unavailable.');
 const listings=result.data.items.slice(0,12);
 if(listings.some(l=>l.status!=='active'||l.deleted_at!==null))throw new Error('Unexpected public inventory visibility.');
 if(!listings.length)return [];
 const photos=await client.from('listing_photos').select('listing_id,object_path,is_cover,position').in('listing_id',listings.map(l=>l.id)).eq('state','ready').order('is_cover',{ascending:false}).order('position').order('id');
 if(photos.error)throw new Error('Public photos unavailable.');
 const covers=new Map();for(const photo of photos.data??[])if(!covers.has(photo.listing_id))covers.set(photo.listing_id,photo.object_path);
 const paths=[...covers.values()];const urls=new Map();
 if(paths.length){
  const signed=await client.storage.from('listing-photos').createSignedUrls(paths,60);
  if(signed.error||!Array.isArray(signed.data)||signed.data.some(p=>p.error||!p.signedUrl))throw new Error('Public photos unavailable.');
  for(const p of signed.data??[])urls.set(p.path,p.signedUrl);
 }
 return listings.map(l=>({id:l.id,name:l.name,manufacturer:l.manufacturer,catalogNumber:l.catalog_number,
  priceUsd:l.price_usd,quantityUnit:l.quantity_unit,negotiable:l.price_negotiable,
  facilityName:l.facility.name,location:l.facility.state,
  photoUrl:urls.get(covers.get(l.id))??null}));
}
