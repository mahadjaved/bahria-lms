/**
 * Portal page paths under https://cms.bahria.edu.pk/Sys/...
 * These are FALLBACKS. At login the app discovers the real menu URLs from
 * the authenticated pages (see discoverNav in client.ts) and prefers those;
 * this list mirrors the known Aspire structure (Faculty uses
 * /Sys/Faculty/Courses.aspx, /Sys/Faculty/ClassAttendance/ClassSummary.aspx,
 * /Sys/Faculty/Exams/MarksSheet.aspx — Student equivalents are listed first)
 * and is tried when discovery didn't find a feature. Adjust here if Bahria
 * renames a page.
 */
export const PORTAL_PATHS = {
  dashboard: [
    "/Sys/Student/Dashboard.aspx", "/Sys/Student/StudentDashboard.aspx", "/Sys/Student/Home.aspx",
    "/Sys/Student/Default.aspx", "/Sys/Common/Dashboard.aspx", "/Sys/Default.aspx"
  ],
  profile: [
    "/Sys/Student/Profile/StudentProfile.aspx", "/Sys/Student/Profile.aspx", "/Sys/Student/StudentProfile.aspx",
    "/Sys/Student/PersonalInfo.aspx", "/Sys/Student/PersonalInformation.aspx"
  ],
  courses: [
    "/Sys/Student/Courses/Courses.aspx", "/Sys/Student/Courses.aspx", "/Sys/Student/Courses/EnrolledCourses.aspx",
    "/Sys/Student/EnrolledCourses.aspx", "/Sys/Student/MyCourses.aspx", "/Sys/Student/RegisteredCourses.aspx"
  ],
  attendance: [
    "/Sys/Student/ClassAttendance/StudentSummary.aspx", "/Sys/Student/ClassAttendance/Summary.aspx",
    "/Sys/Student/Attendance/StudentSummary.aspx", "/Sys/Student/Attendance.aspx",
    "/Sys/Student/StudentAttendance.aspx", "/Sys/Student/MyAttendance.aspx"
  ],
  marks: [
    "/Sys/Student/Exams/MarksSheet.aspx", "/Sys/Student/Exams/Results.aspx", "/Sys/Student/Results/Results.aspx",
    "/Sys/Student/Marks.aspx", "/Sys/Student/Results.aspx", "/Sys/Student/MyResults.aspx", "/Sys/Student/ExamResults.aspx"
  ],
  timetable: [
    "/Sys/Student/Timetable/Timetable.aspx", "/Sys/Student/Timetable.aspx", "/Sys/Student/TimeTable.aspx",
    "/Sys/Student/Schedule.aspx", "/Sys/Student/ClassSchedule.aspx"
  ],
  fee: [
    "/Sys/Student/Fee/FeeChallans.aspx", "/Sys/Student/Fee/Challans.aspx", "/Sys/Student/Fee/Fee.aspx",
    "/Sys/Student/Fee.aspx", "/Sys/Student/FeeDetails.aspx", "/Sys/Student/FeeChallan.aspx", "/Sys/Student/MyFee.aspx"
  ],
  assignments: [
    "/Sys/Student/Assignments/Assignments.aspx", "/Sys/Student/Assignments.aspx",
    "/Sys/Student/LMS/Assignments.aspx", "/Sys/Student/CourseFolder/Assignments.aspx"
  ],
  quizzes: [
    "/Sys/Student/Quizzes/Quizzes.aspx", "/Sys/Student/Quizzes.aspx",
    "/Sys/Student/LMS/Quizzes.aspx", "/Sys/Student/Exams/Quizzes.aspx"
  ],
  materials: [
    "/Sys/Student/CourseFolder.aspx", "/Sys/Student/CourseFolder/CourseFolder.aspx",
    "/Sys/Student/CourseMaterials.aspx", "/Sys/Student/Materials.aspx",
    "/Sys/Student/LMS/CourseFolder.aspx", "/Sys/Student/Downloads.aspx"
  ],
  lms: ["/Sys/Common/GoToLMS.aspx"]
} as const;
export type PortalFeature = keyof typeof PORTAL_PATHS;
export const PORTAL_FEATURES = Object.keys(PORTAL_PATHS) as PortalFeature[];
