export type StudentStatus = "active" | "inactive" | "pending" | "rejected";

export type StudentRecord = {
  id: string;
  fullName: string;
  rollNumber: string;
  registrationNumber: string;
  email: string | null;
  studentPhone: string | null;
  guardianName: string | null;
  guardianContact: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  isActive: boolean;
  approvalStatus: "pending" | "approved" | "rejected";
  status: StudentStatus;
  semester: number;
  department: string | null;
  sessionYear: string | null;
  createdAt: string;
};

export type StudentListResponse = {
  data: StudentRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  instituteId: string;
  stats: {
    totalStudents: number;
    activeStudents: number;
    pendingStudents: number;
  };
  semesterCounts: { semester: number; count: number }[];
  departmentCounts: { semester: number; department: string; count: number }[];
  sessionYears: string[];
};
