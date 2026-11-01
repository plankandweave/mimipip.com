/**
 * The seven tier-1 cities a HomeLane store may be in.
 *
 * HomeLane's programme with us covers metros only (decided 22 September 2026),
 * so their Stores page offers these as a dropdown instead of a free-text city,
 * and the API refuses anything else for that account. Other partners — Vijay
 * Sales has a store in Bhosari — keep the free-text field.
 *
 * The city decides the state, and the state decides which GSTIN the invoice is
 * raised under, so the state is fixed here rather than typed: Pune can only be
 * Maharashtra. Delhi NCR is the one city that straddles states, so it lists the
 * three and the admin picks which (Gurugram is Haryana, Noida is UP).
 */

export type Tier1City = {
  city: string;
  /** Every state the city can legitimately sit in. One entry = locked. */
  states: readonly string[];
};

export const TIER1_CITIES: readonly Tier1City[] = [
  { city: "Delhi NCR",  states: ["Delhi", "Haryana", "Uttar Pradesh"] },
  { city: "Mumbai",     states: ["Maharashtra"] },
  { city: "Bengaluru",  states: ["Karnataka"] },
  { city: "Hyderabad",  states: ["Telangana"] },
  { city: "Chennai",    states: ["Tamil Nadu"] },
  { city: "Kolkata",    states: ["West Bengal"] },
  { city: "Pune",       states: ["Maharashtra"] },
] as const;

/** Partner slugs whose stores are held to the tier-1 list. Design Cafe was
 *  set up as HomeLane's duplicate (15 October 2026), city gate included. */
export const TIER1_ONLY_PARTNERS: readonly string[] = ["homelane", "design-cafe"];

export function tier1OnlyPartner(slug: string | null | undefined): boolean {
  return !!slug && TIER1_ONLY_PARTNERS.includes(slug);
}

export function tier1City(city: string | null | undefined): Tier1City | null {
  const c = (city ?? "").trim().toLowerCase();
  return TIER1_CITIES.find((t) => t.city.toLowerCase() === c) ?? null;
}

/**
 * Null when the pair is allowed; otherwise the message to show the admin.
 * Case-insensitive on both, so a row saved as "pune" still passes.
 */
export function tier1Problem(city: string | null | undefined, state: string | null | undefined): string | null {
  const t = tier1City(city);
  if (!t) {
    return `HomeLane stores can only be in ${TIER1_CITIES.map((x) => x.city).join(", ")}.`;
  }
  const s = (state ?? "").trim().toLowerCase();
  if (!t.states.some((x) => x.toLowerCase() === s)) {
    return t.states.length === 1
      ? `${t.city} is in ${t.states[0]} — the GSTIN is resolved from that.`
      : `${t.city} must be in one of ${t.states.join(", ")}.`;
  }
  return null;
}

// ── The city a HomeLane person signs in for (Roheena, 8 October 2026) ──────
//
// "If designers have to always, when they log in, select a city, it'll be
// only those cities that the orders can be taken from at their end." So every
// HomeLane sign-in picks one of the seven (stored on the session, see
// corporate_sessions.city), and an order whose delivery address is somewhere
// else is stopped with a message asking the designer to fix it — never placed
// and never silently corrected.
//
// The address is judged by its PIN code, not its wording. A designer writes
// "Andheri West" or "Whitefield", and a street can be called "Old Mumbai–Pune
// Highway"; the first three PIN digits say where the parcel actually goes. The
// lists are the metro AND the towns that are part of it in daily speech (Thane
// and Navi Mumbai are Mumbai; Gurugram and Noida are Delhi NCR), and are
// generous on purpose: a wrongly refused order is a designer stuck in front of
// a customer, while a city outside the seven is stopped by the PIN either way.

/** First three PIN digits that deliver inside each city. */
export const TIER1_PIN_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  // Delhi; Faridabad; Gurugram; Noida, Greater Noida and Ghaziabad.
  "Delhi NCR": ["110", "121", "122", "201"],
  // Mumbai and suburbs, Thane, Mira–Bhayandar, Vasai–Virar; Navi Mumbai and
  // Panvel; Kalyan, Dombivli and Bhiwandi.
  "Mumbai": ["400", "401", "410", "421"],
  // The city, and its edges (Hoskote, Devanahalli, Anekal, Attibele).
  "Bengaluru": ["560", "562"],
  // Hyderabad and Secunderabad, and the outer ring (Shamshabad, Patancheru).
  "Hyderabad": ["500", "501", "502"],
  // Chennai, and Tiruvallur, Sriperumbudur and Chengalpattu along its edges.
  "Chennai": ["600", "601", "602", "603"],
  // Kolkata, Howrah, Hooghly riverside and North/South 24 Parganas (Salt Lake,
  // New Town).
  "Kolkata": ["700", "711", "712", "743"],
  // Pune and Pimpri-Chinchwad; Chakan and Talegaon; the rural ring.
  "Pune": ["411", "412", "410"],
};

