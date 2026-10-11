import { formatValue } from "@/lib/capbim/format";
import type { StageCheck } from "@/lib/capbim/types";

export function CheckTable({ checks }: { checks: StageCheck[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="py-2 pr-3 font-normal">Check</th>
            <th className="py-2 pr-3 font-normal">Value</th>
            <th className="py-2 pr-3 font-normal">Limit</th>
            <th className="py-2 font-normal">Result</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id} className={c.result === "fail" ? "bg-brick-dim" : ""}>
              <td className="py-2 pr-3">
                <div>{c.metric.replaceAll("_", " ")}</div>
                {c.note ? <div className="text-xs text-muted">{c.note}</div> : null}
              </td>
              <td className="num py-2 pr-3">{formatValue(c.metric, c.value)}</td>
              <td className="num py-2 pr-3 text-muted">
                {c.operator} {formatValue(c.metric, c.threshold)}
              </td>
              <td className={`num py-2 ${c.result === "fail" ? "text-brick" : c.result === "pass" ? "text-brass" : "text-muted"}`}>
                {c.result}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
