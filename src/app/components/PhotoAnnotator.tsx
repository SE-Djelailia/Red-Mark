import { useState, useRef, useEffect } from "react";
import {
  X,
  Pencil,
  Type,
  Circle,
  Square,
  ArrowRight,
  Undo,
  Redo,
  Save,
  Trash2,
  Eraser,
  Move,
  Palette,
} from "lucide-react";

interface PhotoAnnotatorProps {
  photo: {
    id: string;
    storage_path: string;
    tags?: string[];
    location?: { floor?: string; room?: string };
  };
  onClose: () => void;
  onSave?: (photoId: string, annotatedImageBlob: Blob) => Promise<void>;
}

type Tool = "pencil" | "arrow" | "rectangle" | "circle" | "text" | "eraser";

interface DrawingPoint {
  x: number;
  y: number;
}

interface Annotation {
  id: string;
  type: Tool;
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  text?: string;
  fontSize?: number;
}

export function PhotoAnnotator({ photo, onClose, onSave }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeTool, setActiveTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#E10600");
  const [lineWidth, setLineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<DrawingPoint | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [dragOffset, setDragOffset] = useState<DrawingPoint>({ x: 0, y: 0 });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<DrawingPoint | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Load image as blob to avoid CORS issues
  useEffect(() => {
    async function loadImageAsBlob() {
      try {
        // Get signed URL from SecureImage hook
        const { getPhotoSignedUrl } = await import("../../lib/supabaseApi");
        const signedUrl = await getPhotoSignedUrl(photo.storage_path);

        // Fetch as blob
        const response = await fetch(signedUrl);
        const blob = await response.blob();

        // Create local object URL
        const objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } catch (error) {
        console.error("Error loading image:", error);
      }
    }

    loadImageAsBlob();

    // Cleanup
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [photo.storage_path]);

  // Initialize canvas when image loads
  useEffect(() => {
    if (imageLoaded && imageRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const img = imageRef.current;

      canvas.width = img.width;
      canvas.height = img.height;

      redrawCanvas();
    }
  }, [imageLoaded, annotations, cursorPos, activeTool]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all annotations
    annotations.forEach((annotation) => {
      drawAnnotation(ctx, annotation);
    });

    // Draw current annotation
    if (currentAnnotation) {
      drawAnnotation(ctx, currentAnnotation);
    }

    // Draw eraser cursor
    if (activeTool === "eraser" && cursorPos) {
      const eraserRadius = lineWidth * 5;
      ctx.strokeStyle = "#FF0000";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cursorPos.x, cursorPos.y, eraserRadius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const drawAnnotation = (ctx: CanvasRenderingContext2D, annotation: Annotation) => {
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const points = annotation.points;
    if (points.length === 0) return;

    switch (annotation.type) {
      case "pencil":
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach((point) => {
          ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
        break;

      case "arrow":
        if (points.length >= 2) {
          const start = points[0];
          const end = points[points.length - 1];
          drawArrow(ctx, start.x, start.y, end.x, end.y);
        }
        break;

      case "rectangle":
        if (points.length >= 2) {
          const start = points[0];
          const end = points[points.length - 1];
          ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        }
        break;

      case "circle":
        if (points.length >= 2) {
          const start = points[0];
          const end = points[points.length - 1];
          const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
          ctx.beginPath();
          ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
          ctx.stroke();
        }
        break;

      case "text":
        if (annotation.text && points.length > 0) {
          const textFontSize = annotation.fontSize || annotation.lineWidth * 8;
          ctx.font = `${textFontSize}px Arial`;
          ctx.fillStyle = annotation.color;
          ctx.fillText(annotation.text, points[0].x, points[0].y);

          // Draw selection box if selected or hovered
          if (annotation.id === selectedTextId || annotation.id === hoveredTextId) {
            const metrics = ctx.measureText(annotation.text);
            const textWidth = metrics.width;
            const textHeight = textFontSize;

            ctx.strokeStyle = annotation.id === selectedTextId ? "#0066FF" : "#00AAFF";
            ctx.lineWidth = 2;
            ctx.setLineDash(annotation.id === selectedTextId ? [5, 5] : [3, 3]);
            ctx.strokeRect(
              points[0].x - 5,
              points[0].y - textHeight,
              textWidth + 10,
              textHeight + 10,
            );
            ctx.setLineDash([]);
          }
        }
        break;
    }
  };

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ) => {
    const headLength = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLength * Math.cos(angle - Math.PI / 6),
      toY - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLength * Math.cos(angle + Math.PI / 6),
      toY - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  };

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): DrawingPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);

    // Check if clicking on a text annotation
    const clickedText = annotations.find((ann) => {
      if (ann.type === "text" && ann.text && ann.points.length > 0) {
        const canvas = canvasRef.current;
        if (!canvas) return false;

        const ctx = canvas.getContext("2d");
        if (!ctx) return false;

        const textFontSize = ann.fontSize || ann.lineWidth * 8;
        ctx.font = `${textFontSize}px Arial`;
        const metrics = ctx.measureText(ann.text);
        const textWidth = metrics.width;
        const textHeight = textFontSize;

        const p = ann.points[0];
        return (
          point.x >= p.x - 5 &&
          point.x <= p.x + textWidth + 5 &&
          point.y >= p.y - textHeight &&
          point.y <= p.y + 10
        );
      }
      return false;
    });

    if (clickedText) {
      setSelectedTextId(clickedText.id);
      setIsDraggingText(true);
      setDragOffset({
        x: point.x - clickedText.points[0].x,
        y: point.y - clickedText.points[0].y,
      });
      return;
    }

    // Deselect text if clicking elsewhere
    setSelectedTextId(null);

    if (activeTool === "text") {
      setTextPosition(point);
      return;
    }

    if (activeTool === "eraser") {
      setIsDrawing(true);
      // Start erasing
      return;
    }

    setIsDrawing(true);

    setCurrentAnnotation({
      id: `ann_${Date.now()}`,
      type: activeTool,
      points: [point],
      color,
      lineWidth,
      fontSize,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);

    // Update cursor position for eraser indicator
    setCursorPos(point);

    // Check if hovering over text (when not drawing)
    if (!isDrawing && !isDraggingText && activeTool !== "eraser") {
      const hoveredText = annotations.find((ann) => {
        if (ann.type === "text" && ann.text && ann.points.length > 0) {
          const canvas = canvasRef.current;
          if (!canvas) return false;

          const ctx = canvas.getContext("2d");
          if (!ctx) return false;

          const textFontSize = ann.fontSize || ann.lineWidth * 8;
          ctx.font = `${textFontSize}px Arial`;
          const metrics = ctx.measureText(ann.text);
          const textWidth = metrics.width;
          const textHeight = textFontSize;

          const p = ann.points[0];
          return (
            point.x >= p.x - 5 &&
            point.x <= p.x + textWidth + 5 &&
            point.y >= p.y - textHeight &&
            point.y <= p.y + 10
          );
        }
        return false;
      });

      const newHoveredId = hoveredText ? hoveredText.id : null;
      if (newHoveredId !== hoveredTextId) {
        setHoveredTextId(newHoveredId);
        redrawCanvas();
      }
    }

    // Handle text dragging
    if (isDraggingText && selectedTextId) {
      const newAnnotations = annotations.map((ann) => {
        if (ann.id === selectedTextId) {
          return {
            ...ann,
            points: [
              {
                x: point.x - dragOffset.x,
                y: point.y - dragOffset.y,
              },
            ],
          };
        }
        return ann;
      });
      setAnnotations(newAnnotations);
      redrawCanvas();
      return;
    }

    if (!isDrawing) return;

    // Handle eraser
    if (activeTool === "eraser") {
      const eraserRadius = lineWidth * 5;
      const remainingAnnotations = annotations.filter((ann) => {
        // Don't erase text annotations with eraser
        if (ann.type === "text") return true;

        // Check if any point is within eraser radius
        return !ann.points.some((p) => {
          const dist = Math.sqrt(Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2));
          return dist < eraserRadius;
        });
      });

      if (remainingAnnotations.length !== annotations.length) {
        setAnnotations(remainingAnnotations);
        redrawCanvas();
      }
      return;
    }

    if (!currentAnnotation) return;

    if (activeTool === "pencil") {
      setCurrentAnnotation({
        ...currentAnnotation,
        points: [...currentAnnotation.points, point],
      });
    } else {
      setCurrentAnnotation({
        ...currentAnnotation,
        points: [currentAnnotation.points[0], point],
      });
    }

    redrawCanvas();
  };

  const handleMouseUp = () => {
    // Handle text drag end
    if (isDraggingText) {
      setIsDraggingText(false);
      // Update history
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push([...annotations]);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
      return;
    }

    if (!isDrawing) return;

    setIsDrawing(false);

    // For eraser, history was already updated during movement
    if (activeTool === "eraser") {
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push([...annotations]);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
      return;
    }

    if (!currentAnnotation) return;

    const newAnnotations = [...annotations, currentAnnotation];
    setAnnotations(newAnnotations);

    // Update history
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    setCurrentAnnotation(null);
  };

  const handleTextSubmit = () => {
    if (!textInput.trim() || !textPosition) return;

    const textAnnotation: Annotation = {
      id: `text_${Date.now()}`,
      type: "text",
      points: [textPosition],
      color,
      lineWidth,
      text: textInput,
      fontSize,
    };

    const newAnnotations = [...annotations, textAnnotation];
    setAnnotations(newAnnotations);

    // Update history
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    setTextInput("");
    setTextPosition(null);
  };

  const handleEditSelectedText = () => {
    if (!selectedTextId) return;

    const selectedText = annotations.find((ann) => ann.id === selectedTextId);
    if (selectedText && selectedText.type === "text") {
      setEditingTextId(selectedTextId);
      setTextInput(selectedText.text || "");
      setColor(selectedText.color);
      setFontSize(selectedText.fontSize || 16);
    }
  };

  const handleUpdateText = () => {
    if (!editingTextId || !textInput.trim()) return;

    const newAnnotations = annotations.map((ann) => {
      if (ann.id === editingTextId) {
        return {
          ...ann,
          text: textInput,
          color,
          fontSize,
        };
      }
      return ann;
    });

    setAnnotations(newAnnotations);

    // Update history
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    setEditingTextId(null);
    setTextInput("");
    redrawCanvas();
  };

  const handleDeleteSelectedText = () => {
    if (!selectedTextId) return;

    if (window.confirm("Supprimer ce texte ?")) {
      const newAnnotations = annotations.filter((ann) => ann.id !== selectedTextId);
      setAnnotations(newAnnotations);

      // Update history
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(newAnnotations);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);

      setSelectedTextId(null);
      redrawCanvas();
    }
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      setAnnotations(history[historyStep - 1]);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setAnnotations(history[historyStep + 1]);
    }
  };

  const handleClear = () => {
    if (window.confirm("Effacer toutes les annotations ?")) {
      const newAnnotations: Annotation[] = [];
      setAnnotations(newAnnotations);

      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(newAnnotations);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
    }
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !onSave || isSaving) return;

    try {
      setIsSaving(true);

      // Create a new canvas to combine image + annotations
      const compositeCanvas = document.createElement("canvas");
      compositeCanvas.width = canvas.width;
      compositeCanvas.height = canvas.height;
      const compositeCtx = compositeCanvas.getContext("2d");

      if (!compositeCtx) {
        setIsSaving(false);
        return;
      }

      // Draw the original image
      compositeCtx.drawImage(image, 0, 0, canvas.width, canvas.height);

      // Draw all annotations on top
      annotations.forEach((annotation) => {
        drawAnnotation(compositeCtx, annotation);
      });

      // Convert to blob for upload (wrapped in promise)
      const blob = await new Promise<Blob | null>((resolve) => {
        compositeCanvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          "image/jpeg",
          0.95,
        );
      });

      if (blob) {
        await onSave(photo.id, blob);
        onClose();
      }
    } catch (error) {
      console.error("Error creating annotated image:", error);
      alert("Erreur lors de la sauvegarde de l'annotation");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Annoter la photo</h2>
          {selectedTextId && (
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <Move size={14} />
              Texte sélectionné - Glissez pour déplacer
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-[#1A1A1A] text-white px-4 py-3 flex items-center gap-3 border-t border-white/10 overflow-x-auto">
        {/* Tools */}
        <div className="flex items-center gap-2 border-r border-white/20 pr-3">
          <button
            onClick={() => setActiveTool("pencil")}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === "pencil" ? "bg-[#E10600]" : "hover:bg-white/10"
            }`}
            title="Crayon"
          >
            <Pencil size={20} />
          </button>
          <button
            onClick={() => setActiveTool("arrow")}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === "arrow" ? "bg-[#E10600]" : "hover:bg-white/10"
            }`}
            title="Flèche"
          >
            <ArrowRight size={20} />
          </button>
          <button
            onClick={() => setActiveTool("rectangle")}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === "rectangle" ? "bg-[#E10600]" : "hover:bg-white/10"
            }`}
            title="Rectangle"
          >
            <Square size={20} />
          </button>
          <button
            onClick={() => setActiveTool("circle")}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === "circle" ? "bg-[#E10600]" : "hover:bg-white/10"
            }`}
            title="Cercle"
          >
            <Circle size={20} />
          </button>
          <button
            onClick={() => setActiveTool("text")}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === "text" ? "bg-[#E10600]" : "hover:bg-white/10"
            }`}
            title="Texte"
          >
            <Type size={20} />
          </button>
          <button
            onClick={() => setActiveTool("eraser")}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === "eraser" ? "bg-[#E10600]" : "hover:bg-white/10"
            }`}
            title="Gomme"
          >
            <Eraser size={20} />
          </button>
        </div>

        {/* Colors */}
        <div className="flex items-center gap-2 border-r border-white/20 pr-3">
          {["#E10600", "#FFFFFF", "#FFD700", "#00FF00", "#0000FF", "#000000"].map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                // If text is selected, update its color immediately
                if (selectedTextId) {
                  const newAnnotations = annotations.map((ann) => {
                    if (ann.id === selectedTextId) {
                      return { ...ann, color: c };
                    }
                    return ann;
                  });
                  setAnnotations(newAnnotations);
                  redrawCanvas();
                }
              }}
              className={`w-8 h-8 rounded-full border-2 transition-transform ${
                color === c ? "border-white scale-110" : "border-gray-400"
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>

        {/* Line Width / Eraser Size */}
        {activeTool !== "text" && (
          <div className="flex items-center gap-2 border-r border-white/20 pr-3">
            <span className="text-sm text-gray-400">
              {activeTool === "eraser" ? "Taille gomme:" : "Épaisseur:"}
            </span>
            <input
              type="range"
              min="1"
              max="10"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm w-6">{lineWidth}</span>
          </div>
        )}

        {/* Font Size (for text tool or selected text) */}
        {(activeTool === "text" || selectedTextId) && (
          <div className="flex items-center gap-2 border-r border-white/20 pr-3">
            <span className="text-sm text-gray-400">Taille:</span>
            <input
              type="range"
              min="12"
              max="72"
              value={fontSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setFontSize(newSize);
                // If text is selected, update it immediately
                if (selectedTextId) {
                  const newAnnotations = annotations.map((ann) => {
                    if (ann.id === selectedTextId) {
                      return { ...ann, fontSize: newSize };
                    }
                    return ann;
                  });
                  setAnnotations(newAnnotations);
                  redrawCanvas();
                }
              }}
              className="w-24"
            />
            <span className="text-sm w-8">{fontSize}px</span>
          </div>
        )}

        {/* Text editing tools when text is selected */}
        {selectedTextId && (
          <div className="flex items-center gap-2 border-r border-white/20 pr-3">
            <button
              onClick={handleEditSelectedText}
              className="px-3 py-1.5 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1 text-sm"
              title="Modifier le texte"
            >
              <Type size={16} />
              Modifier
            </button>
            <button
              onClick={handleDeleteSelectedText}
              className="px-3 py-1.5 bg-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1 text-sm"
              title="Supprimer"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={historyStep <= 0}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Annuler"
          >
            <Undo size={20} />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyStep >= history.length - 1}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Rétablir"
          >
            <Redo size={20} />
          </button>
          <button
            onClick={handleClear}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Tout effacer"
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-[#E10600] rounded-lg hover:bg-[#C00500] transition-colors flex items-center gap-2 ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save size={20} />
                Enregistrer
              </>
            )}
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center p-4">
        {!imageUrl ? (
          <div className="flex items-center gap-3 text-white">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Chargement de l'image...</span>
          </div>
        ) : (
          <div className="relative inline-block">
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Photo"
              className="max-w-full max-h-full"
              onLoad={() => setImageLoaded(true)}
            />
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`absolute top-0 left-0 ${
                activeTool === "eraser"
                  ? "cursor-not-allowed"
                  : isDraggingText
                    ? "cursor-move"
                    : hoveredTextId
                      ? "cursor-pointer"
                      : "cursor-crosshair"
              }`}
              style={{
                width: imageRef.current?.width || "100%",
                height: imageRef.current?.height || "100%",
              }}
            />
          </div>
        )}
      </div>

      {/* Text Input Modal */}
      {(textPosition || editingTextId) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-[#1A1A1A] mb-4">
              {editingTextId ? "Modifier le texte" : "Ajouter du texte"}
            </h3>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Entrez votre texte..."
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-[#E10600] mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (editingTextId) {
                    handleUpdateText();
                  } else {
                    handleTextSubmit();
                  }
                }
                if (e.key === "Escape") {
                  setTextPosition(null);
                  setEditingTextId(null);
                  setTextInput("");
                }
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setTextPosition(null);
                  setEditingTextId(null);
                  setTextInput("");
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={editingTextId ? handleUpdateText : handleTextSubmit}
                className="flex-1 px-4 py-2 bg-[#E10600] text-white rounded-lg font-medium hover:bg-[#C00500] transition-colors"
              >
                {editingTextId ? "Modifier" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
