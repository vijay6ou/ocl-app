"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { PhotoKind, PhotoRef } from "@/lib/types";
import { sanitizePublicText } from "@/lib/public-text";
import {
  captureWithNative,
  isOclNative,
  openFacingStream,
  type CameraFacing,
} from "@/lib/print-native";

type Uploaded = PhotoRef & { url?: string };

export function PhotoCapture({
  photos,
  kind,
  equipmentId,
  commonId,
  checkIndex,
  facing = "environment",
  gallery = true,
  label = "Rear camera",
  hint,
  onChange,
}: {
  photos: PhotoRef[];
  kind: PhotoKind;
  equipmentId?: string;
  commonId?: string;
  checkIndex?: number;
  facing?: CameraFacing;
  gallery?: boolean;
  label?: string;
  hint?: string;
  onChange: (photos: PhotoRef[]) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [native, setNative] = useState(false);
  const allowGallery = gallery && kind !== "selfie";
  const galleryInputId = `gallery-${kind}-${equipmentId ?? commonId ?? "x"}-${checkIndex ?? "n"}`;

  useEffect(() => {
    setNative(isOclNative());
    return () => stopLive();
  }, []);

  function stopLive() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }

  async function uploadBlob(file: Blob, filename: string) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file, filename);
      fd.append("kind", kind);
      if (equipmentId) fd.append("equipmentId", equipmentId);
      if (commonId) fd.append("commonId", commonId);
      if (checkIndex !== undefined) fd.append("checkIndex", String(checkIndex));
      const data = await api<{ photo: Uploaded }>("/api/photos", {
        method: "POST",
        body: fd,
      });
      onChange(kind === "selfie" ? [data.photo] : [...photos, data.photo]);
    } catch (err) {
      setError(
        sanitizePublicText(
          err instanceof Error ? err.message : "Photo upload failed.",
          "Photo upload failed."
        )
      );
    } finally {
      setBusy(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  async function openLive() {
    const stream = await openFacingStream(facing);
    streamRef.current = stream;
    setLive(true);
    window.setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
      }
    }, 50);
  }

  async function snapLive() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.86)
    );
    stopLive();
    if (blob) await uploadBlob(blob, facing === "user" ? "selfie.jpg" : "equipment.jpg");
  }

  async function onCamera() {
    setError(null);
    try {
      if (isOclNative() && window.OCLNative?.capturePhoto) {
        const blob = await captureWithNative(facing);
        await uploadBlob(blob, facing === "user" ? "selfie.jpg" : "equipment.jpg");
        return;
      }
      if (window.isSecureContext && navigator.mediaDevices) {
        await openLive();
        return;
      }
      cameraInputRef.current?.click();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not open the camera.";
      if (isOclNative() && /timed out|did not return|cancel|No photo/i.test(message)) {
        setError(null);
        return;
      }
      setError(sanitizePublicText(message, "Could not open the camera."));
      if (!isOclNative()) cameraInputRef.current?.click();
    }
  }

  function onGallery() {
    if (!allowGallery) return;
    setError(null);
    const input = galleryInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {photos.map((photo) => (
          <div key={photo.id} className="relative size-14 overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${photo.id}`}
              alt={kind === "selfie" ? "Technician selfie" : "Equipment photo"}
              className="size-full object-cover"
            />
            <button
              type="button"
              className="absolute top-0.5 right-0.5 rounded-full bg-black/70 p-0.5 text-white"
              onClick={() => onChange(photos.filter((p) => p.id !== photo.id))}
              aria-label="Remove photo"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onCamera()}>
          {busy ? <Loader2 className="animate-spin" /> : <Camera />}
          {label}
        </Button>
        {allowGallery ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onGallery}
          >
            <ImageIcon />
            Gallery
          </Button>
        ) : null}
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {!native ? (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture={facing}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadBlob(file, file.name);
          }}
        />
      ) : null}
      {allowGallery ? (
        <input
          id={galleryInputId}
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadBlob(file, file.name);
          }}
        />
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {live ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black">
          <p className="p-3 text-center text-sm text-white">
            {facing === "user" ? "Front camera — selfie" : "Rear camera — equipment"}
          </p>
          <video ref={videoRef} className="min-h-0 flex-1 bg-black object-cover" playsInline muted />
          <div className="flex gap-2 p-4">
            <Button className="h-12 flex-1" onClick={() => void snapLive()}>
              Capture
            </Button>
            <Button variant="outline" className="h-12" onClick={stopLive}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
