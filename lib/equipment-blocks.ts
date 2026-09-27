import type { Catalogue, DaysData, Equipment, RunningParam } from "@/lib/types";
import { newEquipmentId } from "@/lib/validate";

export type EquipmentBlock = {
  id: string;
  family: string;
  title: string;
  summary: string;
  parts: string[];
  isHT: boolean;
  defaultTag: string;
  defaultName: string;
  params: Omit<RunningParam, "id">[];
  paramIds: string[];
  runningChecks: string[];
  stoppedChecks: string[];
};

function param(
  label: string,
  unit: string,
  phases: boolean,
  limit: string
): Omit<RunningParam, "id"> {
  return { label, unit, phases, limit };
}

const cageParams = [
  param("Stator current", "A", true, "≤ FLA"),
  param("Supply voltage", "V", true, "415 ± 6%"),
  param("DE bearing temperature", "°C", false, "< 85°C"),
  param("NDE bearing temperature", "°C", false, "< 85°C"),
  param("Frame temperature", "°C", false, "< 80°C"),
];

const cageParamIds = ["stator_i", "supply_v", "de_temp", "nde_temp", "frame_temp"];

const cageRunning = [
  "Stator frame — no crack, hot spot, or burnt smell",
  "Terminal box — cover, gasket, and glands sound, no moisture",
  "Cooling fan and cowl — guard in place, fins clear, airflow felt",
  "DE bearing — no growl and no grease throw",
  "NDE bearing — no growl and no grease throw",
  "Coupling or pulley guard — fitted, no rub",
  "Frame earth and terminal-box earth — tight",
  "Local isolator and starter lamp — match the run state",
];

const cageStopped = [
  "Isolation and lock-out confirmed before the cover is opened",
  "Stator insulation — megger phase to phase and phase to earth, record MΩ",
  "Stator terminals — torque on U, V, W and the star point",
  "DE and NDE bearings — grease only if the schedule is due",
  "Cooling fan — blades and guard cleaned",
  "Holding-down bolts and foundation — tight",
  "Space heater — continuity, and supply present while stopped",
  "Overload setting — matches the nameplate full-load current",
  "Starter contactor — contacts, arc chute, and coil healthy",
  "Cable glands — unused entries blanked",
];

const vsdParams = [
  param("Drive output frequency", "Hz", false, "As per process"),
  param("Drive output current", "A", true, "≤ motor FLA"),
  param("DC bus voltage", "V", false, "As per drive rating"),
  param("Drive heatsink temperature", "°C", false, "< drive limit"),
];

const vsdParamIds = ["vsd_hz", "vsd_i", "vsd_dc", "vsd_temp"];

const vsdRunning = [
  "Variable-speed drive — display healthy, no fault code",
  "Drive output frequency — matches the process set point",
  "Drive cooling fans and filter mats — clear, cabinet not hot",
  "Motor cable screen — bonded at the drive and at the motor",
  "Speed feedback — encoder or estimated speed healthy",
  "Drive door interlock and cabinet earth — closed and tight",
];

const vsdStopped = [
  "Drive isolated and the DC-bus lamp out before the cover is opened",
  "Power stack — no heat damage or smell",
  "Control fuses and the control-supply module — intact",
  "Filter mats — cleaned or replaced",
  "Motor insulation taken with the drive cables lifted off the motor",
];

const slipParams = [
  param("Rotor current", "A", true, "≤ rotor FLA"),
  param("Slip-ring temperature", "°C", false, "< 80°C"),
  param("Liquid-starter temperature", "°C", false, "< 70°C"),
];

const slipParamIds = ["rotor_i", "ring_temp", "lrs_temp"];

const slipRunning = [
  "Brushes — light sparking only, no continuous arc",
  "Slip-ring surface — even, no deep groove or smear",
  "Brush springs and usable length — within the wear mark",
  "Short-circuit gear — open on start, closed at speed if fitted",
  "Liquid starter tank — level at the high mark, no leak",
  "Rotor cable and brush-gear cover — secure",
];

const slipStopped = [
  "Brush grade and bedding — correct, free in the box",
  "Rotor insulation — megger, record MΩ",
  "Slip-ring surface — cleaned, no flat spot",
  "Liquid-starter level and electrodes — free, no sludge",
  "Short-circuit contactor — contacts and coil healthy",
];

