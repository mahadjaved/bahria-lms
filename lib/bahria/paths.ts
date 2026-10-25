/**
 * Portal page paths. The FIRST entry of each feature is the VERIFIED real
 * path on https://cms.bahria.edu.pk (confirmed against the live portal with
 * a real student login); the rest are fallbacks. At login the app also
 * discovers the authenticated menu URLs (see discoverNav in client.ts) and
 * can prefer those, but the verified paths are primary.
 *
 * Note `fee`: the real page is EXTENSIONLESS — /Sys/Student/FeeManagement/FeeChallans.
 * `assignments` / `quizzes` / `materials` / `announcements` live on the LMS
 * host (lms.bahria.edu.pk, see LMS_PAGES in lms.ts); their entries here exist
 * only so diagnostics can list the features.
 */
export const PORTAL_PATHS = {
  dashboard: [
    "/Sys/Student/Dashboard.aspx", "/Sys/Student/StudentDashboard.aspx", "/Sys/Student/Home.aspx",
    "/Sys/Student/Default.aspx", "/Sys/Common/Dashboard.aspx"
  ],
  profile: [
    "/Sys/Student/Profile.aspx", "/Sys/Student/StudentProfile.aspx",
    "/Sys/Student/PersonalInfo.aspx", "/Sys/Student/PersonalInformation.aspx"
  ],
  courses: [
    "/Sys/Student/CourseRegistration/RegisteredCourses.aspx",
    "/Sys/Student/Courses.aspx", "/Sys/Student/EnrolledCourses.aspx",
    "/Sys/Student/MyCourses.aspx", "/Sys/Student/RegisteredCourses.aspx"
  ],
  attendance: [
    "/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx",
    "/Sys/Student/ClassAttendance/StudentSummary.aspx", "/Sys/Student/Attendance.aspx",
    "/Sys/Student/StudentAttendance.aspx", "/Sys/Student/MyAttendance.aspx"
  ],
  marks: [
    "/Sys/Student/Exams/ExamResult.aspx",
    "/Sys/Student/Exams/MarksSheet.aspx", "/Sys/Student/Results.aspx",
    "/Sys/Student/Marks.aspx", "/Sys/Student/MyResults.aspx", "/Sys/Student/ExamResults.aspx"
  ],
  timetable: [
    "/Sys/Student/CourseRegistration/TimeTable.aspx",
    "/Sys/Student/Timetable.aspx", "/Sys/Student/TimeTable.aspx",
    "/Sys/Student/Schedule.aspx", "/Sys/Student/ClassSchedule.aspx"
  ],
  fee: [
    "/Sys/Student/FeeManagement/FeeChallans",
    "/Sys/Student/Fee/FeeChallans.aspx", "/Sys/Student/Fee/Challans.aspx",
    "/Sys/Student/Fee.aspx", "/Sys/Student/FeeDetails.aspx", "/Sys/Student/FeeChallan.aspx"
  ],
  assignments: ["/Student/Assignments.php"],
  quizzes: ["/Student/Quizzes.php"],
  materials: ["/Student/LectureNotes.php"],
  announcements: ["/Student/Announcements.php"],
  lms: ["/Sys/Common/GoToLMS.aspx"]
} as const;
export type PortalFeature = keyof typeof PORTAL_PATHS;
export const PORTAL_FEATURES = Object.keys(PORTAL_PATHS) as PortalFeature[];
