"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Factory, FileText, FolderOpen, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { PhotoCapture } from "@/components/photo-capture";
import { api } from "@/lib/api";
import type { AlbumArea, AlbumEquipment, AlbumNote, AlbumPlant, AlbumSection } from "@/lib/media-path";
import type { FileNoteKind } from "@/lib/file-docs";
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
    case "summary":
      return "Day note";
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
          Photos and text
        </p>
        <h1 className="font-heading text-3xl font-semibold">Files</h1>
        <p className="text-sm text-muted-foreground">
          Each machine’s folder is its <span className="font-medium text-foreground">equipment ID</span>.
          Round photos land here automatically. You can also add a photo or a text note / log / paste
          from this page.
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
            message="Ask an admin to assign you a plant, section, or area. Photos and notes of those machines will collect here."
          />
        ) : (
          <FolderList
            items={tree.map((p) => ({
              key: p.plantId,
              title: p.name,
              blurb: `${p.sections.length} sections`,
              count: p.itemCount,
              photos: p.photoCount,
              notes: p.noteCount,
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
            count: s.itemCount,
            photos: s.photoCount,
            notes: s.noteCount,
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
            count: a.itemCount,
            photos: a.photoCount,
            notes: a.noteCount,
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
            blurb: e.equipmentId ? `${e.tag} · ${e.equipmentId}` : e.tag,
            count: e.itemCount,
            photos: e.photoCount,
            notes: e.noteCount,
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
          onNote={() => void load()}
        />
      ) : null}
    </div>
  );
}

function countLabel(photos: number, notes: number) {
  if (!photos && !notes) return "empty";
  const bits: string[] = [];
  if (photos) bits.push(`${photos} ${photos === 1 ? "photo" : "photos"}`);
  if (notes) bits.push(`${notes} ${notes === 1 ? "note" : "notes"}`);
  return bits.join(" · ");
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
    photos?: number;
    notes?: number;
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
          <p className="shrink-0 text-right text-sm tabular-nums text-muted-foreground">
            {countLabel(item.photos ?? item.count, item.notes ?? 0)}
          </p>
        </button>
      ))}
    </div>
  );
}

function noteKindLabel(kind: FileNoteKind) {
  if (kind === "log") return "Log";
  if (kind === "paste") return "Pasted data";
  return "Note";
}

function EquipAlbum({
  plant,
  section,
  area,
  equip,
  onUploaded,
  onNote,
}: {
  plant: AlbumPlant;
  section: AlbumSection;
  area: AlbumArea;
  equip: AlbumEquipment;
  onUploaded: () => void;
  onNote: () => void;
}) {
  const commonId = equip.key.startsWith("common:") ? equip.key.slice("common:".length) : undefined;
  const refs: PhotoRef[] = equip.photos.map((p) => ({
    id: p.id,
    equipmentId: equip.equipmentId,
    commonId,
    kind: p.kind,
  }));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<FileNoteKind>("note");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openBody, setOpenBody] = useState<Record<string, string>>({});

  const place = {
    plantId: plant.plantId,
    plantName: plant.name,
    sectionId: section.sectionId,
    sectionName: section.name,
    areaId: area.areaId,
    areaName: area.label,
    equipmentId: equip.equipmentId,
    equipmentTag: commonId ? undefined : equip.tag,
    equipmentName: commonId ? undefined : equip.name,
    commonId,
    commonTag: commonId ? equip.tag : undefined,
    commonName: commonId ? equip.name : undefined,
    source: "album" as const,
  };

  async function saveNote() {
    if (!body.trim()) {
      toast.error("Write the note first.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/files/notes", {
        method: "POST",
        body: JSON.stringify({ ...place, title, body, kind }),
      });
      setTitle("");
      setBody("");
      toast.success("Note filed under this machine.");
      onNote();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleNote(note: AlbumNote) {
    if (openId === note.id) {
      setOpenId(null);
      return;
    }
    setOpenId(note.id);
    if (openBody[note.id]) return;
    try {
      const data = await api<{ note: { body: string } }>(`/api/files/notes/${note.id}`);
      setOpenBody((prev) => ({ ...prev, [note.id]: data.note.body }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open that note.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-xs text-muted-foreground">
          {equip.tag}
          {equip.equipmentId ? ` · ${equip.equipmentId}` : ""}
        </p>
        <h2 className="font-heading text-2xl">{equip.name}</h2>
        <p className="text-sm text-muted-foreground">
          {plant.name} · {section.name} · {area.label}
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-3">
        <p className="mb-2 text-sm font-medium">Add to this machine</p>
        <PhotoCapture
          photos={refs}
          kind={commonId ? "common" : "album"}
          equipmentId={equip.equipmentId}
          commonId={commonId}
          facing="environment"
          gallery
          label="Rear camera"
          hint="Rear camera or insert from gallery. Saved in this machine’s equipment-ID folder, same bin as round photos."
          place={place}
          source="album"
          onChange={() => {
            toast.success("Photo filed under this machine.");
            onUploaded();
          }}
        />
        <div className="mt-4 space-y-2 border-t pt-3">
          <p className="text-sm font-medium">Text for this machine</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="file-note-title">Title</Label>
              <Input
                id="file-note-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nameplate data, last overhaul…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file-note-kind">Kind</Label>
              <select
                id="file-note-kind"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as FileNoteKind)}
              >
                <option value="note">Note</option>
                <option value="log">Log</option>
                <option value="paste">Pasted plant data</option>
              </select>
            </div>
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a note, a log line, or paste nameplate / history text. It stays in this equipment-ID folder with the photos."
          />
          <Button type="button" onClick={() => void saveNote()} disabled={saving}>
            {saving ? "Saving…" : "Save text"}
          </Button>
        </div>
      </div>
      {equip.notes.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-heading text-lg">Text</h3>
          <ul className="space-y-2">
            {equip.notes.map((note) => (
              <li key={note.id} className="rounded-xl border bg-card p-3">
                <button type="button" className="w-full text-left" onClick={() => void toggleNote(note)}>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="size-4 text-muted-foreground" />
                    {note.title}
                    <span className="font-normal text-muted-foreground">· {noteKindLabel(note.kind)}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {note.uploadedAt.slice(0, 10)} · {note.uploadedAt.slice(11, 16)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {openId === note.id ? openBody[note.id] ?? "Opening…" : note.preview}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {equip.photos.length === 0 && equip.notes.length === 0 ? (
        <EmptyState
          title="Nothing on this machine yet"
          message="Take a nameplate or defect shot, or paste a note. Next week you will find them all here."
        />
      ) : equip.photos.length === 0 ? null : (
        <div className="space-y-2">
          <h3 className="font-heading text-lg">Photos</h3>
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
        </div>
      )}
    </div>
  );
}
