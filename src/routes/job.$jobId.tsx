import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/workspace";

export const Route = createFileRoute("/job/$jobId")({
  component: function JobRoute() {
    const { jobId } = Route.useParams();
    return <Workspace jobId={jobId} />;
  },
});