const htParams = [
  param("Stator current", "A", true, "≤ FLA"),
  param("Supply voltage", "kV", true, "Nameplate kV ± 6%"),
  param("DE bearing temperature", "°C", false, "< 85°C"),
  param("NDE bearing temperature", "°C", false, "< 85°C"),
  param("Winding temperature", "°C", false, "< insulation class"),
];

const htParamIds = ["stator_i", "supply_kv", "de_temp", "nde_temp", "winding_temp"];

const htRunning = [
  "High-tension breaker — in service, no trip flag",
  "Protection relay — healthy, no standing alarm",
  "Cable end box — no compound leak, breather clear",
  "Stator frame and terminal boxes — no heat or smell",
  "Cooling fan or water cooler — flow and fans healthy",
  "DE and NDE bearings — quiet, no grease throw",
  "Frame earth — tight at both ends",
];

const htStopped = [
  "Breaker racked out or isolated, and lock-out confirmed",
  "Stator insulation and polarisation index when the schedule is due",
  "Terminals in the end box — torque, heater leads separate",
  "Space heater — on while the machine is stopped",
  "Protection flags — reset only after the cause is noted",
  "Holding-down bolts and coupling guard — tight",
];

const mvdParams = [
  param("Drive output frequency", "Hz", false, "As per process"),
  param("Drive output current", "A", true, "≤ motor FLA"),
  param("DC link voltage", "V", false, "As per drive rating"),
  param("Phase-shift transformer temperature", "°C", false, "< rating"),
  param("Drive cooling temperature", "°C", false, "< drive limit"),
];

const mvdParamIds = ["mvd_hz", "mvd_i", "mvd_dc", "mvd_tx", "mvd_cool"];

const mvdRunning = [
  "Medium-voltage drive — no cell bypass and no fault",
  "Phase-shift transformer — temperature and cooler healthy",
  "Drive cooling — air or water flow normal",
  "Output cable screen and earth — bonded",
  "Input breaker and pre-charge — normal, no alarm",
];

const mvdStopped = [
  "Drive isolated, cells discharged, and the lamp out",
  "Cell visual check — no burnt device",
  "Cooling filters or water strainer — clean",
  "Motor insulation taken with the drive output cables lifted",
];

function block(partial: EquipmentBlock): EquipmentBlock {
  return partial;
}

