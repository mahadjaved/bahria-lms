import { ResourcesView } from "@/components/resources-view";
export default function Page() {
  return <ResourcesView apiPath="/api/announcements" title="Announcements" emptyHint="No announcements were returned by the LMS for your courses this semester." />;
}
