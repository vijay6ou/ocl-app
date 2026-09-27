import Link from "next/link";

const samples = [
  {
    href: "/ux/tree",
    code: "A",
    name: "Plant tree",
    best: "Best when many plants and sections will sit on one desk.",
    points: [
      "Left: plant → section → area, always visible.",
      "Click an area to open its round. Block library and access sit on the same screen.",
      "Technician view hides branches they are not assigned.",
    ],
  },
  {
    href: "/ux/cards",
    code: "B",
    name: "Step by step",
    best: "Best on the phone — same card style as the weekday list you already use.",
    points: [
      "Tap plant, then section, then area. One level at a time.",
      "Technicians skip the tree and only see assigned area cards.",
      "Block library and access are their own screens.",
    ],
  },
  {
    href: "/ux/board",
    code: "C",
    name: "Coverage board",
    best: "Best for deciding who covers which area, in one grid.",
    points: [
      "People down the side, areas across the top.",
      "Tick a cell for one area, a section header for the whole section, or the name for the whole plant.",
      "Technician sees a simple round list, not the grid.",
    ],
  },
];

export default function UxIndexPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          Choose a layout
        </p>
        <h1 className="font-heading text-4xl font-semibold">Three ways to run the plant</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Same model in all three: plant (Adani Cements Chittapur) → section (Material handling)
          → area (Additive, Gypsum, LC-8…). Equipment blocks live in a library and stay linked
          after you drop them on a form. Access can be a whole plant, a section, or named areas,
          and more than one at once.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing is wired to the server. Click around, switch Admin / Ramesh / Suresh in the
          header, then tell us A, B, or C.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {samples.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-col rounded-2xl bg-card p-5 ring-1 ring-foreground/10 hover:ring-primary"
          >
            <span className="font-heading text-4xl text-primary">{s.code}</span>
            <h2 className="font-heading mt-1 text-2xl font-semibold">{s.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{s.best}</p>
            <ul className="mt-3 flex-1 list-disc space-y-1 pl-4 text-sm">
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <span className="mt-4 text-sm font-medium text-primary">Open sample {s.code} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
