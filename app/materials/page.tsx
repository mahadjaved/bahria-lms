import { ResourcesView } from "@/components/resources-view";
export default function Page() {
  return <ResourcesView apiPath="/api/materials" title="Lecture Notes & Materials" emptyHint="No lecture notes, slides or downloadable files were found on your course pages or the portal's course folders. Materials live in each course's folder on the LMS — a course with an empty folder for this semester will show nothing here." />;
}
