// Trusted operator fixture setup, never an application path or seller grant.
// Catalog references must preexist now that seller proposals require approval.
export async function seedApprovedProducts(db,products){
 const role=(await db.query('select current_user as name')).rows[0].name;
 if(role!=='postgres')throw new Error('Catalog fixtures require the test database operator.');
 for(const p of products){
  await db.query('insert into public.manufacturers(name) values($1) on conflict(normalized_name) do nothing',[p.manufacturer]);
  await db.query(`insert into public.products(manufacturer_id,catalog_number,name,category,description,product_kind)
   select id,$2,$3,$4,$5,$6 from public.manufacturers where normalized_name=public.normalize_identity($1)
   on conflict(manufacturer_id,normalized_catalog_number) do nothing`,[p.manufacturer,p.catalog_number,p.name,p.category,p.description??'',p.product_kind??null]);
 }
}
