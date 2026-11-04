"use client";
export function RegistrationFields({npi=""}:{npi?:string}) {
 return <div className="registration-declarations">
  <label>Facility NPI<input name="facility_npi" type="text" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} required defaultValue={npi} autoComplete="off"/><small>Enter your facility’s 10-digit NPI. Our team reviews the facility before approval.</small></label>
  <label className="declaration-checkbox"><input type="checkbox" name="authorized_facility" value="yes" required/>I certify that I am an authorized employee/officer of this facility with authority to register this account.</label>
  <div className="registration-terms" role="region" aria-label="Terms and Conditions" tabIndex={0}><h3>Terms and Conditions</h3><p>Terms and Conditions</p></div>
  <small>Placeholder — final Terms and Conditions will be provided.</small>
  <label className="declaration-checkbox"><input type="checkbox" name="accept_terms" value="yes" required/>Accept Terms and Conditions</label>
 </div>;
}
