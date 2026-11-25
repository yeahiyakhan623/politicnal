export function normalizeStudentName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
}

export function studentNameMatches(directoryName: string | null, submittedName: string) {
  if (!directoryName) return false;
  return normalizeStudentName(directoryName) === normalizeStudentName(submittedName);
}
