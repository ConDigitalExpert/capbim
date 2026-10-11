import { nextAction } from "@/lib/capbim/engine";
import { useCapbim } from "@/lib/capbim/store";
import type { Job, ReviewItem } from "@/lib/capbim/types";
import { Btn } from "./ui";

export function ReviewView({ job }: { job: Job }) {
  const decide = useCapbim((s) => s.decideReview);
  const runStage = useCapbim((s) => s.runStage);
  const open = job.reviews.filter((r) => !r.decision).length;
  const action = nextAction(job);
  const ready = action.type === "run" && action.stageId === "08";

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-medium">Attribute review</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Two readers proposed a value. Neither number came from them. Pick one, or mark it unknown. Agreement under 0.85 stays here until you do.
        </p>
      </div>
      {job.reviews.length === 0 ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">The queue opens when stage 08 runs. Until then the attributes are not in play.</p>
      ) : null}
      <ul className="grid gap-4 lg:grid-cols-3">
        {job.reviews.map((item) => (
          <li key={item.id}>
            <Card item={item} locked={job.unsealed} onPick={(decision) => decide(job.id, item.id, decision)} />
          </li>
        ))}
      </ul>
      {ready ? (
        <Btn kind="primary" className="self-start" data-testid="rerun-attributes" onClick={() => void runStage(job.id, "08")}>
          Re-run attributes
        </Btn>
      ) : open > 0 ? (
        <p className="text-sm text-muted">{open} still open. BIM authoring waits.</p>
      ) : job.reviews.length > 0 ? (
        <p className="text-sm text-brass">Queue closed.</p>
      ) : null}
    </div>
  );
}

function Card({ item, locked, onPick }: { item: ReviewItem; locked: boolean; onPick: (decision: string) => void }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <header>
        <h3 className="font-medium">{item.elementName}</h3>
        <p className="text-sm text-muted">
          {item.attribute} · confidence {item.confidence.toFixed(2)}
        </p>
      </header>
      <Evidence label={item.images[0]} />
      <Evidence label={item.images[1]} />
      <div className="mt-auto flex flex-col gap-2">
        <Btn type="button" kind={item.decision === item.opus ? "primary" : "ghost"} disabled={locked} onClick={() => onPick(item.opus)}>
          Opus · {item.opus}
        </Btn>
        <Btn type="button" kind={item.decision === item.sol ? "primary" : "ghost"} disabled={locked} onClick={() => onPick(item.sol)}>
          Sol · {item.sol}
        </Btn>
        <Btn type="button" kind={item.decision === "unknown" ? "primary" : "ghost"} disabled={locked} onClick={() => onPick("unknown")}>
          Unknown, with reason: readers disagree
        </Btn>
      </div>
    </article>
  );
}

function Evidence({ label }: { label: string }) {
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-bg">
      <svg viewBox="0 0 160 90" className="h-auto w-full" role="img" aria-label={`Frame ${label}`}>
        <rect width="160" height="90" fill="var(--color-bg)" />
        <rect x="18" y="16" width="124" height="58" fill="none" stroke="var(--color-line)" />
        <rect x="36" y="34" width="28" height="40" fill="var(--color-brick-dim)" stroke="var(--color-brick)" />
        <rect x="96" y="28" width="30" height="22" fill="none" stroke="var(--color-cool)" />
        <circle cx="52" cy="48" r="4" fill="none" stroke="var(--color-brass)" />
        <circle cx="108" cy="40" r="3" fill="var(--color-brass)" />
      </svg>
      <figcaption className="num px-2 py-1 text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
