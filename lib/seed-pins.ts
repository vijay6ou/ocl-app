/** Server-only seed PINs. Do not import from client components. */
export const SEED_PINS: Record<string, string> = {
  admin: "1826",
  "ramesh.k": "1144",
  "priya.m": "2255",
  "suresh.n": "3366",
  "anjali.p": "0909",
  sabanna: "2471",
  nagesh: "3582",
  pawan: "4693",
  vijay: "5704",
};

export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;

export function isFourDigitPin(value: string) {
  return /^\d{4}$/.test(value);
}