/** Names people write for each city, all lowercase. The canonical name is
 *  included so a plain match needs no special case. */
const CITY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "Delhi NCR": ["delhi ncr", "delhi", "new delhi", "ncr", "gurugram", "gurgaon", "noida", "greater noida", "ghaziabad", "faridabad"],
  "Mumbai": ["mumbai", "bombay", "navi mumbai", "thane", "mira road", "bhayandar", "vasai", "virar", "kalyan", "dombivli", "panvel"],
  "Bengaluru": ["bengaluru", "bangalore"],
  "Hyderabad": ["hyderabad", "secunderabad", "cyberabad"],
  "Chennai": ["chennai", "madras"],
  "Kolkata": ["kolkata", "calcutta", "howrah", "salt lake", "new town", "bidhannagar"],
  "Pune": ["pune", "poona", "pimpri", "chinchwad", "pimpri chinchwad", "pimpri-chinchwad"],
};

/** The tier-1 city a typed city name means, or null if it is none of them.
 *  "Gurgaon" is Delhi NCR; "Bangalore" is Bengaluru. */
export function tier1CityFor(name: string | null | undefined): Tier1City | null {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return null;
  const hit = Object.entries(CITY_ALIASES).find(([, names]) => names.includes(n));
  return hit ? tier1City(hit[0]) : null;
}

/** Which of the seven a PIN delivers in, or null. Where two cities share a
 *  prefix (410: Panvel is Mumbai, Talegaon is Pune) the first listed wins —
 *  used only to NAME the other city in a message, never to accept an order. */
export function tier1CityForPin(pin: string | null | undefined): string | null {
  const p = (pin ?? "").trim();
  if (!/^\d{6}$/.test(p)) return null;
  return TIER1_CITIES.find((t) => TIER1_PIN_PREFIXES[t.city]?.includes(p.slice(0, 3)))?.city ?? null;
}

export type OrderAddress = {
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
};

/**
 * Null when this delivery address is inside the city the person signed in
 * for; otherwise the sentence to show them, saying what to fix.
 *
 * Three things must agree with the chosen city: the city written on the order,
 * the dispatch state (it picks the GSTIN), and the PIN code (it is where the
 * parcel actually goes).
 */
export function orderCityProblem(chosen: string | null | undefined, address: OrderAddress): string | null {
  const city = tier1City(chosen);
  if (!city) {
    return `Choose your city before placing an order. Orders can only be taken for ${TIER1_CITIES.map((x) => x.city).join(", ")}.`;
  }

  const typed = (address.city ?? "").trim();
  const typedCity = tier1CityFor(typed);
  if (typedCity && typedCity.city !== city.city) {
    return `This order is for ${typed}, but you signed in for ${city.city}. Correct the delivery city, or change your city to ${typedCity.city}.`;
  }
  if (!typedCity) {
    return `${typed ? `"${typed}" is` : "The delivery city is"} not in ${city.city}. Orders from this sign-in can only be delivered in ${city.city}.`;
  }

  const state = (address.state ?? "").trim().toLowerCase();
  if (!city.states.some((s) => s.toLowerCase() === state)) {
    return city.states.length === 1
      ? `${city.city} is in ${city.states[0]}. Correct the dispatch state.`
      : `${city.city} must be dispatched to one of ${city.states.join(", ")}. Correct the dispatch state.`;
  }

  const pin = (address.pincode ?? "").trim();
  if (!/^\d{6}$/.test(pin)) return "Enter the 6-digit PIN code of the delivery address.";
  if (!TIER1_PIN_PREFIXES[city.city]?.includes(pin.slice(0, 3))) {
    const elsewhere = tier1CityForPin(pin);
    return elsewhere
      ? `PIN ${pin} is in ${elsewhere}, not ${city.city}. Correct the address, or change your city to ${elsewhere}.`
      : `PIN ${pin} is outside ${city.city}. Orders can only be delivered in ${TIER1_CITIES.map((x) => x.city).join(", ")}; please correct the address.`;
  }
  return null;
}
