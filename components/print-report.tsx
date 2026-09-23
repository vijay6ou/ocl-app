import { Badge } from "@/components/ui/badge";
import { workingSectionLabel } from "@/lib/working-section";
import { formatSubmitTimestamp, submitInstant } from "@/lib/submit-time";
import type { Submission } from "@/lib/types";

export function PrintReport({ record }: { record: Submission }) {
  const { meta, snapshot, fails } = record;
  const section = workingSectionLabel(meta);

  return (
    <article className="report space-y-6 rounded-xl border bg-white p-4 text-sm text-zinc-900 sm:p-6 print:border-0 print:p-0">
      <div className="report-banner border-b pb-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-emerald-800 uppercase">
          Adani Cements · Electrical Department · Chittapur
        </p>
        <h2 className="font-heading text-2xl font-semibold">Weekly Electrical Maintenance Report</h2>
        <p className="mt-2 text-base font-semibold text-zinc-900">Working section: {section}</p>
        <p className="text-base font-semibold text-zinc-900">Date: {meta.date}</p>
        <p className="text-base font-semibold text-zinc-900">
          Submitted: {formatSubmitTimestamp(submitInstant(record))}
        </p>
        <dl className="mt-3 grid gap-1 sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Date</dt>
            <dd>{meta.date}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Submitted</dt>
            <dd>{formatSubmitTimestamp(submitInstant(record))}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Working section</dt>
            <dd>{section}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Shift</dt>
            <dd>{meta.shiftLabel}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Technician</dt>
            <dd>{meta.tech}</dd>
            {record.selfie ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/photos/${record.selfie.id}`}
                alt="Technician selfie"
                className="mt-2 h-24 rounded border object-cover"
              />
            ) : null}
          </div>
          <div>
            <dt className="text-zinc-500">Supervisor</dt>
            <dd>{meta.sup || "_______________"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Completion</dt>
            <dd>
              {meta.pct}% ({meta.done}/{meta.total}) · {record.status}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Record</dt>
            <dd>{record.id}</dd>
          </div>
        </dl>
      </div>

      {fails.length > 0 ? (
        <section>
          <h3 className="mb-2 font-heading font-semibold text-red-800">Defects / failures</h3>
          <ul className="space-y-1">
            {fails.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.equipment}</span> — {f.issue}{" "}
                <span className="text-zinc-500">({f.type})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-emerald-800">No FAIL checks or defect remarks were recorded.</p>
      )}

      <section className="space-y-4">
        <h3 className="font-heading font-semibold">Equipment</h3>
        {snapshot.equip.map((item) => {
          const st = record.equip[item.id];
          const status =
            st?.status === "R" ? "RUNNING" : st?.status === "S" ? "STOPPED" : "PENDING";
          const checks = st?.status === "S" ? item.stoppedChecks : item.runningChecks;
          const answers = st?.status === "S" ? st.stoppedChecks : st?.checks;
          return (
            <div key={item.id} className="break-inside-avoid rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-zinc-500">{item.tag}</span>
                  {item.isHT ? <Badge className="ml-2">HT</Badge> : null}
                  <div className="font-medium">{item.name}</div>
                </div>
                <Badge variant="outline">{status}</Badge>
              </div>
              {st?.status === "R" && item.runningParams.length > 0 ? (
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {item.runningParams.map((p) => {
                      const v = st.params[p.id] ?? {};
                      const shown = p.phases
                        ? `R ${v.r || "—"} / Y ${v.y || "—"} / B ${v.b || "—"}`
                        : v.v || "—";
                      return (
                        <tr key={p.id} className="border-t">
                          <td className="py-1">
                            {p.label}
                            {p.unit ? ` (${p.unit})` : ""}
                          </td>
                          <td className="py-1 text-right">{shown}</td>
                          <td className="py-1 text-right text-zinc-500">{p.limit}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
              {st?.status && checks.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {checks.map((c, i) => {
                    const ans = answers?.[String(i)];
                    return (
                      <li key={i}>
                        <span className={ans === "fail" ? "text-red-700" : ""}>
                          {ans === "ok" ? "OK" : ans === "fail" ? "FAIL" : "—"} · {c}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {st?.remarks ? (
                <p className="mt-2 text-xs text-red-800">Remarks: {st.remarks}</p>
              ) : null}
              {st?.photos?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {st.photos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={p.id}
                      src={`/api/photos/${p.id}`}
                      alt="Defect"
                      className="h-24 rounded border object-cover"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h3 className="font-heading font-semibold">Common devices</h3>
        {snapshot.common.map((group) => (
          <div key={group.id}>
            <h4 className="text-xs tracking-wide text-zinc-500 uppercase">{group.name}</h4>
            <ul className="mt-1 space-y-1">
              {group.items.map((item) => {
                const st = record.common[item.id];
                const ans = st?.ok === "ok" ? "OK" : st?.ok === "fail" ? "FAIL" : "—";
                return (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2 text-xs">
                    <span>
                      <span className="font-mono">{item.tag}</span> {item.device}
                    </span>
                    <span className={st?.ok === "fail" ? "text-red-700" : ""}>
                      {ans}
                      {st?.remarks ? ` · ${st.remarks}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <footer className="mt-10 grid grid-cols-2 gap-8 pt-8">
        <div>
          <div className="h-px bg-zinc-800" />
          <p className="mt-2 text-xs">Technician Signature</p>
          <p className="text-sm">{meta.tech}</p>
        </div>
        <div>
          <div className="h-px bg-zinc-800" />
          <p className="mt-2 text-xs">Supervisor Signature</p>
          <p className="text-sm">{meta.sup || "_______________"}</p>
        </div>
      </footer>
    </article>
  );
}
