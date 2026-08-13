/**
 * Natural ordering for free-form seat `position` strings such as "1A", "10B",
 * or plain numeric positions like "13" — leading digits compared numerically,
 * trailing letters compared lexicographically. A plain lexicographic sort
 * (including Mongo's default string `.sort({ position: 1 })`) would place
 * "10" before "2", which silently mismatches the seatNumber the frontend
 * computes with this exact same algorithm (see tourMapper.ts comparePosition)
 * — any place that resolves a client-supplied 1-based seatNumber back to a
 * seat MUST sort with this, never a raw Mongo sort.
 */
export function comparePosition(a: string, b: string): number {
  const parse = (pos: string): [number, string] => {
    const match = /^(\d*)(.*)$/.exec(pos.trim())
    const digits = match?.[1] ?? ""
    return [digits === "" ? Number.MAX_SAFE_INTEGER : Number(digits), match?.[2] ?? ""]
  }
  const [aNum, aRest] = parse(a)
  const [bNum, bRest] = parse(b)
  if (aNum !== bNum) return aNum - bNum
  return aRest.localeCompare(bRest)
}
