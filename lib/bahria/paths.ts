/**
 * Portal page paths under https://cms.bahria.edu.pk/Sys/...
 * Aspire/CMS page names can differ slightly by campus and semester.
 * Each feature lists candidate paths in order — the client tries them
 * until one returns a non-login page. Adjust here if Bahria renames a page.
 */
export const PORTAL_PATHS = {
  dashboard: ["/Sys/Student/Dashboard.aspx", "/Sys/Student/StudentDashboard.aspx", "/Sys/Student/Home.aspx", "/Sys/Common/Dashboard.aspx"],
  profile: ["/Sys/Student/Profile.aspx", "/Sys/Student/StudentProfile.aspx", "/Sys/Student/PersonalInfo.aspx"],
  courses: ["/Sys/Student/Courses.aspx", "/Sys/Student/EnrolledCourses.aspx", "/Sys/Student/MyCourses.aspx", "/Sys/Student/RegisteredCourses.aspx"],
  attendance: ["/Sys/Student/Attendance.aspx", "/Sys/Student/StudentAttendance.aspx", "/Sys/Student/MyAttendance.aspx"],
  marks: ["/Sys/Student/Marks.aspx", "/Sys/Student/Results.aspx", "/Sys/Student/MyResults.aspx", "/Sys/Student/ExamResults.aspx"],
  timetable: ["/Sys/Student/Timetable.aspx", "/Sys/Student/TimeTable.aspx", "/Sys/Student/Schedule.aspx", "/Sys/Student/ClassSchedule.aspx"],
  fee: ["/Sys/Student/Fee.aspx", "/Sys/Student/FeeDetails.aspx", "/Sys/Student/FeeChallan.aspx", "/Sys/Student/MyFee.aspx"],
  lmsEntry: ["/Sys/Common/GoToLMS.aspx"]
} as const;
export type PortalFeature = keyof typeof PORTAL_PATHS;
