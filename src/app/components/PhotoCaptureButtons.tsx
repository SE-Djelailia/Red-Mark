import { Camera, Image as ImageIcon } from "lucide-react";

interface Props {
  onFilesSelected: (files: FileList) => void;
  disabled?: boolean;
}

// Two-button photo picker (gallery / direct camera capture), copying
// PhotoUploadPage.tsx's native <input type="file"> pattern exactly so
// behavior — including capture="environment" opening the camera directly on
// mobile — stays consistent with the rest of the app. Picking only; the
// caller owns the selected files and decides when/how to upload them.
export default function PhotoCaptureButtons({ onFilesSelected, disabled }: Props) {
  const openPicker = (useCamera: boolean) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    if (useCamera) input.setAttribute("capture", "environment");
    input.onchange = (e: any) => {
      if (e.target.files?.length) onFilesSelected(e.target.files);
    };
    input.click();
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => openPicker(false)}
        className="flex-1 py-2.5 px-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2 min-h-[44px]"
      >
        <ImageIcon size={16} />
        Galerie
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => openPicker(true)}
        className="flex-1 py-2.5 px-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2 min-h-[44px]"
      >
        <Camera size={16} />
        Caméra
      </button>
    </div>
  );
}
