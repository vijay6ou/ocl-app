import { DAY_BLURBS, DAY_KEYS } from "@/lib/constants";
import { MATERIAL_HANDLING_ID } from "@/lib/section-ids";
import type { Catalogue, DayCatalogue, DaysData, PlantArea } from "@/lib/types";
import seedDays from "@/lib/seed/all-days-data.json";

export { MATERIAL_HANDLING_ID, findArea, isSafeSectionId, newPlantId } from "@/lib/section-ids";

function emptySection(
  label: string,
  formLabel: string,
  blurb: string,
  badge: string
): DayCatalogue {
  return { label, formLabel, blurb, badge, equip: [], common: [] };
}

function extraPlant(): { areas: PlantArea[]; sections: DaysData } {
  const sections: DaysData = {
    "rm-drive": emptySection(
      "Raw mill main drive",
      "Raw Mill – Main drive",
      "Main motor, gearbox, and forced lubrication.",
      "Drive"
    ),
    "rm-separator": emptySection(
      "Separator",
      "Raw Mill – Separator",
      "Dynamic separator or classifier drive and rotor.",
      "Sep"
    ),
    "rm-fan": emptySection(
      "Mill fan and bag filter",
      "Raw Mill – Fan and bag filter",
      "Process fan, damper, and dust collector.",
      "Fan"
    ),
    "rm-feed": emptySection(
      "Feed weighers",
      "Raw Mill – Feed weighers",
      "Weigh feeders and belts into the mill.",
      "Feed"
    ),
    "rm-transport": emptySection(
      "Air slides and elevators",
      "Raw Mill – Transport",
      "Air slides, bucket elevators, and meal transport.",
      "Move"
    ),
    "rm-aux": emptySection(
      "Lube and auxiliaries",
      "Raw Mill – Auxiliaries",
      "Lubrication, water spray, compressor, and local panels.",
      "Aux"
    ),
    "kn-drive": emptySection(
      "Kiln main drive",
      "Kiln – Main drive",
      "Main drive, auxiliary drive, and gearbox.",
      "Drive"
    ),
    "kn-preheater": emptySection(
      "Preheater fans",
      "Kiln – Preheater fans",
      "ID fan and preheater draft fans.",
      "PH"
    ),
    "kn-cooler": emptySection(
      "Cooler and clinker breaker",
      "Kiln – Cooler",
      "Cooler fans, grate drive, and clinker breaker.",
      "Cool"
    ),
    "kn-firing": emptySection(
      "Coal firing",
      "Kiln – Coal firing",
      "Firing fan, coal conveying, and burner auxiliaries.",
      "Fire"
    ),
    "kn-feed": emptySection(
      "Kiln feed",
      "Kiln – Kiln feed",
      "Meal feed, bucket elevator, and air slide to the kiln.",
      "Feed"
    ),
    "kn-aux": emptySection(
      "Kiln auxiliaries",
      "Kiln – Auxiliaries",
      "Hydraulic pack, ESP or bag house, and local panels.",
      "Aux"
    ),
    "cm-drive": emptySection(
      "Cement mill main drive",
      "Cement Mill – Main drive",
      "Main motor, gearbox, and mill lubrication.",
      "Drive"
    ),
    "cm-separator": emptySection(
      "Separator",
      "Cement Mill – Separator",
      "Separator drive, rotor, and reject circuit.",
      "Sep"
    ),
    "cm-fan": emptySection(
      "Mill fan and dust collector",
      "Cement Mill – Fan and dust collector",
      "Mill fan, damper, and bag house.",
      "Fan"
    ),
    "cm-feed": emptySection(
      "Clinker and additive feed",
      "Cement Mill – Feed",
      "Clinker, gypsum, and additive weighers.",
      "Feed"
    ),
    "cm-transport": emptySection(
      "Cement transport",
      "Cement Mill – Transport",
      "Air slides, elevators, and silo extraction.",
      "Move"
    ),
    "cm-aux": emptySection(
      "Lube and auxiliaries",
      "Cement Mill – Auxiliaries",
      "Lubrication, compressor, and packing-feed drives.",
      "Aux"
    ),
    "pp-boiler": emptySection(
      "Boiler fans and feed pumps",
      "Power Plant – Boiler auxiliaries",
      "FD, ID, PA fans and boiler feed pumps.",
      "Boiler"
    ),
    "pp-turbine": emptySection(
      "Turbine auxiliaries",
      "Power Plant – Turbine auxiliaries",
      "Oil pumps, barring gear, and condensate pumps.",
      "TG"
    ),
    "pp-cw": emptySection(
      "Cooling water",
      "Power Plant – Cooling water",
      "CW pumps, cooling tower fans, and make-up.",
      "CW"
    ),
    "pp-ash": emptySection(
      "Ash handling",
      "Power Plant – Ash handling",
      "Ash pumps, conveyors, and ESP rapping.",
      "Ash"
    ),
    "pp-coal": emptySection(
      "Boiler coal feed",
      "Power Plant – Coal feed",
      "Coal feeders, mills, and seal air.",
      "Coal"
    ),
    "pp-yard": emptySection(
      "Station transformers and switchgear",
      "Power Plant – Switchyard",
      "Station transformers, breakers, and auxiliary boards.",
      "Yard"
    ),
  };

  const areas: PlantArea[] = [
    {
      id: "raw-mill",
      name: "Raw Mill",
      blurb: "Mill drive, separator, fan, feed, transport, and auxiliaries.",
      sectionIds: ["rm-drive", "rm-separator", "rm-fan", "rm-feed", "rm-transport", "rm-aux"],
    },
    {
      id: "kiln",
      name: "Kiln",
      blurb: "Kiln drive, preheater, cooler, firing, feed, and auxiliaries.",
      sectionIds: ["kn-drive", "kn-preheater", "kn-cooler", "kn-firing", "kn-feed", "kn-aux"],
    },
    {
      id: "cement-mill",
      name: "Cement Mill",
      blurb: "Mill drive, separator, fan, feed, transport, and auxiliaries.",
      sectionIds: ["cm-drive", "cm-separator", "cm-fan", "cm-feed", "cm-transport", "cm-aux"],
    },
    {
      id: "power-plant",
      name: "Power Plant",
      blurb: "Boiler, turbine, cooling water, ash, coal feed, and switchyard.",
      sectionIds: ["pp-boiler", "pp-turbine", "pp-cw", "pp-ash", "pp-coal", "pp-yard"],
    },
  ];

  return { areas, sections };
}

