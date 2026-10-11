import { readFile, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Minimal read-only OOXML reader using Node built-ins. No macros, external links,
// workbook evaluation, network, credentials, or stock/pricing inference.
function unzip(buffer) {
  const files = new Map();
  let end = buffer.length-22;
  while (end >= Math.max(0,buffer.length-65557) && buffer.readUInt32LE(end)!==0x06054b50) end--;
  if(end<0) throw new Error("Not a supported ZIP workbook.");
  let offset = buffer.readUInt32LE(end+16);
  const count = buffer.readUInt16LE(end+10);
  for(let i=0;i<count;i++) {
    if(buffer.readUInt32LE(offset)!==0x02014b50) throw new Error("Invalid workbook ZIP index.");
    const method=buffer.readUInt16LE(offset+10), size=buffer.readUInt32LE(offset+20);
    const nameLength=buffer.readUInt16LE(offset+28), extra=buffer.readUInt16LE(offset+30), comment=buffer.readUInt16LE(offset+32);
    const name=buffer.subarray(offset+46,offset+46+nameLength).toString();
    const local=buffer.readUInt32LE(offset+42);
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    const body=buffer.subarray(start,start+size);
    if(size>10000000) throw new Error("Workbook entry exceeds import safety limit.");
    if(method!==0 && method!==8) throw new Error("Unsupported ZIP compression.");
    files.set(name,(method===8 ? inflateRawSync(body,{maxOutputLength:10000000}) : body).toString("utf8"));
    offset+=46+nameLength+extra+comment;
  }
  return files;
}
const xmlText = value => value.replace(/<[^>]*>/g,"").replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&").trim();
export const normalize = value => value.trim().replace(/\s+/g," ").toLowerCase();
export async function readCatalog(file) {
  const files=unzip(await readFile(file));
  const shared=[...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>xmlText(m[1]));
  const records=new Map(); const conflicts=[]; let rows=0,duplicates=0;
  for(const [name,xml] of [...files].filter(([name])=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()) {
    let headers;
    for(const match of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row={};
      for(const cell of match[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref=cell[1].match(/\br="([A-Z]+)\d+"/)?.[1]; if(!ref) continue;
        const value=cell[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        row[ref]=/\bt="s"/.test(cell[1]) ? shared[Number(value)] ?? "" : xmlText(value ?? cell[2] ?? "");
      }
      if(!headers) { if(Object.values(row).some(v=>/^SKU\s*\/\s*Catalog\s*#$/i.test(v)) && Object.values(row).some(v=>/^(manufacturer\s*\/\s*brand|brand\s*\/\s*manufacturer)$/i.test(v))) headers=row; continue; }
      const column = regex => Object.keys(headers).find(k=>regex.test(headers[k]));
      const manufacturer=row[column(/manufacturer\s*\/\s*brand|brand\s*\/\s*manufacturer/i)] ?? "";
      const catalog_number=row[column(/SKU\s*\/\s*Catalog/i)] ?? "";
      if(!manufacturer || !catalog_number) continue;
      rows++;
      const description=row[column(/manufacturer description/i)] ?? "";
      const record={manufacturer,catalog_number,name:description.slice(0,180).trim() || catalog_number,
        category:row[column(/^category$/i)] || "Uncategorized",description,
        gtin:row[column(/^GTIN/i)] || null, reference_source:row[column(/^source$/i)] || null};
      if(manufacturer.length>120 || catalog_number.length>100 || description.length>4000 || record.category.length>100) throw new Error(`Reference exceeds schema limits: ${manufacturer} / ${catalog_number}`);
      const key=JSON.stringify([normalize(manufacturer),normalize(catalog_number)]);
      if(records.has(key)) {
        duplicates++; const existing=records.get(key);
        if(normalize(existing.description)!==normalize(record.description) || existing.category!==record.category) conflicts.push({manufacturer,catalog_number,sheet:name,handling:"first record retained; no overwrite"});
        // First sheet is authoritative; later duplicates never overwrite metadata.
      } else records.set(key,record);
    }
  }
  if(!records.size) throw new Error("No catalog records found. Check workbook header format.");
  const products=[...records.values()];
  return {products,summary:{source_rows:rows,unique_products:products.length,unique_manufacturers:new Set(products.map(p=>normalize(p.manufacturer))).size,duplicate_rows:duplicates,conflicts,listings_created:0,prices_created:0,facilities_created:0}};
}
const literal = value => value == null ? "null" : "'"+value.replace(/'/g,"''")+"'";
export function catalogSql(products) {
  return `-- Reference catalog only. Run as database operator after Phase 2 migrations.\n-- Idempotent: existing shared records remain unchanged. No facility stock.\nbegin;\ncreate temporary table reference_catalog_import(manufacturer text,catalog_number text,name text,category text,description text,gtin text,reference_source text) on commit drop;\ninsert into reference_catalog_import values\n${products.map(p=>"("+[p.manufacturer,p.catalog_number,p.name,p.category,p.description,p.gtin,p.reference_source].map(literal).join(",")+")").join(",\n")};\nwith inserted as (insert into public.manufacturers(name) select distinct on(public.normalize_identity(manufacturer)) manufacturer from reference_catalog_import order by public.normalize_identity(manufacturer) on conflict(normalized_name) do nothing returning id) select count(*) as manufacturers_inserted from inserted;\nwith inserted as (insert into public.products(manufacturer_id,catalog_number,name,category,description,gtin,reference_source) select m.id,r.catalog_number,r.name,r.category,r.description,r.gtin,r.reference_source from reference_catalog_import r join public.manufacturers m on m.normalized_name=public.normalize_identity(r.manufacturer) on conflict(manufacturer_id,normalized_catalog_number) do nothing returning id) select count(*) as products_inserted, (select count(*) from reference_catalog_import)-count(*) as existing_products_preserved from inserted;\ncommit;\n`;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  const outputIndex=args.indexOf("--output-sql");
  if(outputIndex>=0 && !args[outputIndex+1]) throw new Error("Provide a file path after --output-sql.");
  const workbookIndex=args.indexOf("--workbook");
  const file=workbookIndex>=0 ? args[workbookIndex+1] : fileURLToPath(new URL("../project_sources/RevMed_SKU_Category_Brand_Reference_v2.xlsx",import.meta.url));
  const result=await readCatalog(file);
  console.log(JSON.stringify({mode:outputIndex>=0 ? "generate SQL; not applied" : "dry run; no files or database changes",...result.summary},null,2));
  if(outputIndex>=0) await writeFile(args[outputIndex+1],catalogSql(result.products),{flag:"wx"});
}
