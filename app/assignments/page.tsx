import { ResourcesView } from "@/components/resources-view";
export default function Page() {
  return <ResourcesView apiPath="/api/assignments" title="Assignments" emptyHint="No assignment links or records were found on your course pages or the portal's assignments page. Assignments are often posted inside each course's folder on the LMS — if a course page exists but shows nothing here, its folder may simply be empty for this semester." />;
}