type RawCatalogue = {
  version?: string;
  updatedAt?: string;
  areas?: PlantArea[];
  days?: DaysData;
};

export function normalizeCatalogue(raw: RawCatalogue | null | undefined): {
  catalogue: Catalogue;
  migrated: boolean;
} {
  const now = new Date().toISOString();
  const seed = seedDays as DaysData;
  const days: DaysData = { ...(raw?.days ?? seed) };
  let migrated = !raw?.areas?.length;

  for (const key of DAY_KEYS) {
    if (!days[key]) {
      days[key] = seed[key];
      migrated = true;
    }
    const section = days[key];
    const meta = DAY_BLURBS[key];
    if (!section.badge) {
      section.badge = meta.weekday.slice(0, 3);
      migrated = true;
    }
    if (!section.blurb) {
      section.blurb = meta.blurb;
      migrated = true;
    }
  }

  let areas = raw?.areas?.length ? raw.areas.map((area) => ({ ...area, sectionIds: [...area.sectionIds] })) : [];
  if (areas.length === 0) {
    const extras = extraPlant();
    areas = [
      {
        id: MATERIAL_HANDLING_ID,
        name: "Material Handling",
        blurb: "Additive, bauxite, gypsum, tippler, and coal yard. One subsection for each weekday.",
        sectionIds: [...DAY_KEYS],
      },
      ...extras.areas,
    ];
    for (const [id, section] of Object.entries(extras.sections)) {
      if (!days[id]) days[id] = section;
    }
    migrated = true;
  }

  areas = areas.map((area) => ({
    ...area,
    sectionIds: area.sectionIds.filter((id) => Boolean(days[id])),
  }));

  return {
    migrated,
    catalogue: {
      version: raw?.version || now,
      updatedAt: migrated ? now : raw?.updatedAt || now,
      areas,
      days,
    },
  };
}
