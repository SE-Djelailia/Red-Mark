import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import CameraSheet from "./CameraSheet";
import { useCameraCapture } from "../../hooks/useCameraCapture";

interface Props {
  onFilesSelected: (files: FileList) => void;
  disabled?: boolean;
  /** Hide the gallery button when only a camera capture makes sense. */
  cameraOnly?: boolean;
  /** Label override for the camera button (e.g. "Preuve météo"). */
  cameraLabel?: string;
  /** Renders as a compact inline control rather than the two-up row. */
  variant?: "buttons" | "inline";
}

// THE photo picker. Gallery and camera, for every surface that takes a photo
// (visit, déficience, location pin, weather proof, upload page).
//
// ─────────────────────────────────────────────────────────────────────────
// TWO CAMERAS, ON PURPOSE
//
// The Caméra button opens the IN-APP burst camera (CameraSheet): one stream,
// shoot a whole room, come back with every photo at once. <input capture> is
// one-shot BY DESIGN — the OS camera returns a single result and dismisses
// itself — so five photos in a room used to mean five round-trips through
// this form.
//
// The file input is KEPT as the fallback, not deleted:
//
//   · permission denied — the user can still shoot with the OS camera
//   · no getUserMedia / insecure context — older browsers, http
//   · desktop — where `capture` is ignored and it is a normal file dialog
//
// The choice is made at tap time from the hook's capability + permission
// state, so a device that cannot run the in-app camera silently gets the old
// behaviour instead of a dead button.
//
// Both paths call the SAME onFilesSelected(FileList). The burst camera builds
// its FileList with DataTransfer, so none of the six consumers can tell which
// camera produced the photos, and none of them needed changing.
// ─────────────────────────────────────────────────────────────────────────
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THE <input> IS RENDERED AND NOT CREATED ON DEMAND
//
// This file used to build the input inside the click handler:
//
//     const input = document.createElement("input");
//     input.type = "file";
//     input.setAttribute("capture", "environment");
//     input.onchange = (e) => onFilesSelected(e.target.files);
//     input.click();            // <- and then the function returns
//
// That is the bug behind "the first photo never imports, the second works".
// The element is never inserted into the document and, the instant the
// handler returns, the local `input` variable is the ONLY thing referencing
// it. It is unreachable, so it becomes eligible for garbage collection —
// together with the `onchange` listener that was supposed to receive the
// photo.
//
// Taking a photo takes several seconds. The camera UI is a separate,
// memory-hungry activity: on iOS/Android the browser is backgrounded and
// frequently put under memory pressure, which is exactly when a collection
// runs. The detached input is collected while the user is framing the shot,
// so when they hit the shutter the change event has nothing left to fire on
// and the file is silently dropped.
//
// The SECOND attempt works because the page has just been resumed and
// re-rendered: the heap has room, no collection happens during the short
// window, and the listener survives long enough to fire. Hence "first fails,
// second works", every time, on every camera surface.
//
// Verified in a headless Chromium with --expose-gc and a FinalizationRegistry:
// an input created this way and clicked is reported COLLECTED after gc(),
// while the identical input appended to the document survives. Same code, one
// difference — being in the DOM.
//
// The input below is part of React's tree, so the element and its handler live
// exactly as long as the component does. Nothing can collect it mid-capture.
//
// Two further details that matter on mobile:
//
//   · `value = ""` is reset before every open. A file input does not fire
//     `change` when the same file is picked twice in a row, and on Android the
//     camera often returns the identical filename ("image.jpg"), so
//     re-photographing would silently do nothing. Clearing first makes every
//     capture a change.
//
//   · The value is cleared again AFTER the files are handed over, so the input
//     never holds a reference to a large image once the caller has taken it.
// ─────────────────────────────────────────────────────────────────────────
export default function PhotoCaptureButtons({
  onFilesSelected,
  disabled,
  cameraOnly = false,
  cameraLabel,
  variant = "buttons",
}: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Capability only — this does NOT prompt. It reads whether an in-app camera
  // is possible at all (secure context + getUserMedia) and what the browser
  // has already stored, so a granted camera is never re-asked.
  const { supported, permission } = useCameraCapture();

  // The callback is read through a ref so the change listener always calls the
  // CURRENT one. A capture can be in flight for a long time and the parent may
  // re-render meanwhile; without this, a stale closure could push the photo
  // into a previous render's state and it would appear to vanish.
  const onFilesRef = useRef(onFilesSelected);
  useEffect(() => {
    onFilesRef.current = onFilesSelected;
  }, [onFilesSelected]);

  const open = (ref: React.RefObject<HTMLInputElement | null>) => {
    const input = ref.current;
    if (!input) return;
    // See the header: same-name re-capture must still fire `change`.
    input.value = "";
    input.click();
  };

  /**
   * Opens the best camera this device can give.
   *
   * In-app when it is supported and not explicitly denied. "prompt" and
   * "unknown" both go to the sheet: the sheet is where the permission request
   * belongs, because it can explain itself and offer Réessayer, whereas a
   * refusal at this level would just do nothing.
   */
  const openCamera = () => {
    if (supported && permission !== "denied") {
      setSheetOpen(true);
      return;
    }
    open(cameraRef);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) onFilesRef.current(files);
    // Hand-off is synchronous (callers copy with Array.from), so releasing the
    // input's hold on the files here is safe and keeps memory free on a device
    // that is about to take more photos.
    e.target.value = "";
  };

  const inputs = (
    <>
      <CameraSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onFilesSelected={(files) => onFilesRef.current(files)}
      />
      {!cameraOnly && (
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleChange}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        multiple
        // `capture` opens the camera directly instead of the picker. It is a
        // hint: desktop browsers ignore it and show a file dialog, which is
        // the right fallback.
        capture="environment"
        onChange={handleChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );

  if (variant === "inline") {
    return (
      <>
        {inputs}
        <button
          type="button"
          disabled={disabled}
          onClick={openCamera}
          className="flex items-center gap-1.5 text-brand-strong hover:text-brand-800 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
        >
          <Camera size={12} className="flex-shrink-0" />
          <span className="text-xs font-medium">{cameraLabel ?? "Caméra"}</span>
        </button>
      </>
    );
  }

  return (
    <div className="flex gap-2">
      {inputs}
      {!cameraOnly && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => open(galleryRef)}
          className="flex-1 py-2.5 px-3 bg-subtle text-ink rounded-[4px] hover:bg-line active:bg-line-strong disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2 min-h-[44px]"
        >
          <ImageIcon size={16} />
          Galerie
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={openCamera}
        className="flex-1 py-2.5 px-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2 min-h-[44px]"
      >
        <Camera size={16} />
        {cameraLabel ?? "Caméra"}
      </button>
    </div>
  );
}
