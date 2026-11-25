export type ExamSubjectInput = {
  instituteId: string;
  semester: number;
  department: string;
  name: string;
  code: string;
  maximumMarks: number;
};

export type ExamResultInput = {
  instituteId: string;
  subjectId: string;
  examName: string;
  examYear: number;
  examFullMarks: number;
  records: {
    studentId: string;
    marks: number;
  }[];
};
