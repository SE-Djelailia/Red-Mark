import { useCallback, useEffect, useRef, useState } from "react";

// THE IN-APP CAMERA — a live stream the user can shoot from repeatedly.
//
// WHY THIS EXISTS: <input capture> IS ONE-SHOT BY DESIGN
//
// A file input with `capture` hands control to the OS camera, which returns
// exactly ONE result and dismisses itself. Documenting a room meant five
// round-trips through the form. That is not a quality-of-implementation
// problem, it is what the element does — so the fix is to own the stream.
//
// The file input is KEPT as a fallback (see PhotoCaptureButtons): permission
// denied, desktop, or importing an existing photo. Degrade, never dead-end.
//
// WHAT THIS HOOK OWNS
//
//   · the MediaStream, and stopping every track exactly once
//   · the permission pre-check, so a granted camera never re-prompts
//   · capability/secure-context gating, with French messages
//   · capture: a video frame → canvas → JPEG → File
//
// It owns NO UI. CameraSheet renders the viewfinder and the strip.
//
// THE FILE IT PRODUCES IS AN ORDINARY File
//
// That matters more than it looks. `addToQueue` does `await file.arrayBuffer()`
// the moment a photo is queued, and stores the BYTES (see queuePayload.ts —
// WebKit dangles Blob references in IndexedDB, which is what made photos
// upload as "No content provided"). A canvas-produced File is indistinguishable
// from a picked one at that boundary, so the entire offline/upload/compression
// pipeline is reused untouched. Verified headless: size === arrayBuffer
// byteLength on every capture in a five-shot burst.
//
// iOS NOTES, which drive several decisions below
//
//   · The <video> MUST be muted + playsInline or iOS refuses to play it
//     inline and the viewfinder stays black. CameraSheet sets both.
//   · iOS allows ONE active camera stream per page. Hence a single stream
//     here, stopped on close — never two sheets open at once.
//   · Backgrounding suspends the stream and returns a frozen frame. The
//     visibilitychange handler stops it on hide so the next open re-acquires
//     a live one rather than showing a still.

/** A photo taken in this session, with its preview URL for the strip. */
export interface CapturedShot {
  id: string;
  file: File;
  /** Object URL for the thumbnail. Revoked by `discard` / `reset`. */
  previewUrl: string;
  width: number;
  height: number;
}

export type CameraPermission = "unknown" | "prompt" | "granted" | "denied";

/**
 * Maps a getUserMedia rejection to something an architect on a roof can act
 * on. Keyed on `name`, matching useAudioRecorder's describeError — same
 * failures, same vocabulary.
 */
function describeError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Accès à la caméra refusé. Autorisez l'accès dans les réglages du navigateur.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "Aucune caméra détectée sur cet appareil.";
  if (name === "NotReadableError")
    return "La caméra est utilisée par une autre application.";
  if (name === "AbortError") return "L'accès à la caméra a été interrompu. Réessayez.";
  const msg = (e as { message?: string })?.message;
  return "Caméra indisponible : " + (msg || name || "erreur inconnue");
}

/**
 * JPEG quality at capture. 0.92 at the sensor's own resolution.
 *
 * Deliberately NOT the final compression: compressImage already caps the
 * longest side at 2560 and re-encodes at 0.85 on the way to upload. Encoding
 * hard here and letting that do the real work keeps ONE compression path for
 * every photo, whether it came from the camera or the gallery. Encoding twice
 * at 0.85 would visibly soften a crack edge for no saving.
 */
const CAPTURE_QUALITY = 0.92;

/** Why the in-app camera cannot run here, or null when it can. */
function detectCapabilityError(): string | null {
  if (typeof window === "undefined") return "La caméra n'est pas disponible.";
  if (!window.isSecureContext) return "La caméra nécessite HTTPS (ou localhost).";
  if (!navigator.mediaDevices?.getUserMedia)
    return "Ce navigateur ne prend pas en charge la caméra intégrée.";
  return null;
}

