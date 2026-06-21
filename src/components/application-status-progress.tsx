import { APPLICATION_STATUSES, type ApplicationStatus } from "#/lib/applications.ts";
import { Timeline, TimelineItem } from "#/components/ui/timeline.tsx";

const PIPELINE_STATUSES = APPLICATION_STATUSES.filter((status) => status !== "Rejected");

export function ApplicationStatusProgress({ status }: { status: ApplicationStatus }) {
  if (status === "Rejected") {
    return (
      <Timeline className="min-w-40 auto-cols-[minmax(8rem,1fr)]">
        <TimelineItem state="destructive">Rejected</TimelineItem>
      </Timeline>
    );
  }

  const currentIndex = PIPELINE_STATUSES.indexOf(status);

  return (
    <Timeline>
      {PIPELINE_STATUSES.map((step, index) => {
        return (
          <TimelineItem
            key={step}
            state={
              index < currentIndex ? "complete" : index === currentIndex ? "current" : "future"
            }
          >
            {step}
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
