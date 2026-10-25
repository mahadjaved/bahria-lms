import { ResourcesView } from "@/components/resources-view";
export default function Page() {
  return <ResourcesView apiPath="/api/quizzes" title="Quizzes" emptyHint="No quiz links or records were found on your course pages or the portal's quizzes page. Quizzes are often announced inside each course's folder on the LMS and may only appear close to their scheduled date." />;
}