export function useCameraCapture() {
  const [shots, setShots] = useState<CapturedShot[]>([]);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<CameraPermission>("unknown");


  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Serialises the ENCODE, not the shutter.
  //
  // toBlob at 2560×1440 takes a few hundred ms. An earlier version used a
  // boolean "busy" flag and returned null while it was set — which silently
  // DROPPED any shutter press landing mid-encode. Measured: five deliberate
  // presses produced three photos. A dropped press is the exact failure this
  // whole feature exists to remove, so presses now queue behind each other on
  // this promise chain and every one produces a frame.
  const encodeChain = useRef<Promise<unknown>>(Promise.resolve());

  /* ── CAPABILITY GATE ─────────────────────────────────────────────────── */

  // Read during render, not stored in state via an effect: this is a pure
  // function of the environment and never changes for the life of the page,
  // so putting it in state would only add a render and a lint error.
  const capabilityError = detectCapabilityError();

  /** True when the in-app camera can be offered at all. */
  const supported = capabilityError === null;

  /* ── PERMISSION PRE-CHECK ────────────────────────────────────────────── */

  /**
   * Reads the stored permission WITHOUT prompting.
   *
   * This is the whole answer to "don't re-ask every time": the browser already
   * persists the grant per origin, so the job is to not call getUserMedia
   * speculatively and to know the state before deciding what UI to show.
   *
   * The Permissions API's "camera" descriptor is unsupported in some Safari
   * versions and throws on query — treated as "unknown", which is honest:
   * unknown means "we will find out when we ask", not "denied".
   */
  const refreshPermission = useCallback(async (): Promise<CameraPermission> => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      setPermission("unknown");
      return "unknown";
    }
    try {
      const status = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
      const state = status.state;
      setPermission(state);
      // Reflect a change made in browser settings while the app is open.
      status.onchange = () => setPermission(status.state);
      return state;
    } catch {
      setPermission("unknown");
      return "unknown";
    }
  }, []);

  useEffect(() => {
    // Deferred to a microtask: the query is async anyway, and resolving it
    // outside the effect's synchronous body keeps the first paint free of a
    // cascading render.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refreshPermission();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshPermission]);

  /* ── STREAM LIFECYCLE ────────────────────────────────────────────────── */

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (capabilityError) {
      setError(capabilityError);
      return false;
    }
    if (streamRef.current) return true;

    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // `ideal`, never `exact`: a device with no rear camera (a laptop,
          // an iPad Pro in a stand) must still get A camera rather than an
          // OverconstrainedError. Resolution is a request, not a demand —
          // the browser gives the nearest mode it has.
          facingMode: { ideal: "environment" },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // iOS refuses inline playback without both of these; without them the
        // viewfinder is a black rectangle and nothing says why.
        video.muted = true;
        video.playsInline = true;
        try {
          await video.play();
        } catch {
          // Autoplay rejection is not fatal — the stream is attached and the
          // first user gesture resumes it.
        }
      }

      setActive(true);
      setPermission("granted");
      return true;
    } catch (e) {
      console.error("getUserMedia failed", e);
      setError(describeError(e));
      const name = (e as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setPermission("denied");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return false;
    } finally {
      setStarting(false);
    }
  }, [capabilityError]);

  // Stop on unmount. A leaked track keeps the camera light on, which on a
  // client site reads as the app recording without asking.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // iOS suspends a backgrounded stream and hands back a FROZEN frame when the
  // app returns — which would let someone photograph a still of the last
  // scene and never know. Stop on hide; the sheet re-acquires on return.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && streamRef.current) stop();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stop]);

  /* ── CAPTURE ─────────────────────────────────────────────────────────── */

  /**
   * Grabs the current frame as a File and appends it to the burst.
   *
   * Reads `videoWidth`/`videoHeight`, NOT the element's CSS box, so the photo
   * is the sensor's full frame regardless of how the viewfinder is laid out —
   * which is what makes the capture orientation-independent while the UI is
   * free to reflow between portrait and landscape.
   */
  const capture = useCallback(async (): Promise<CapturedShot | null> => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return null;

    // The FRAME is grabbed synchronously, in this tick, so the photo is what
    // the user saw when they pressed — not what the camera shows once an
    // earlier encode has finished.
    const width = video.videoWidth;
    const height = video.videoHeight;
    // A stream that has not produced a frame yet reports 0×0. Capturing then
    // would encode a blank canvas — an empty photo is worse than none.
    if (!width || !height) return null;

    // A per-shot canvas: the frame must be held until ITS encode runs, and a
    // single shared canvas would be overwritten by the next press.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);

    // Encodes run one at a time (a burst of parallel 2560×1440 JPEG encodes
    // stutters an iPad), but every press is already captured above, so
    // queueing costs nothing but a few ms of latency on the thumbnail.
    const run = encodeChain.current.then(async (): Promise<CapturedShot | null> => {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", CAPTURE_QUALITY),
      );
      if (!blob || blob.size === 0) return null;

      const id = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // A real filename, because it becomes the storage path and shows up in
      // the queue's diagnostics.
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      const shot: CapturedShot = {
        id,
        file,
        previewUrl: URL.createObjectURL(blob),
        width,
        height,
      };
      setShots((prev) => [...prev, shot]);
      return shot;
    });

    // Keep the chain alive even if one encode throws, or every later press
    // would be rejected too.
    encodeChain.current = run.catch(() => undefined);
    return run;
  }, []);

  /** Drops one shot from the burst and releases its preview. */
  const discard = useCallback((id: string) => {
    setShots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  /** Clears the burst. Call after handing the files to the caller. */
  const reset = useCallback(() => {
    setShots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      return [];
    });
    setError(null);
  }, []);

  return {
    // state
    shots,
    active,
    starting,
    error,
    permission,
    capabilityError,
    supported,
    // refs for the view
    videoRef,
    // actions
    start,
    stop,
    capture,
    discard,
    reset,
    refreshPermission,
  };
}

/**
 * Packs Files into a FileList.
 *
 * The camera's whole point is to hand several photos back at once, but every
 * consumer's contract is `onFilesSelected(files: FileList)` — the same shape a
 * file input produces. DataTransfer is the only way to build a real FileList,
 * and it means all six consumers stay untouched by this feature.
 */
export function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  return dt.files;
}
