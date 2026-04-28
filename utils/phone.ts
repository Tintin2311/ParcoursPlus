import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/min";

/** Formatte en national selon le pays (espaces, etc.) */
export function formatLocal(iso2: string, input: string) {
  const digits = input.replace(/[^\d]/g, "");
  return new AsYouType(iso2 as any).input(digits);
}

/** Convertit un numéro local en E.164 (+33XXXXXXXXX). Retourne "" si invalide. */
export function toE164(iso2: string, local: string) {
  const digits = local.replace(/[^\d]/g, "");
  if (!digits) return "";
  const parsed = parsePhoneNumberFromString(digits, iso2 as any);
  return parsed?.isValid() ? parsed.number : "";
}
