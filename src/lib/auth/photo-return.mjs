// Only this exact local destination may follow phone-login handoff.
export function photoReturnPath(value) {
  return typeof value === "string" && /^\/listings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/photos$/i.test(value)
    ? value : "/marketplace";
}
