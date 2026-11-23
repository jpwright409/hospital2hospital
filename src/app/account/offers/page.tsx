import {PurchaseOffersPage} from "@/components/purchase-offers";
import type {SearchParams} from "@/lib/inventory/types";
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){return <PurchaseOffersPage params={await searchParams}/>;}