export const EQUIPMENT_BLOCKS: EquipmentBlock[] = [
  block({
    id: "lt-cage-direct",
    family: "Low-tension motors",
    title: "Squirrel-cage motor, direct starter",
    summary: "415 V cage motor on a contactor, star-delta, or reactor starter. No inverter and no slip rings.",
    parts: ["Stator", "Bearings", "Cooling fan", "Terminal box", "Starter contactor", "Space heater", "Earth"],
    isHT: false,
    defaultTag: "LT-CAGE",
    defaultName: "LT squirrel-cage motor",
    params: cageParams,
    paramIds: cageParamIds,
    runningChecks: cageRunning,
    stoppedChecks: cageStopped,
  }),
  block({
    id: "lt-cage-vsd",
    family: "Low-tension motors",
    title: "Squirrel-cage motor with variable-speed drive",
    summary: "415 V cage motor fed from an inverter. The drive, screen, and cooling come with the motor.",
    parts: ["Stator", "Bearings", "Cooling fan", "Inverter", "DC bus", "Cable screen", "Filter mats"],
    isHT: false,
    defaultTag: "LT-VSD",
    defaultName: "LT squirrel-cage motor with variable-speed drive",
    params: [...cageParams, ...vsdParams],
    paramIds: [...cageParamIds, ...vsdParamIds],
    runningChecks: [...cageRunning, ...vsdRunning],
    stoppedChecks: [...cageStopped, ...vsdStopped],
  }),
  block({
    id: "lt-wound-lrs",
    family: "Low-tension motors",
    title: "Wound-rotor motor with liquid starter",
    summary: "415 V slip-ring motor and its liquid resistance starter, brushes, and short-circuit gear.",
    parts: ["Stator", "Rotor", "Slip rings", "Brushes", "Liquid starter", "Bearings", "Cooling fan"],
    isHT: false,
    defaultTag: "LT-SR",
    defaultName: "LT wound-rotor motor with liquid starter",
    params: [...cageParams, ...slipParams],
    paramIds: [...cageParamIds, ...slipParamIds],
    runningChecks: [...cageRunning, ...slipRunning],
    stoppedChecks: [...cageStopped, ...slipStopped],
  }),
  block({
    id: "lt-wound-vsd",
    family: "Low-tension motors",
    title: "Wound-rotor motor with variable-speed drive",
    summary: "415 V slip-ring motor whose rotor is managed with the inverter. Rings, brushes, and the drive are all on the card.",
    parts: ["Stator", "Rotor", "Slip rings", "Brushes", "Inverter", "Bearings", "Cable screen"],
    isHT: false,
    defaultTag: "LT-SR-VSD",
    defaultName: "LT wound-rotor motor with variable-speed drive",
    params: [...cageParams, ...slipParams, ...vsdParams],
    paramIds: [...cageParamIds, ...slipParamIds, ...vsdParamIds],
    runningChecks: [...cageRunning, ...slipRunning, ...vsdRunning],
    stoppedChecks: [...cageStopped, ...slipStopped, ...vsdStopped],
  }),
  block({
    id: "ht-cage-direct",
    family: "High-tension motors",
    title: "Squirrel-cage motor, high-tension starter",
    summary: "HT cage motor on a breaker with direct, reactor, or soft start. No medium-voltage drive and no slip rings.",
    parts: ["Stator", "Windings", "Bearings", "Breaker", "Protection relay", "Cable end box", "Space heater"],
    isHT: true,
    defaultTag: "HT-CAGE",
    defaultName: "HT squirrel-cage motor",
    params: htParams,
    paramIds: htParamIds,
    runningChecks: htRunning,
    stoppedChecks: htStopped,
  }),
  block({
    id: "ht-cage-mvd",
    family: "High-tension motors",
    title: "Squirrel-cage motor with medium-voltage drive",
    summary: "HT cage motor fed from a medium-voltage drive, including the phase-shift transformer and cell cooling.",
    parts: ["Stator", "Bearings", "MV drive", "Phase-shift transformer", "Cell cooling", "Breaker", "Cable screen"],
    isHT: true,
    defaultTag: "HT-MVD",
    defaultName: "HT squirrel-cage motor with medium-voltage drive",
    params: [...htParams, ...mvdParams],
    paramIds: [...htParamIds, ...mvdParamIds],
    runningChecks: [...htRunning, ...mvdRunning],
    stoppedChecks: [...htStopped, ...mvdStopped],
  }),
  block({
    id: "ht-wound-lrs",
    family: "High-tension motors",
    title: "Wound-rotor motor with liquid starter",
    summary: "HT slip-ring motor, liquid starter, brush gear, and the high-tension breaker.",
    parts: ["Stator", "Rotor", "Slip rings", "Brushes", "Liquid starter", "Breaker", "Bearings"],
    isHT: true,
    defaultTag: "HT-SR",
    defaultName: "HT wound-rotor motor with liquid starter",
    params: [...htParams, ...slipParams],
    paramIds: [...htParamIds, ...slipParamIds],
    runningChecks: [...htRunning, ...slipRunning],
    stoppedChecks: [...htStopped, ...slipStopped],
  }),
  block({
    id: "ht-wound-mvd",
    family: "High-tension motors",
    title: "Wound-rotor motor with medium-voltage drive",
    summary: "HT slip-ring motor with a medium-voltage drive. Rings, brushes, cells, and the input transformer are included.",
    parts: ["Stator", "Rotor", "Slip rings", "Brushes", "MV drive", "Phase-shift transformer", "Breaker"],
    isHT: true,
    defaultTag: "HT-SR-MVD",
    defaultName: "HT wound-rotor motor with medium-voltage drive",
    params: [...htParams, ...slipParams, ...mvdParams],
    paramIds: [...htParamIds, ...slipParamIds, ...mvdParamIds],
    runningChecks: [...htRunning, ...slipRunning, ...mvdRunning],
    stoppedChecks: [...htStopped, ...slipStopped, ...mvdStopped],
  }),
  block({
    id: "tx-oil",
    family: "Transformers",
    title: "Oil-filled distribution transformer",
    summary: "Conservator, Buchholz, temperature gauges, bushings, and the cooler come with the transformer.",
    parts: ["HV winding", "LV winding", "Oil", "Conservator", "Buchholz", "Silica gel", "Bushings", "Cooler", "Earth"],
    isHT: true,
    defaultTag: "TR-OIL",
    defaultName: "Oil-filled distribution transformer",
    params: [
      param("HV voltage", "kV", false, "Nameplate ± 6%"),
      param("LV voltage", "V", true, "Nameplate ± 6%"),
      param("LV current", "A", true, "≤ rating"),
      param("Oil temperature", "°C", false, "< OTI setting"),
      param("Winding temperature", "°C", false, "< WTI setting"),
    ],
    paramIds: ["hv_v", "lv_v", "lv_i", "oil_temp", "wdg_temp"],
    runningChecks: [
      "Oil level in the conservator — in the marked band",
      "Silica-gel breather — colour still active, oil cup filled",
      "Buchholz relay — no gas, no alarm",
      "Oil and winding temperature gauges — reading, fans or pumps on if called",
      "Radiators, valves, and bushings — no oil leak",
      "Neutral earth and tank earth — tight",
      "Cable boxes — no compound leak",
      "Pressure-relief device — not operated",
    ],
    stoppedChecks: [
      "Both sides isolated and earthed before test leads are applied",
      "Insulation — HV to earth, LV to earth, HV to LV, record MΩ",
      "Oil sample — breakdown voltage when the schedule is due",
      "Off-circuit tap changer — position noted, mechanism free",
      "Bushings — cleaned, no crack",
      "Breather — gel replaced if saturated",
      "Buchholz, pressure relief, and temperature trips — circuit checked",
    ],
  }),
  block({
    id: "tx-dry",
    family: "Transformers",
    title: "Cast-resin dry transformer",
    summary: "Enclosure, windings, temperature controller, links, and cooling fans.",
    parts: ["HV winding", "LV winding", "Temperature controller", "Enclosure", "Links", "Cooling fans", "Earth"],
    isHT: true,
    defaultTag: "TR-DRY",
    defaultName: "Cast-resin dry transformer",
    params: [
      param("LV voltage", "V", true, "Nameplate ± 6%"),
      param("LV current", "A", true, "≤ rating"),
      param("Winding temperature", "°C", false, "< controller alarm"),
    ],
    paramIds: ["lv_v", "lv_i", "wdg_temp"],
    runningChecks: [
      "Windings — no dust blanket, no discolouration",
      "Temperature controller — reading all windings, no alarm",
      "Enclosure door and interlock — closed",
      "Cooling fans — run when the controller calls",
      "LV links and HV terminations — no heat tint",
      "Core and enclosure earth — tight",
    ],
    stoppedChecks: [
      "Isolated and discharged before the enclosure is opened",
      "Insulation — HV to earth, LV to earth, HV to LV",
      "Windings and ducts — vacuumed, no foreign object",
      "Links and tap links — torque",
      "Fan motors and controller settings — checked",
      "Door interlock — opens the breaker or trips the supply",
    ],
  }),
  block({
    id: "belt-conveyor",
    family: "Plant drives",
    title: "Belt conveyor drive",
    summary: "Drive motor plus the belt-protection circuit: pull cord, sway, zero speed, and take-up.",
    parts: ["Drive motor", "Gearbox", "Coupling", "Pull cord", "Belt sway", "Zero-speed switch", "Take-up", "Local panel"],
    isHT: false,
    defaultTag: "BC",
    defaultName: "Belt conveyor",
    params: [
      param("Drive motor current", "A", true, "≤ FLA"),
      param("Supply voltage", "V", false, "415 ± 6%"),
      param("Motor bearing temperature", "°C", false, "< 85°C"),
    ],
    paramIds: ["motor_i", "supply_v", "brg_temp"],
    runningChecks: [
      "Belt tracking — centred, no edge rub",
      "Pull-cord switches — latched healthy, cable free",
      "Belt-sway switches — not tripped, arms free",
      "Zero-speed switch — made while the belt is moving",
      "Take-up — weight or screw free, no belt slip",
      "Gearbox — oil level, no leak, no growl",
      "Coupling guard — fitted",
      "Local control station — lamps and emergency stop healthy",
    ],
    stoppedChecks: [
      "Isolation and lock-out, including the gravity take-up",
      "Motor insulation and terminal torque",
      "Pull-cord trip — simulate and confirm the contactor drops",
      "Sway and zero-speed contacts — continuity",
      "Gearbox oil — level and leaks",
      "Scrapers, skirts, and idler bearings — condition noted",
    ],
  }),
  block({
    id: "weigh-feeder",
    family: "Plant drives",
    title: "Weigh feeder",
    summary: "Feeder drive, belt drive, load cell, and the rate controller.",
    parts: ["Feeder motor", "Belt motor", "Load cell", "Speed sensor", "Controller", "Take-up"],
    isHT: false,
    defaultTag: "WF",
    defaultName: "Weigh feeder",
    params: [
      param("Feeder motor current", "A", true, "≤ FLA"),
      param("Belt motor current", "A", true, "≤ FLA"),
      param("Drive frequency", "Hz", false, "As per set rate"),
      param("Supply voltage", "V", false, "415 ± 6%"),
    ],
    paramIds: ["feeder_i", "belt_i", "hz", "supply_v"],
    runningChecks: [
      "Controller — set rate against actual, no alarm",
      "Load cell cable — no kink, connector tight",
      "Speed sensor — reading while the belt moves",
      "Belt tracking and take-up — centred, tension free",
      "Variable-speed drive — no fault code",
      "Local isolator and emergency stop — healthy",
    ],
    stoppedChecks: [
      "Both drives isolated",
      "Motor insulation and terminals",
      "Load cell — mechanical stop free, cable gland tight",
      "Controller supply and fuses",
      "Belt splice and scraper — condition noted",
    ],
  }),
  block({
    id: "process-fan",
    family: "Plant drives",
    title: "Process fan",
    summary: "Fan motor, both bearings, damper, and vibration.",
    parts: ["Fan motor", "DE bearing", "NDE bearing", "Damper", "Coupling", "Vibration point"],
    isHT: false,
    defaultTag: "FAN",
    defaultName: "Process fan",
    params: [
      param("Motor current", "A", true, "≤ FLA"),
      param("Supply voltage", "V", true, "415 ± 6%"),
      param("Motor DE bearing temperature", "°C", false, "< 85°C"),
      param("Motor NDE bearing temperature", "°C", false, "< 85°C"),
      param("Fan bearing temperature", "°C", false, "< 85°C"),
    ],
    paramIds: ["motor_i", "supply_v", "mde", "mnde", "fan_brg"],
    runningChecks: [
      "Damper or inlet vane — position matches the process",
      "Fan and motor bearings — no rumble",
      "Coupling guard — fitted, no rub",
      "Impeller noise — no scrape or unbalance knock",
      "Cooling fan on the motor — clear",
      "Local panel and emergency stop — healthy",
    ],
    stoppedChecks: [
      "Isolated, and the damper cannot drift onto the impeller",
      "Motor insulation and terminals",
      "Bearing grease only if due",
      "Coupling element — no crack",
      "Damper actuator and linkage — free",
    ],
  }),
  block({
    id: "bag-filter",
    family: "Plant drives",
    title: "Bag filter",
    summary: "Fan, differential pressure, pulse valves, and the rotary airlock.",
    parts: ["Fan", "Differential-pressure transmitter", "Pulse valves", "Solenoid header", "Rotary airlock", "Hopper"],
    isHT: false,
    defaultTag: "BF",
    defaultName: "Bag filter",
    params: [
      param("Fan current", "A", true, "≤ FLA"),
      param("Differential pressure", "mmWC", false, "Within controller band"),
      param("Airlock current", "A", false, "≤ FLA"),
    ],
    paramIds: ["fan_i", "dp", "airlock_i"],
    runningChecks: [
      "Pulse header — valves firing in sequence, no continuous leak",
      "Differential pressure — stable, not pegged high or zero",
      "Rotary airlock — running, no squeal",
      "Hopper — not packed, level device healthy",
      "Fan damper — open as required",
      "Controller — no cleaning-fault alarm",
    ],
    stoppedChecks: [
      "Fan and airlock isolated",
      "Pulse solenoids and diaphragm valves — leaks noted",
      "Compressed-air filter and regulator",
      "Airlock gearbox oil and chain guard",
      "Door interlock and earth — checked",
    ],
  }),
  block({
    id: "crusher-drive",
    family: "Plant drives",
    title: "Crusher drive",
    summary: "Crusher motor, bearings, and lubrication. Mark it high-tension in the card if the motor is HT.",
    parts: ["Crusher motor", "DE bearing", "NDE bearing", "Lubrication unit", "Coupling", "Local panel"],
    isHT: false,
    defaultTag: "CR",
    defaultName: "Crusher",
    params: [
      param("Motor current", "A", true, "≤ FLA"),
      param("Supply voltage", "V", true, "Nameplate ± 6%"),
      param("DE bearing temperature", "°C", false, "< 85°C"),
      param("NDE bearing temperature", "°C", false, "< 85°C"),
      param("Lube oil pressure", "bar", false, "Above trip setting"),
    ],
    paramIds: ["motor_i", "supply_v", "de", "nde", "lube_p"],
    runningChecks: [
      "Bearings — temperature and noise even",
      "Lubrication unit — pump running, no leak, filter not choked",
      "Coupling guard — fitted",
      "Motor cooling — fan or air path clear",
      "Local panel — no trip, emergency stop healthy",
      "Discharge chute switch — not blocked",
    ],
    stoppedChecks: [
      "Isolated and the rotor blocked or settled before guards come off",
      "Motor insulation and terminals",
      "Bearing grease or oil change only if due",
      "Lube-pump motor and pressure switch — function",
      "Holding-down bolts — tight",
    ],
  }),
  block({
    id: "stacker-reclaimer",
    family: "Plant drives",
    title: "Stacker or reclaimer",
    summary: "Travel, slew or boom, brakes, limits, and the cable-reeling drum.",
    parts: ["Long-travel motor", "Boom or slew motor", "Brake", "Limit switches", "Cable-reeling drum", "Local cabin panel"],
    isHT: false,
    defaultTag: "ST",
    defaultName: "Stacker / reclaimer",
    params: [
      param("Long-travel current", "A", true, "≤ FLA"),
      param("Boom or slew current", "A", true, "≤ FLA"),
      param("Supply voltage", "V", false, "415 ± 6%"),
    ],
    paramIds: ["travel_i", "boom_i", "supply_v"],
    runningChecks: [
      "Long-travel brakes — release cleanly, no drag",
      "End limits and over-travel limits — not jumpered",
      "Cable-reeling drum — cable lays evenly, no loop on the ground",
      "Boom or slew motion — smooth, no drive fault",
      "Anemometer or travel interlock — healthy if fitted",
      "Rail clamp or storm brake — released while working",
    ],
    stoppedChecks: [
      "All motions isolated, clamps applied if the machine will stay parked",
      "Travel and slew motor insulation and terminals",
      "Brake linings and thruster oil",
      "Limit-switch arms and cable reeling slip rings",
      "Pendant or cabin emergency stop — simulate",
    ],
  }),
  block({
    id: "apfc",
    family: "Plant drives",
    title: "Automatic power-factor panel",
    summary: "Controller, capacitor steps, contactors, and discharge path.",
    parts: ["Controller", "Capacitor steps", "Contactors", "HRC fuses", "Discharge resistors", "Current transformer"],
    isHT: false,
    defaultTag: "APFC",
    defaultName: "Automatic power-factor panel",
    params: [
      param("Supply voltage", "V", true, "415 ± 6%"),
      param("Load current", "A", true, "≤ incomer rating"),
      param("Power factor", "", false, "0.95–0.99"),
    ],
    paramIds: ["supply_v", "load_i", "pf"],
    runningChecks: [
      "Controller — steps in auto, no defective-step alarm",
      "Capacitor cans — no swell and no heat",
      "Contactors — pull in without chatter",
      "Incomer and current transformer — polarity and reading sane",
      "Panel ventilation — filter not blocked",
    ],
    stoppedChecks: [
      "Incomer isolated and capacitors left to discharge",
      "Discharge resistors — continuity",
      "HRC fuses and contactor contacts",
      "Controller settings and CT ratio — noted",
      "Can terminals — torque after discharge",
    ],
  }),
  block({
    id: "compressor",
    family: "Plant drives",
    title: "Air compressor",
    summary: "Main motor, unloader, oil, and the air receiver safety devices.",
    parts: ["Main motor", "Unloader", "Oil pump", "Aftercooler", "Receiver safety valve", "Starter"],
    isHT: false,
    defaultTag: "COMP",
    defaultName: "Air compressor",
    params: [
      param("Motor current", "A", true, "≤ FLA"),
      param("Discharge pressure", "bar", false, "Within set band"),
      param("Oil temperature", "°C", false, "< trip"),
    ],
    paramIds: ["motor_i", "pressure", "oil_temp"],
    runningChecks: [
      "Unloader — loads and unloads on the pressure band",
      "Oil level and separator — no carry-over",
      "Aftercooler and moisture trap — draining",
      "Motor and cooler fans — running",
      "Receiver safety valve — sealed, no leak",
      "Starter or drive — no fault",
    ],
    stoppedChecks: [
      "Isolated and the receiver blown down before fittings are opened",
      "Motor insulation and terminals",
      "Oil and separator element — only if the schedule is due",
      "Safety valve — lift test if due",
      "Belt or coupling guard — condition",
    ],
  }),
  block({
    id: "eot-crane",
    family: "Plant drives",
    title: "EOT crane",
    summary: "Hoist, cross travel, long travel, brakes, limits, and the down-shop leads.",
    parts: ["Hoist motor", "Cross-travel motor", "Long-travel motor", "Brakes", "Upper limit", "Down-shop leads", "Pendant"],
    isHT: false,
    defaultTag: "EOT",
    defaultName: "EOT crane",
    params: [
      param("Hoist current", "A", true, "≤ FLA"),
      param("Cross-travel current", "A", false, "≤ FLA"),
      param("Long-travel current", "A", false, "≤ FLA"),
    ],
    paramIds: ["hoist_i", "ct_i", "lt_i"],
    runningChecks: [
      "Hoist brake — holds the load, no drift",
      "Cross-travel and long-travel brakes — release and stop cleanly",
      "Upper hoist limit — not jumpered",
      "Down-shop leads or festoon — no bare conductor, collector free",
      "Pendant emergency stop — in reach and healthy",
      "Hook block and wire rope — no broken wire in sight",
    ],
    stoppedChecks: [
      "Crane isolated at the down-shop switch and the pendant parked",
      "Hoist, cross-travel, and long-travel insulation and terminals",
      "Brake linings and thruster oil",
      "Upper and travel limits — function",
      "Pendant cable and emergency stop — simulate",
    ],
  }),
];

