"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  UX_SEED,
  badgeFromName,
  slugId,
  type GrantKind,
  type UxBlock,
  type UxState,
} from "@/lib/ux-mock";

type Action =
  | { type: "view"; id: string }
  | { type: "add-plant"; name: string }
  | { type: "add-section"; plantId: string; name: string }
  | { type: "add-area"; sectionId: string; name: string }
  | { type: "place-block"; areaId: string; blockId: string }
  | { type: "update-block"; block: UxBlock }
  | { type: "add-block"; block: Omit<UxBlock, "id"> }
  | { type: "toggle-grant"; userId: string; kind: GrantKind; targetId: string }
  | { type: "reset" };

function reducer(state: UxState, action: Action): UxState {
  switch (action.type) {
    case "view":
      return { ...state, viewerId: action.id };
    case "add-plant": {
      const name = action.name.trim();
      if (!name) return state;
      return {
        ...state,
        plants: [...state.plants, { id: slugId("plt", name), name }],
      };
    }
    case "add-section": {
      const name = action.name.trim();
      if (!name || !state.plants.some((p) => p.id === action.plantId)) return state;
      return {
        ...state,
        sections: [
          ...state.sections,
          { id: slugId("sec", name), plantId: action.plantId, name },
        ],
      };
    }
    case "add-area": {
      const name = action.name.trim();
      if (!name || !state.sections.some((s) => s.id === action.sectionId)) return state;
      return {
        ...state,
        areas: [
          ...state.areas,
          {
            id: slugId("area", name),
            sectionId: action.sectionId,
            name,
            badge: badgeFromName(name),
          },
        ],
      };
    }
    case "place-block": {
      const source = state.blocks.find((b) => b.id === action.blockId);
      if (!source || !state.areas.some((a) => a.id === action.areaId)) return state;
      const n = state.placed.filter((p) => p.areaId === action.areaId).length + 1;
      const tag = `${source.title
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 4)
        .toUpperCase()}-${String(n).padStart(2, "0")}`;
      return {
        ...state,
        placed: [
          ...state.placed,
          {
            id: slugId("eq", source.id),
            areaId: action.areaId,
            blockId: source.id,
            tag,
            name: source.title,
          },
        ],
      };
    }
    case "update-block": {
      return {
        ...state,
        blocks: state.blocks.map((b) => (b.id === action.block.id ? action.block : b)),
      };
    }
    case "add-block": {
      const id = slugId("blk", action.block.title);
      return { ...state, blocks: [...state.blocks, { ...action.block, id }] };
    }
    case "toggle-grant": {
      const exists = state.grants.some(
        (g) =>
          g.userId === action.userId &&
          g.kind === action.kind &&
          g.targetId === action.targetId
      );
      return {
        ...state,
        grants: exists
          ? state.grants.filter(
              (g) =>
                !(
                  g.userId === action.userId &&
                  g.kind === action.kind &&
                  g.targetId === action.targetId
                )
            )
          : [
              ...state.grants,
              { userId: action.userId, kind: action.kind, targetId: action.targetId },
            ],
      };
    }
    case "reset":
      return { ...UX_SEED, viewerId: state.viewerId };
    default:
      return state;
  }
}

const UxContext = createContext<{ state: UxState; dispatch: Dispatch<Action> } | null>(
  null
);

export function UxProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, UX_SEED);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <UxContext.Provider value={value}>{children}</UxContext.Provider>;
}

export function useUx() {
  const ctx = useContext(UxContext);
  if (!ctx) throw new Error("useUx must be inside UxProvider");
  return ctx;
}
