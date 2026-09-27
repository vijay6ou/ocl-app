"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Factory, FolderOpen, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { PhotoCapture } from "@/components/photo-capture";
import { api } from "@/lib/api";
import type { AlbumArea, AlbumEquipment, AlbumPlant, AlbumSection } from "@/lib/media-path";
import type { PhotoKind, PhotoRef } from "@/lib/types";

type TreeResponse = { tree: AlbumPlant[] };

type Crumb =
  | { level: "root" }
  | { level: "plant"; plant: AlbumPlant }
  | { level: "section"; plant: AlbumPlant; section: AlbumSection }
  | { level: "area"; plant: AlbumPlant; section: AlbumSection; area: AlbumArea }
  | {
      level: "equip";
      plant: AlbumPlant;
      section: AlbumSection;
      area: AlbumArea;
      equip: AlbumEquipment;
    };

function kindLabel(kind: PhotoKind) {
  switch (kind) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "remark":
      return "Remark";
    case "common":
      return "Common";
    case "nameplate":
      return "Nameplate";
    case "eod":
      return "Handover";
    case "album":
      return "Album";
    default:
      return kind;
  }
}

export function FilesAlbum() {
  const [tree, setTree] = useState<AlbumPlant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [crumb, setCrumb] = useState<Crumb>({ level: "root" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<TreeResponse>("/api/photos?tree=1");
      setTree(data.tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load equipment photos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const live: Crumb = useMemo(() => {
    if (crumb.level === "root") return { level: "root" };
    const plant = tree.find((p) => p.plantId === crumb.plant.plantId);
    if (!plant) return { level: "root" };
    if (crumb.level === "plant") return { level: "plant", plant };
    const section = plant.sections.find((s) => s.sectionId === crumb.section.sectionId);
    if (!section) return { level: "plant", plant };
    if (crumb.level === "section") return { level: "section", plant, section };
    const area = section.areas.find((a) => a.areaId === crumb.area.areaId);
    if (!area) return { level: "section", plant, section };
    if (crumb.level === "area") return { level: "area", plant, section, area };
    const equip = area.equipment.find((e) => e.key === crumb.equip.key);
    if (!equip) return { level: "area", plant, section, area };
    return { level: "equip", plant, section, area, equip };
  }, [crumb, tree]);

  function goBack() {
    switch (live.level) {
      case "equip":
        setCrumb({ level: "area", plant: live.plant, section: live.section, area: live.area });
        return;
      case "area":
        setCrumb({ level: "section", plant: live.plant, section: live.section });
        return;
      case "section":
        setCrumb({ level: "plant", plant: live.plant });
        return;
      default:
        setCrumb({ level: "root" });
    }
  }

  if (loading) return <LoadingState label="Opening the plant photo folders…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:py-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          Equipment photos
        </p>
        <h1 className="font-heading text-3xl font-semibold">Files</h1>
        <p className="text-sm text-muted-foreground">
          Photos sit in the same tree as the plant: plant → section → area → motor tag. Open a
          machine to see every shot of it, then add another from the rear camera or the gallery.
        </p>
      </div>

      {live.level !== "root" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={goBack}
        >
          <ChevronLeft />
          Back
        </Button>
      ) : null}

      {live.level === "root" ? (
        tree.length === 0 ? (
          <EmptyState
            title="No locations assigned"
            message="Ask an admin to assign you a plant, section, or area. Photos of those machines will collect here."
          />
        ) : (
          <FolderList
            items={tree.map((p) => ({
              key: p.plantId,
              title: p.name,
              blurb: `${p.sections.length} sections`,
              count: p.photoCount,
              icon: "plant" as const,
              onOpen: () => setCrumb({ level: "plant", plant: p }),
            }))}
          />
        )
      ) : null}

      {live.level === "plant" ? (
        <FolderList
          heading={live.plant.name}
          items={live.plant.sections.map((s) => ({
            key: s.sectionId,
            title: s.name,
            blurb: `${s.areas.length} areas`,
            count: s.photoCount,
            icon: "folder" as const,
            onOpen: () => setCrumb({ level: "section", plant: live.plant, section: s }),
          }))}
        />
      ) : null}

      {live.level === "section" ? (
        <FolderList
          heading={`${live.plant.name} · ${live.section.name}`}
          items={live.section.areas.map((a) => ({
            key: a.areaId,
            title: a.label,
            blurb: `${a.equipment.length} machines`,
            count: a.photoCount,
            icon: "folder" as const,
            onOpen: () =>
              setCrumb({ level: "area", plant: live.plant, section: live.section, area: a }),
          }))}
        />
      ) : null}

      {live.level === "area" ? (
        <FolderList
          heading={`${live.section.name} · ${live.area.label}`}
          items={live.area.equipment.map((e) => ({
            key: e.key,
            title: e.name,
            blurb: e.tag,
            count: e.photoCount,
            thumb: e.photos[0]?.url,
            icon: "equip" as const,
            onOpen: () =>
              setCrumb({
                level: "equip",
                plant: live.plant,
                section: live.section,
                area: live.area,
                equip: e,
              }),
          }))}
        />
      ) : null}

      {live.level === "equip" ? (
        <EquipAlbum
          plant={live.plant}
          section={live.section}
          area={live.area}
          equip={live.equip}
          onUploaded={() => void load()}
        />
      ) : null}
    </div>
  );
}

function FolderList({
  heading,
  items,
}: {
  heading?: string;
  items: {
    key: string;
    title: string;
    blurb: string;
    count: number;
    thumb?: string;
    icon: "plant" | "folder" | "equip";
    onOpen: () => void;
  }[];
}) {
  return (
    <div className="space-y-2">
      {heading ? <h2 className="font-heading text-xl">{heading}</h2> : null}
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onOpen}
          className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm"
        >
          <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
            {item.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumb} alt="" className="size-full object-cover" />
            ) : item.icon === "plant" ? (
              <Factory className="m-3 size-6 text-muted-foreground" />
            ) : item.icon === "folder" ? (
              <FolderOpen className="m-3 size-6 text-muted-foreground" />
            ) : (
              <ImageIcon className="m-3 size-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.title}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{item.blurb}</p>
          </div>
          <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {item.count} {item.count === 1 ? "photo" : "photos"}
          </p>
        </button>
      ))}
    </div>
  );
}