export function cloneEquipmentBlock(
  source: EquipmentBlock,
  newId: string,
  title?: string
): EquipmentBlock {
  const name = title?.trim() || `${source.title} (copy)`;
  return {
    ...source,
    id: newId,
    title: name,
    defaultName: source.defaultName,
    summary: source.summary,
    parts: [...source.parts],
    params: source.params.map((p) => ({ ...p })),
    paramIds: [...source.paramIds],
    runningChecks: [...source.runningChecks],
    stoppedChecks: [...source.stoppedChecks],
  };
}

export function cloneSuperBlock(source: SuperBlock, newId: string, title?: string): SuperBlock {
  return {
    id: newId,
    title: title?.trim() || `${source.title} (copy)`,
    summary: source.summary,
    members: source.members.map((m) => ({ ...m })),
  };
}

export function equipmentBlock(id: string, library: EquipmentBlock[] = EQUIPMENT_BLOCKS) {
  return library.find((block) => block.id === id) ?? null;
}

export function blockFamilies(library: EquipmentBlock[] = EQUIPMENT_BLOCKS) {
  const families: { family: string; blocks: EquipmentBlock[] }[] = [];
  for (const item of library) {
    const group = families.find((row) => row.family === item.family);
    if (group) group.blocks.push(item);
    else families.push({ family: item.family, blocks: [item] });
  }
  return families;
}

