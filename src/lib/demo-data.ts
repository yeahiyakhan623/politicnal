export type Student = {
  name: string;
  email: string;
  roll: string;
  registration: string;
  department: string;
  semester: number;
  attendance: string;
};

export const initialStudents: Student[] = [
  { name: "Ayesha Rahman", email: "ayesha.r@example.edu.bd", roll: "230104", registration: "2023-30104", department: "CST", semester: 1, attendance: "96%" },
  { name: "Tanvir Hasan", email: "tanvir.h@example.edu.bd", roll: "230108", registration: "2023-30108", department: "CST", semester: 1, attendance: "92%" },
  { name: "Nusrat Jahan", email: "nusrat.j@example.edu.bd", roll: "230112", registration: "2023-30112", department: "CST", semester: 1, attendance: "98%" },
  { name: "Rafiul Islam", email: "rafiul.i@example.edu.bd", roll: "230117", registration: "2023-30117", department: "CST", semester: 1, attendance: "89%" },
  { name: "Sadia Akter", email: "sadia.a@example.edu.bd", roll: "230121", registration: "2023-30121", department: "CST", semester: 1, attendance: "94%" },
  { name: "Mahmudul Karim", email: "mahmud.k@example.edu.bd", roll: "230125", registration: "2023-30125", department: "CST", semester: 1, attendance: "91%" },
  { name: "Fahim Chowdhury", email: "fahim.c@example.edu.bd", roll: "230207", registration: "2023-30207", department: "CST", semester: 2, attendance: "88%" },
  { name: "Maliha Sultana", email: "maliha.s@example.edu.bd", roll: "230209", registration: "2023-30209", department: "CST", semester: 2, attendance: "95%" },
  { name: "Imran Hossain", email: "imran.h@example.edu.bd", roll: "230302", registration: "2023-30302", department: "CST", semester: 3, attendance: "93%" },
  { name: "Jannatul Ferdous", email: "jannatul.f@example.edu.bd", roll: "230401", registration: "2023-30401", department: "CST", semester: 4, attendance: "97%" },
];
