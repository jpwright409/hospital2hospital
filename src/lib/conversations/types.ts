export type Conversation = {id:string;listing_id:string;buyer_facility_id:string;seller_facility_id:string;buyer_name:string;seller_name:string;name:string;catalog_number:string;listing_status:string;unread?:number;updated_at?:string};
export type ConversationMessage = {id:string;sequence:number;author_user_id:string;author_facility_id:string;author_label:string;body:string;created_at:string};
export type ConversationPage = {conversation:Conversation;messages:ConversationMessage[];has_older:boolean};
