import type { InstitutePublicProfile } from "@/lib/public-profile/types";

export const DEFAULT_PUBLIC_PROFILE: Omit<InstitutePublicProfile, "instituteId" | "updatedAt"> = {
  instituteName: "AMRPI",
  heroTitle: "Anjuman Moklesur Rahman Polytechnic Institute",
  heroTitleBn: "আঞ্জুমান মুকলেসুর রহমান পলিটেকনিক ইনস্টিটিউট",
  heroDescription: "Find published results, apply to an institute, track your application, and read official notices in one place.",
  overview:
    "Anjuman Moklesur Rahman Polytechnic Institute is a technical education institute in Shyamoli, Dhaka. The institute offers diploma-level technology programs and supports students in developing practical skills for further study and careers.",
  history:
    "Founded to expand access to career-focused technical education, AMRPI brings together academic instruction, practical learning, and student support. Its community works to prepare learners for the changing needs of industry and society.",
  leadership: [
    {
      id: "leader-advisor",
      name: "Professor Md. Khalilur Rahman",
      designation: "Honorable Advisor",
      bio: "Former Director General, NAEM.",
      imageUrl: "",
    },
    {
      id: "leader-donor",
      name: "Md. Mokhlesur Rahman",
      designation: "Donor & Honorable Advisor",
      bio: "Land and building donor.",
      imageUrl: "",
    },
    {
      id: "leader-principal",
      name: "Md. Golam Rahman",
      designation: "Principal (Acting)",
      bio: "Institute leadership.",
      imageUrl: "",
    },
  ],
  departments: [
    { id: "department-computer", name: "Diploma in Computer Technology", description: "Computing, software, and information technology." },
    { id: "department-civil", name: "Diploma in Civil Technology", description: "Civil engineering, construction, and infrastructure." },
    { id: "department-electrical", name: "Diploma in Electrical Technology", description: "Electrical systems, machines, and power." },
    { id: "department-automobile", name: "Diploma in Automobile Technology", description: "Vehicle systems, maintenance, and automotive technology." },
    { id: "department-non-tech", name: "Non-Tech Department", description: "General and supporting academic subjects." },
  ],
  services: [
    { id: "service-placement", name: "Job Placement", description: "Career guidance and job-placement information for diploma graduates.", url: "" },
    { id: "service-attachment", name: "Industrial Attachment", description: "Practical learning through industrial attachment and institutional linkages.", url: "" },
    { id: "service-stipend", name: "Stipend Form (SAF)", description: "Contact the institute office for the current DTE Student Application Form and submission guidance.", url: "" },
    { id: "service-basic-trade", name: "Basic Trade Course", description: "Contact the institute for current admission information for the 360-hour course.", url: "" },
  ],
  contact: {
    address: "2/Q Golden Street Road, Shyamoli, Dhaka",
    phones: ["+88-02222241190"],
    email: "info.amrpi@anjumanmibd.org",
  },
  links: [
    { id: "link-bteb", label: "BTEB", description: "Bangladesh Technical Education Board", url: "https://bteb.gov.bd/" },
    { id: "link-dte", label: "DTE", description: "Directorate of Technical Education", url: "https://techedu.gov.bd/" },
    { id: "link-ministry", label: "Ministry of Education", description: "Government of Bangladesh", url: "https://moedu.gov.bd/" },
  ],
};