export function instantiateFromBlock(source: EquipmentBlock, usedIds: Set<string>): Equipment {
  const id = newEquipmentId(source.defaultTag, usedIds);
  return {
    id,
    tag: source.defaultTag,
    name: source.defaultName,
    isHT: source.isHT,
    blockId: source.id,
    runningParams: source.paramIds.map((paramId, index) => ({
      id: `${id}_${paramId}`,
      ...source.params[index],
    })),
    runningChecks: [...source.runningChecks],
    stoppedChecks: [...source.stoppedChecks],
  };
}

export type SuperBlockMember = {
  blockId: string;
  name: string;
  tag: string;
};

export type SuperBlock = {
  id: string;
  title: string;
  summary: string;
  members: SuperBlockMember[];
};

export function instantiateSuperBlock(
  kit: SuperBlock,
  usedIds: Set<string>,
  usedTags: Set<string>,
  library: EquipmentBlock[]
): Equipment[] {
  const placed: Equipment[] = [];
  for (const member of kit.members) {
    const source = equipmentBlock(member.blockId, library);
    if (!source) continue;
    const eq = instantiateFromBlock(source, usedIds);
    usedIds.add(eq.id);
    const name = member.name.trim() || source.defaultName;
    let tag = (member.tag.trim() || source.defaultTag).slice(0, 16);
    if (!tag) tag = source.defaultTag;
    if (usedTags.has(tag)) {
      let n = 2;
      let next = `${tag}-${n}`.slice(0, 16);
      while (usedTags.has(next) && n < 50) {
        n += 1;
        next = `${tag}-${n}`.slice(0, 16);
      }
      tag = next;
    }
    usedTags.add(tag);
    placed.push({ ...eq, name, tag });
  }
  return placed;
}

