export const states = Object.entries({AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'}).map(([code,name])=>({code,name}));
export const expirationStatuses = [
 {value:'in_date',label:'In-Date (>12 months)'},
 {value:'short_date',label:'Short-Date (<12 months)'},
 {value:'expired',label:'EXPIRED'},
];
export function parseStates(value) {
 return [...new Set((Array.isArray(value)?value:typeof value==='string'?value.split(','):[]).slice(0,50).map(v=>String(v).trim().toUpperCase()).filter(v=>states.some(s=>s.code===v)))].sort();
}
export function expirationMatches(expiration,status,today=new Date().toISOString().slice(0,10)) {
 if(!status)return true;if(!expiration)return false;
 const cutoff=new Date(today+'T00:00:00Z');const day=cutoff.getUTCDate();cutoff.setUTCDate(1);cutoff.setUTCFullYear(cutoff.getUTCFullYear()+1);const month=cutoff.getUTCMonth();cutoff.setUTCDate(day);if(cutoff.getUTCMonth()!==month)cutoff.setUTCDate(0);
 if(status==='expired')return expiration<today;
 if(status==='short_date')return expiration>=today&&expiration<=cutoff.toISOString().slice(0,10);
 return status==='in_date'&&expiration>cutoff.toISOString().slice(0,10);
}
