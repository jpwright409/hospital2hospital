export const registrationTermsVersion = 'placeholder-2026-11-04';
export function registrationDeclaration(form) {
 const npi=String(form.get('facility_npi')??'').trim();
 if(!/^\d{10}$/.test(npi))throw Object.assign(new Error('Enter the facility’s 10-digit NPI.'),{code:'registration_required'});
 if(form.get('authorized_facility')!=='yes'||form.get('accept_terms')!=='yes')throw Object.assign(new Error('Certify your authority to register this facility and accept the Terms and Conditions.'),{code:'registration_required'});
 return {facility_npi:npi,authorized_facility:true,terms_accepted:true,terms_version:registrationTermsVersion};
}
