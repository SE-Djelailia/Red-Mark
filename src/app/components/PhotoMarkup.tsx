import { useRef, useState, useEffect } from "react";
import {
  X,
  Pencil,
  Circle,
  Square,
  ArrowRight,
  Type,
  Undo,
  Redo,
  Download,
  Trash2,
  Eraser,
} from "lucide-react";
import { useModalOpen } from "../../hooks/useModalOpen";

interface PhotoMarkupProps {
  imageUrl: string;
  onClose: () => void;
  onSave: (annotatedImageUrl: string) => void;
}

type Tool = "pencil" | "circle" | "square" | "arrow" | "text" | "eraser";
type DrawingElement = {
  type: Tool;
  color: string;
  startX: number;
  startY: number;
  endX?: number;
  endY?: number;
  points?: { x: number; y: number }[];
  text?: string;
  lineWidth?: number;
  fontSize?: number;
  id?: string;
};

export default function PhotoMarkup({ imageUrl, onClose, onSave }: PhotoMarkupProps) {
  useModalOpen();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#E10600");
  const [lineWidth, setLineWidth] = useState(3);
  const [fontSize, setFontSize] = useState(24);
  const [isDrawing, setIsDrawing] = useState(false);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [history, setHistory] = useState<DrawingElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const colors = [
    { hex: "#E10600", name: "Rouge" },
    { hex: "#FFFFFF", name: "Blanc" },
    { hex: "#000000", name: "Noir" },
    { hex: "#FFEB3B", name: "Jaune" },
    { hex: "#4CAF50", name: "Vert" },
    { hex: "#2196F3", name: "Bleu" },
  ];

  const lineWidths = [
    { value: 2, label: "Fin" },
    { value: 3, label: "Moyen" },
    { value: 5, label: "Épais" },
    { value: 8, label: "Très épais" },
  ];

  const fontSizes = [
    { value: 16, label: "Petit" },
    { value: 24, label: "Moyen" },
    { value: 32, label: "Grand" },
    { value: 48, label: "Très grand" },
  ];

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvas.width = img.width;
        canvas.height = img.height;
        redraw(img, []);
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const redraw = (img: HTMLImageElement, elementsList: DrawingElement[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    elementsList.forEach((element) => {
      // Skip eraser elements - they don't get drawn
      if (element.type === "eraser") return;

      ctx.strokeStyle = element.color;
      ctx.fillStyle = element.color;
      ctx.lineWidth = element.lineWidth || 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      switch (element.type) {
        case "pencil":
          if (element.points && element.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(element.points[0].x, element.points[0].y);
            element.points.forEach((point) => {
              ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();
          }
          break;

        case "circle":
          if (element.endX !== undefined && element.endY !== undefined) {
            const radius = Math.sqrt(
              Math.pow(element.endX - element.startX, 2) +
                Math.pow(element.endY - element.startY, 2),
            );
            ctx.beginPath();
            ctx.arc(element.startX, element.startY, radius, 0, 2 * Math.PI);
            ctx.stroke();
          }
          break;

        case "square":
          if (element.endX !== undefined && element.endY !== undefined) {
            ctx.strokeRect(
              element.startX,
              element.startY,
              element.endX - element.startX,
              element.endY - element.startY,
            );
          }
          break;

        case "arrow":
          if (element.endX !== undefined && element.endY !== undefined) {
            const headlen = 20;
            const dx = element.endX - element.startX;
            const dy = element.endY - element.startY;
            const angle = Math.atan2(dy, dx);

            ctx.beginPath();
            ctx.moveTo(element.startX, element.startY);
            ctx.lineTo(element.endX, element.endY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(element.endX, element.endY);
            ctx.lineTo(
              element.endX - headlen * Math.cos(angle - Math.PI / 6),
              element.endY - headlen * Math.sin(angle - Math.PI / 6),
            );
            ctx.moveTo(element.endX, element.endY);
            ctx.lineTo(
              element.endX - headlen * Math.cos(angle + Math.PI / 6),
              element.endY - headlen * Math.sin(angle + Math.PI / 6),
            );
            ctx.stroke();
          }
          break;

        case "text":
          if (element.text) {
            ctx.font = `${element.fontSize || 24}px Arial`;
            ctx.fillText(element.text, element.startX, element.startY);
          }
          break;
      }
    });
  };

  const getCanvasCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;

    if ("touches" in e) {
      // Touch event
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        return { x: 0, y: 0 };
      }
    } else {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoordinates(e);
    setIsDrawing(true);

    if (tool === "text") {
      const text = prompt("Entrer le texte:");
      if (text) {
        const newElement: DrawingElement = {
          type: "text",
          color,
          startX: x,
          startY: y,
          text,
          fontSize,
        };
        const newElements = [...elements, newElement];
        setElements(newElements);
        addToHistory(newElements);
        if (image) redraw(image, newElements);
      }
      setIsDrawing(false);
      return;
    }

    const newElement: DrawingElement = {
      type: tool,
      color,
      startX: x,
      startY: y,
      points: tool === "pencil" || tool === "eraser" ? [{ x, y }] : undefined,
      lineWidth: tool === "eraser" ? 30 : lineWidth,
    };

    setCurrentElement(newElement);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e);
    setIsDrawing(true);

    if (tool === "text") {
      const text = prompt("Entrer le texte:");
      if (text) {
        const newElement: DrawingElement = {
          type: "text",
          color,
          startX: x,
          startY: y,
          text,
          fontSize,
        };
        const newElements = [...elements, newElement];
        setElements(newElements);
        addToHistory(newElements);
        if (image) redraw(image, newElements);
      }
      setIsDrawing(false);
      return;
    }

    const newElement: DrawingElement = {
      type: tool,
      color,
      startX: x,
      startY: y,
      points: tool === "pencil" || tool === "eraser" ? [{ x, y }] : undefined,
      lineWidth: tool === "eraser" ? 30 : lineWidth,
    };

    setCurrentElement(newElement);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentElement || !image) return;

    const { x, y } = getCanvasCoordinates(e);

    if (tool === "pencil" || tool === "eraser") {
      const updatedElement = {
        ...currentElement,
        points: [...(currentElement.points || []), { x, y }],
      };
      setCurrentElement(updatedElement);
      redraw(image, [...elements, updatedElement]);
    } else {
      const updatedElement = {
        ...currentElement,
        endX: x,
        endY: y,
      };
      setCurrentElement(updatedElement);
      redraw(image, [...elements, updatedElement]);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !currentElement || !image) return;

    const { x, y } = getCanvasCoordinates(e);

    if (tool === "pencil" || tool === "eraser") {
      const updatedElement = {
        ...currentElement,
        points: [...(currentElement.points || []), { x, y }],
      };
      setCurrentElement(updatedElement);
      redraw(image, [...elements, updatedElement]);
    } else {
      const updatedElement = {
        ...currentElement,
        endX: x,
        endY: y,
      };
      setCurrentElement(updatedElement);
      redraw(image, [...elements, updatedElement]);
    }
  };

  const handleMouseUp = () => {
    if (currentElement && isDrawing) {
      if (tool === "eraser") {
        // Remove elements that intersect with eraser path
        const eraserRadius = 15; // Half of eraser width
        const eraserPoints = currentElement.points || [];

        const remainingElements = elements.filter((element) => {
          // Check if element intersects with any point in the eraser path
          return !eraserPoints.some((eraserPoint) => {
            return isElementNearPoint(element, eraserPoint, eraserRadius);
          });
        });

        setElements(remainingElements);
        addToHistory(remainingElements);
      } else {
        const newElements = [...elements, currentElement];
        setElements(newElements);
        addToHistory(newElements);
      }
      setCurrentElement(null);
    }
    setIsDrawing(false);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (currentElement && isDrawing) {
      if (tool === "eraser") {
        // Remove elements that intersect with eraser path
        const eraserRadius = 15; // Half of eraser width
        const eraserPoints = currentElement.points || [];

        const remainingElements = elements.filter((element) => {
          // Check if element intersects with any point in the eraser path
          return !eraserPoints.some((eraserPoint) => {
            return isElementNearPoint(element, eraserPoint, eraserRadius);
          });
        });

        setElements(remainingElements);
        addToHistory(remainingElements);
      } else {
        const newElements = [...elements, currentElement];
        setElements(newElements);
        addToHistory(newElements);
      }
      setCurrentElement(null);
    }
    setIsDrawing(false);
  };

  // Helper function to check if an element is near a point
  const isElementNearPoint = (
    element: DrawingElement,
    point: { x: number; y: number },
    radius: number,
  ): boolean => {
    switch (element.type) {
      case "pencil":
        // Check if any point in the pencil stroke is near the eraser point
        return (
          element.points?.some((p) => {
            const distance = Math.sqrt(Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2));
            return distance < radius;
          }) || false
        );

      case "circle":
        if (element.endX !== undefined && element.endY !== undefined) {
          const circleRadius = Math.sqrt(
            Math.pow(element.endX - element.startX, 2) + Math.pow(element.endY - element.startY, 2),
          );
          const distanceToCenter = Math.sqrt(
            Math.pow(element.startX - point.x, 2) + Math.pow(element.startY - point.y, 2),
          );
          // Check if eraser point is near the circle's edge
          return Math.abs(distanceToCenter - circleRadius) < radius;
        }
        return false;

      case "square":
        if (element.endX !== undefined && element.endY !== undefined) {
          const minX = Math.min(element.startX, element.endX);
          const maxX = Math.max(element.startX, element.endX);
          const minY = Math.min(element.startY, element.endY);
          const maxY = Math.max(element.startY, element.endY);

          // Check if point is near any edge of the rectangle
          const nearLeft =
            Math.abs(point.x - minX) < radius &&
            point.y >= minY - radius &&
            point.y <= maxY + radius;
          const nearRight =
            Math.abs(point.x - maxX) < radius &&
            point.y >= minY - radius &&
            point.y <= maxY + radius;
          const nearTop =
            Math.abs(point.y - minY) < radius &&
            point.x >= minX - radius &&
            point.x <= maxX + radius;
          const nearBottom =
            Math.abs(point.y - maxY) < radius &&
            point.x >= minX - radius &&
            point.x <= maxX + radius;

          return nearLeft || nearRight || nearTop || nearBottom;
        }
        return false;

      case "arrow":
        if (element.endX !== undefined && element.endY !== undefined) {
          // Check distance from point to line segment
          const distance = distanceToLineSegment(
            point,
            { x: element.startX, y: element.startY },
            { x: element.endX, y: element.endY },
          );
          return distance < radius;
        }
        return false;

      case "text":
        // Simple bounding box check for text
        const textWidth = (element.text?.length || 0) * ((element.fontSize || 24) * 0.6);
        const textHeight = element.fontSize || 24;
        const distance = Math.sqrt(
          Math.pow(element.startX - point.x, 2) + Math.pow(element.startY - point.y, 2),
        );
        return distance < radius + textWidth / 2 || distance < radius + textHeight / 2;

      default:
        return false;
    }
  };

  // Helper function to calculate distance from point to line segment
  const distanceToLineSegment = (
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
  ): number => {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;

    return Math.sqrt(dx * dx + dy * dy);
  };

  const addToHistory = (newElements: DrawingElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const previousElements = history[newIndex];
      setElements(previousElements);
      if (image) redraw(image, previousElements);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setElements([]);
      if (image) redraw(image, []);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const nextElements = history[newIndex];
      setElements(nextElements);
      if (image) redraw(image, nextElements);
    }
  };

  const handleClear = () => {
    setElements([]);
    setHistory([]);
    setHistoryIndex(-1);
    if (image) redraw(image, []);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        onSave(url);
      }
    });
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `annotated-photo-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col h-screen">
      {/* Header */}
      <div className="bg-[#1A1A1A] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h2 className="text-white text-lg">Annotation de photo</h2>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors text-white"
        >
          <X size={24} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-[#1A1A1A] px-4 py-3 flex items-center gap-3 border-t border-gray-800 overflow-x-auto flex-shrink-0">
        {/* Drawing Tools */}
        <div className="flex gap-2">
          <button
            onClick={() => setTool("pencil")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "pencil"
                ? "bg-[#E10600] text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title="Crayon"
          >
            <Pencil size={20} />
          </button>
          <button
            onClick={() => setTool("arrow")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "arrow"
                ? "bg-[#E10600] text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title="Flèche"
          >
            <ArrowRight size={20} />
          </button>
          <button
            onClick={() => setTool("circle")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "circle"
                ? "bg-[#E10600] text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title="Cercle"
          >
            <Circle size={20} />
          </button>
          <button
            onClick={() => setTool("square")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "square"
                ? "bg-[#E10600] text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title="Rectangle"
          >
            <Square size={20} />
          </button>
          <button
            onClick={() => setTool("text")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "text"
                ? "bg-[#E10600] text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title="Texte"
          >
            <Type size={20} />
          </button>
          <button
            onClick={() => setTool("eraser")}
            className={`p-2 rounded-lg transition-colors ${
              tool === "eraser"
                ? "bg-[#E10600] text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title="Gomme"
          >
            <Eraser size={20} />
          </button>
        </div>

        <div className="w-px h-8 bg-gray-700" />

        {/* Colors */}
        <div className="flex gap-2">
          {colors.map((c) => (
            <button
              key={c.hex}
              onClick={() => setColor(c.hex)}
              className={`w-8 h-8 rounded-full border-2 transition-transform ${
                color === c.hex ? "border-white scale-110" : "border-gray-600 hover:scale-105"
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
        </div>

        <div className="w-px h-8 bg-gray-700" />

        {/* Line Width */}
        <div className="flex gap-2">
          {lineWidths.map((lw) => (
            <button
              key={lw.value}
              onClick={() => setLineWidth(lw.value)}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center justify-center ${
                lineWidth === lw.value
                  ? "bg-[#E10600] text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
              title={lw.label}
            >
              <div
                className="rounded-full"
                style={{
                  backgroundColor: lineWidth === lw.value ? "white" : "#9CA3AF",
                  width: `${lw.value * 2}px`,
                  height: `${lw.value * 2}px`,
                }}
              />
            </button>
          ))}
        </div>

        <div className="w-px h-8 bg-gray-700" />

        {/* Font Size */}
        <div className="flex gap-2">
          {fontSizes.map((fs) => (
            <button
              key={fs.value}
              onClick={() => setFontSize(fs.value)}
              className={`px-3 py-2 rounded-lg transition-colors ${
                fontSize === fs.value
                  ? "bg-[#E10600] text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
              title={fs.label}
            >
              <span style={{ fontSize: `${fs.value / 2}px` }}>A</span>
            </button>
          ))}
        </div>

        <div className="w-px h-8 bg-gray-700" />

        {/* History */}
        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={historyIndex < 0}
            className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Annuler"
          >
            <Undo size={20} />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Refaire"
          >
            <Redo size={20} />
          </button>
          <button
            onClick={handleClear}
            className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title="Effacer tout"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 overflow-auto bg-black/50 flex items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="max-w-full max-h-full cursor-crosshair"
        />
      </div>

      {/* Footer Actions */}
      <div className="bg-[#1A1A1A] px-4 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-gray-800 flex-shrink-0">
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Download size={18} />
          <span>Télécharger</span>
        </button>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 sm:flex-none px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="flex-1 sm:flex-none px-6 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
