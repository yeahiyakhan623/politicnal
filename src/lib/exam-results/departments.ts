import { POLYTECHNIC_DEPARTMENTS } from "../students/options.ts";

const DEPARTMENT_ALIASES: Record<string, string[]> = {
  "Computer Technology": ["computer", "cst"],
  "Civil Technology": ["civil"],
  "Electrical Technology": ["electrical"],
  "Mechanical Technology": ["mechanical"],
  "Electronics Technology": ["electronics"],
  "Power Technology": ["power"],
  "Marine Technology": ["marine"],
  "Architecture Technology": ["architecture"],
  "Foundry Technology": ["foundry", "foundry tech", "ft"],
};

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

const CANONICAL_DEPARTMENTS = new Map(
  [
    ...POLYTECHNIC_DEPARTMENTS.map((canonical) => [normalizedKey(canonical), canonical] as const),
    ...Object.entries(DEPARTMENT_ALIASES).flatMap(([canonical, aliases]) => [
      [normalizedKey(canonical), canonical] as const,
      ...aliases.map((alias) => [normalizedKey(alias), canonical] as const),
    ]),
  ],
);

export function canonicalDepartmentLabel(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return CANONICAL_DEPARTMENTS.get(normalizedKey(trimmed)) ?? trimmed;
}

export function departmentFilterValues(value: string) {
  const canonical = canonicalDepartmentLabel(value);
  const aliases = DEPARTMENT_ALIASES[canonical] ?? [];
  return [...new Set([canonical, ...aliases].map(normalizedKey))];
}

const COMMON_SUBJECTS = [
  ["Mathematics I", "Physics I", "English I"],
  ["Mathematics II", "Chemistry", "Bangla"],
  ["Mathematics III", "Physics II", "Business Communication"],
  ["Mathematics IV", "Applied Chemistry", "Engineering Economics"],
  ["Industrial Management", "Environmental Studies", "Accounting"],
  ["Entrepreneurship", "Quality Control", "Technical Documentation"],
  ["Project Planning", "Industrial Safety", "Professional Practice"],
  ["Industrial Training", "Project and Report Writing", "Employment Skills"],
] as const;

export function fallbackSubjects(semester: number, department: string) {
  const canonical = canonicalDepartmentLabel(department);
  const technology = canonical.replace(/\s+Technology$/i, "").trim() || canonical;
  const prefix = technology.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "TECH";
  const common = COMMON_SUBJECTS[semester - 1];
  if (!common) throw new RangeError("Semester must be between 1 and 8.");

  return [
    ...common.map((name, index) => ({
      code: `DEF-${prefix}-S${semester}-${String(index + 1).padStart(2, "0")}`,
      name,
      credits: 3,
    })),
    {
      code: `DEF-${prefix}-S${semester}-04`,
      name: `${technology} Technology`,
      credits: 3,
    },
    {
      code: `DEF-${prefix}-S${semester}-05`,
      name: `${technology} Technology Practical`,
      credits: 2,
    },
  ];
}