export function superBlockFromEquipment(
  title: string,
  summary: string,
  equip: Equipment[],
  id: string
): SuperBlock {
  return {
    id,
    title,
    summary,
    members: equip
      .filter((e) => Boolean(e.blockId))
      .map((e) => ({
        blockId: e.blockId as string,
        name: e.name,
        tag: e.tag,
      })),
  };
}

export function instantiateBlock(
  blockId: string,
  usedIds: Set<string>,
  library: EquipmentBlock[] = EQUIPMENT_BLOCKS
): Equipment | null {
  const source = equipmentBlock(blockId, library);
  if (!source) return null;
  return instantiateFromBlock(source, usedIds);
}

export function applyBlockToEquipment(eq: Equipment, block: EquipmentBlock): Equipment {
  const params = block.paramIds.map((paramId, index) => {
    const spec = block.params[index];
    const existing =
      eq.runningParams.find((p) => p.id.endsWith(`_${paramId}`)) ??
      eq.runningParams.find((p) => p.label === spec.label);
    return {
      id: existing?.id ?? `${eq.id}_${paramId}`,
      label: spec.label,
      unit: spec.unit,
      phases: spec.phases,
      limit: spec.limit,
    };
  });
  return {
    ...eq,
    isHT: block.isHT,
    runningParams: params,
    runningChecks: [...block.runningChecks],
    stoppedChecks: [...block.stoppedChecks],
  };
}

export function applyBlocksToCatalogue(
  catalogue: Catalogue,
  blocks: EquipmentBlock[]
): { catalogue: Catalogue; changed: boolean } {
  let changed = false;
  const days: DaysData = {};
  for (const [id, day] of Object.entries(catalogue.days)) {
    const equip = day.equip.map((eq) => {
      if (!eq.blockId) return eq;
      const block = equipmentBlock(eq.blockId, blocks);
      if (!block) return eq;
      const next = applyBlockToEquipment(eq, block);
      if (JSON.stringify(next) !== JSON.stringify(eq)) changed = true;
      return next;
    });
    days[id] = { ...day, equip };
  }
  return { catalogue: { ...catalogue, days }, changed };
}
