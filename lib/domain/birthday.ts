/**
 * Birthday helpers — pure functions over an ISO date.
 */

export function isBirthdayToday(dateOfBirth: string | null, now: Date = new Date()): boolean {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return false;
  return dob.getMonth() === now.getMonth() && dob.getDate() === now.getDate();
}

export function ageOn(dateOfBirth: string | null, on: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return null;
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

export function daysUntilNextBirthday(
  dateOfBirth: string | null,
  now: Date = new Date(),
): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return null;
  const next = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next.setFullYear(next.getFullYear() + 1);
  }
  const ms = next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