function EquipAlbum({
  plant,
  section,
  area,
  equip,
  onUploaded,
}: {
  plant: AlbumPlant;
  section: AlbumSection;
  area: AlbumArea;
  equip: AlbumEquipment;
  onUploaded: () => void;
}) {
  const refs: PhotoRef[] = equip.photos.map((p) => ({
    id: p.id,
    equipmentId: equip.equipmentId,
    kind: p.kind,
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{equip.tag}</p>
        <h2 className="font-heading text-2xl">{equip.name}</h2>
        <p className="text-sm text-muted-foreground">
          {plant.name} · {section.name} · {area.label}
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-3">
        <p className="mb-2 text-sm font-medium">Add to this machine</p>
        <PhotoCapture
          photos={refs}
          kind={equip.key.startsWith("common:") ? "common" : "album"}
          equipmentId={equip.equipmentId}
          facing="environment"
          gallery
          label="Rear camera"
          hint="Rear camera or insert from gallery. This shot stays with this motor."
          place={{
            plantId: plant.plantId,
            plantName: plant.name,
            sectionId: section.sectionId,
            sectionName: section.name,
            areaId: area.areaId,
            areaName: area.label,
            equipmentId: equip.equipmentId,
            equipmentTag: equip.tag,
            equipmentName: equip.name,
            source: "album",
          }}
          source="album"
          onChange={() => {
            toast.success("Photo filed under this machine.");
            onUploaded();
          }}
        />
      </div>
      {equip.photos.length === 0 ? (
        <EmptyState
          title="No photos on this machine yet"
          message="Take a nameplate, a defect, or a after-repair shot. Next week you will find them all here."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {equip.photos.map((photo) => (
            <li key={photo.id} className="overflow-hidden rounded-xl border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.filename} className="aspect-square w-full object-cover" />
              <div className="p-2">
                <p className="text-xs font-medium">{kindLabel(photo.kind)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {photo.uploadedAt.slice(0, 10)} · {photo.uploadedAt.slice(11, 16)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
