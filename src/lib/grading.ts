export type GradeRule = {
  letterGrade: string;
  minimumPercent: number;
  maximumPercent: number;
  gradePoint: number;
  isPassing: boolean;
};

export type SubjectMarks = {
  written: number;
  mcq: number;
  practical: number;
};

export type SubjectMarkScheme = {
  maximum: SubjectMarks;
  passMarks: number;
};

export type SubjectResult = {
  totalMarks: number;
  maximumMarks: number;
  percentage: number;
  letterGrade: string;
  gradePoint: number;
  isPassing: boolean;
};

export type GradedSubject = {
  credit: number;
  gradePoint: number;
};

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

export function validateGradeRules(rules: readonly GradeRule[]) {
  if (rules.length === 0) {
    throw new Error("At least one grading rule is required.");
  }

  const sorted = [...rules].sort((a, b) => a.minimumPercent - b.minimumPercent);
  let expectedMinimum = 0;
  const seenGrades = new Set<string>();

  for (const rule of sorted) {
    const grade = rule.letterGrade.trim();
    if (!grade) throw new Error("Every grading rule needs a letter grade.");
    if (seenGrades.has(grade)) throw new Error(`The grade ${grade} is configured more than once.`);
    seenGrades.add(grade);
    assertFinite(rule.minimumPercent, `${grade} minimum percentage`);
    assertFinite(rule.maximumPercent, `${grade} maximum percentage`);
    assertFinite(rule.gradePoint, `${grade} grade point`);

    if (rule.minimumPercent !== expectedMinimum || rule.maximumPercent <= rule.minimumPercent || rule.maximumPercent > 100) {
      throw new Error("Grading rules must cover 0–100 without gaps or overlaps.");
    }
    if (rule.gradePoint < 0 || rule.gradePoint > 5) {
      throw new Error(`${grade} grade point must be between 0 and 5.`);
    }
    expectedMinimum = rule.maximumPercent;
  }

  if (expectedMinimum !== 100) {
    throw new Error("Grading rules must cover the full 0–100 percentage range.");
  }

  return sorted;
}

export function calculateSubjectResult(
  marks: SubjectMarks,
  scheme: SubjectMarkScheme,
  gradeRules: readonly GradeRule[],
): SubjectResult {
  const components: (keyof SubjectMarks)[] = ["written", "mcq", "practical"];
  for (const component of components) {
    assertFinite(marks[component], `${component} marks`);
    assertFinite(scheme.maximum[component], `Maximum ${component} marks`);
    if (marks[component] < 0 || marks[component] > scheme.maximum[component]) {
      throw new Error(`${component} marks must be between 0 and ${scheme.maximum[component]}.`);
    }
    if (scheme.maximum[component] < 0) {
      throw new Error(`Maximum ${component} marks cannot be negative.`);
    }
  }

  const maximumMarks = components.reduce((total, component) => total + scheme.maximum[component], 0);
  const totalMarks = components.reduce((total, component) => total + marks[component], 0);
  assertFinite(scheme.passMarks, "Pass marks");
  if (maximumMarks <= 0) throw new Error("The subject must have a positive maximum mark.");
  if (scheme.passMarks < 0 || scheme.passMarks > maximumMarks) {
    throw new Error(`Pass marks must be between 0 and ${maximumMarks}.`);
  }

  const percentage = (totalMarks / maximumMarks) * 100;
  const sortedRules = validateGradeRules(gradeRules);
  const grade = sortedRules.find((rule, index) =>
    percentage >= rule.minimumPercent &&
    (percentage < rule.maximumPercent || (index === sortedRules.length - 1 && percentage <= rule.maximumPercent)),
  );
  if (!grade) throw new Error("No grading rule matches the calculated percentage.");

  return {
    totalMarks,
    maximumMarks,
    percentage,
    letterGrade: grade.letterGrade,
    gradePoint: grade.gradePoint,
    isPassing: totalMarks >= scheme.passMarks && grade.isPassing,
  };
}

export function calculateGpa(subjects: readonly GradedSubject[]) {
  if (subjects.length === 0) throw new Error("At least one graded subject is required.");

  let totalCredits = 0;
  let weightedPoints = 0;
  for (const subject of subjects) {
    assertFinite(subject.credit, "Subject credit");
    assertFinite(subject.gradePoint, "Subject grade point");
    if (subject.credit <= 0) throw new Error("Subject credits must be greater than zero.");
    if (subject.gradePoint < 0 || subject.gradePoint > 5) {
      throw new Error("Subject grade points must be between 0 and 5.");
    }
    totalCredits += subject.credit;
    weightedPoints += subject.credit * subject.gradePoint;
  }

  return {
    totalCredits,
    gpa: Math.round((weightedPoints / totalCredits) * 100) / 100,
  };
}
