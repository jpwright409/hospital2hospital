export type FacilityStatus = "pending" | "approved" | "rejected" | "suspended";
export type MembershipRole = "owner" | "administrator" | "inventory_editor" | "viewer";
export type Facility = {
  id: string;
  name: string;
  city: string;
  state: string;
  facility_type: "hospital" | "surgery_center" | "surgical_hospital" | "physician_office" | "other";
  status: FacilityStatus;
  owner_user_id: string;
  review_reason: string | null;
  created_at: string;
};
export type Membership = {
  user_id: string;
  facility_id: string;
  role: MembershipRole;
  status: "active" | "revoked";
};

// UI capability calculation only. SQL policies/RPCs independently enforce these
// checks with current database rows, never trusting this value or JWT role metadata.
export function facilityCapabilities(userId: string | null, facility: Facility | null, membership: Membership | null) {
  const member = !!userId && !!facility && membership?.user_id === userId &&
    membership.facility_id === facility.id && membership.status === "active";
  const approved = member && facility?.status === "approved";
  return {
    canViewStatus: member,
    canPublish: approved && (membership?.role === "inventory_editor" || (membership?.role === "owner" && facility?.owner_user_id === userId)),
    canInquire: approved && (membership?.role === "administrator" || membership?.role === "inventory_editor" || (membership?.role === "owner" && facility?.owner_user_id === userId)),
    // Ownership is not platform administration.
    isOwner: member && membership?.role === "owner" && facility?.owner_user_id === userId,
  };
}

export function safeCallbackDestination(value: string | null) {
  return value === "/auth/update-password" ? value : "/marketplace";
}

export function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
