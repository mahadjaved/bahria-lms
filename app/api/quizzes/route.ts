import { resourcesResponse } from "@/lib/api-helpers";
export async function GET() { return resourcesResponse("quizzes"); }
