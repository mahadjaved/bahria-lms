import { featureResponse, attendanceSummary } from "@/lib/api-helpers";
export async function GET() { return featureResponse("attendance", (page) => ({ attendance: attendanceSummary(page) })); }
