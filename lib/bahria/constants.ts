export const BAHRIA_BASE_URL = process.env.BAHRIA_BASE_URL || "https://cms.bahria.edu.pk";
export const LMS_BASE_URL = "https://lms.bahria.edu.pk";
export const LOGIN_PATH = "/Logins/Student/Login.aspx";
export interface Institute { id: string; name: string; }
export const INSTITUTES: Institute[] = [
  { id: "1", name: "Islamabad E-8 Campus" },
  { id: "9", name: "Islamabad H-11 Campus" },
  { id: "2", name: "Karachi Campus" },
  { id: "3", name: "Lahore Campus" },
  { id: "12", name: "Health Sciences Campus (Islamabad)" },
  { id: "6", name: "Health Sciences Campus (Karachi)" },
  { id: "5", name: "IPP (Karachi)" },
  { id: "13", name: "Bahria University College of Nursing" },
  { id: "10", name: "Finishing School" },
  { id: "11", name: "National School of Hydrography" },
  { id: "4", name: "NCMPR" },
  { id: "14", name: "ODL" },
  { id: "8", name: "PN Nursing College" },
  { id: "7", name: "PN School of Logistics" },
  { id: "15", name: "School for Underwater Medicine" }
];
export const SUB_USER_TYPES = [
  { value: "None", label: "Student" },
  { value: "Parents", label: "Parents" }
];
