import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, RefreshCw, Settings2, Image as ImageIcon, Layers } from 'lucide-react';

interface RisoParams {
  splitPosition: number;
  bgColor: string;
  noiseLevel: number;
  offsetX: number;
  offsetY: number;
  baseLayer: {
    enabled: boolean;
    mode: 'color' | 'grayscale';
    opacity: number;
  };
  ink1: {
    color: string;
    angle: number;
    dotSize: number;
    density: number;
    shadowThreshold: number;
  };
  ink2: {
    enabled: boolean;
    color: string;
    angle: number;
    dotSize: number;
    density: number;
    midThreshold: number;
  };
}

const DEFAULT_PARAMS: RisoParams = {
  splitPosition: 100, // 100 means full Riso effect
  bgColor: '#f9f9f9', // Fresher, cleaner paper color
  noiseLevel: 5, // More delicate noise
  offsetX: 2,
  offsetY: -1,
  baseLayer: {
    enabled: true,
    mode: 'grayscale',
    opacity: 15, // Subtle photographic detail underneath
  },
  ink1: {
    color: '#0055ff', // Vibrant fresh blue
    angle: 15,
    dotSize: 3, // Finer dots
    density: 1.1,
    shadowThreshold: 0.6,
  },
  ink2: {
    enabled: true,
    color: '#ff3366', // Vibrant fresh pink
    angle: 75,
    dotSize: 3, // Finer dots
    density: 1.0,
    midThreshold: 0.8,
  }
};

export default function RisoProcessor() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [params, setParams] = useState<RisoParams>(DEFAULT_PARAMS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Caching refs for smooth split sliding
  const cachedRisoRef = useRef<HTMLCanvasElement | null>(null);
  const cachedOrigRef = useRef<HTMLCanvasElement | null>(null);
  const lastParamsRef = useRef<string>('');
  const lastImageRef = useRef<HTMLImageElement | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const processImage = useCallback(async (targetCanvas: HTMLCanvasElement, sourceImage: HTMLImageElement, isExport = false) => {
    const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let width = sourceImage.width;
    let height = sourceImage.height;

    if (!isExport) {
      const maxDim = 1000; // Slightly higher res for preview to show fine dots
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }
    }

    targetCanvas.width = width;
    targetCanvas.height = height;

    // Check if we need to regenerate the halftone layers, or just re-composite the split
    const paramsWithoutSplit = { ...params, splitPosition: 100 };
    const currentParamsStr = JSON.stringify(paramsWithoutSplit);
    const isNewImage = sourceImage !== lastImageRef.current;
    const needsRegen = isExport || isNewImage || currentParamsStr !== lastParamsRef.current || !cachedRisoRef.current || cachedRisoRef.current.width !== width;

    let finalOrig: HTMLCanvasElement | HTMLImageElement = sourceImage;
    let finalRiso: HTMLCanvasElement;

    if (needsRegen) {
      if (!isExport) setIsProcessing(true);
      await new Promise(resolve => setTimeout(resolve, 10)); // Yield to UI

      // 1. Setup Original Canvas (for pixel reading and base layer)
      const origCanvas = document.createElement('canvas');
      origCanvas.width = width;
      origCanvas.height = height;
      const origCtx = origCanvas.getContext('2d', { willReadFrequently: true });
      if (!origCtx) return;
      origCtx.drawImage(sourceImage, 0, 0, width, height);
      const imgData = origCtx.getImageData(0, 0, width, height).data;

      // 2. Setup Riso Canvas
      const risoCanvas = document.createElement('canvas');
      risoCanvas.width = width;
      risoCanvas.height = height;
      const risoCtx = risoCanvas.getContext('2d');
      if (!risoCtx) return;

      // Fill Background
      risoCtx.fillStyle = params.bgColor;
      risoCtx.fillRect(0, 0, width, height);

      // Draw Base Layer
      if (params.baseLayer.enabled) {
        risoCtx.save();
        risoCtx.globalAlpha = params.baseLayer.opacity / 100;
        if (params.baseLayer.mode === 'grayscale') {
          risoCtx.filter = 'grayscale(100%)';
        }
        risoCtx.drawImage(origCanvas, 0, 0, width, height);
        risoCtx.restore();
      }

      // Helper to draw halftone layer
      const drawHalftoneLayer = (inkParams: any, isInk2: boolean) => {
        const { color, angle, dotSize, density, shadowThreshold, midThreshold } = inkParams;
        const radAngle = (angle * Math.PI) / 180;
        
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = width;
        layerCanvas.height = height;
        const layerCtx = layerCanvas.getContext('2d');
        if (!layerCtx) return;

        layerCtx.fillStyle = color;
        layerCtx.save();
        layerCtx.translate(width / 2, height / 2);
        layerCtx.rotate(radAngle);

        const diag = Math.sqrt(width * width + height * height);
        const startX = -diag / 2;
        const startY = -diag / 2;
        const endX = diag / 2;
        const endY = diag / 2;

        layerCtx.beginPath();
        for (let y = startY; y < endY; y += dotSize) {
          for (let x = startX; x < endX; x += dotSize) {
            const imgX = Math.floor(width / 2 + x * Math.cos(-radAngle) - y * Math.sin(-radAngle));
            const imgY = Math.floor(height / 2 + x * Math.sin(-radAngle) + y * Math.cos(-radAngle));

            if (imgX >= 0 && imgX < width && imgY >= 0 && imgY < height) {
              const idx = (imgY * width + imgX) * 4;
              const r = imgData[idx];
              const g = imgData[idx + 1];
              const b = imgData[idx + 2];
              
              const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
              
              let weight = 0;
              if (!isInk2) {
                if (brightness < shadowThreshold) {
                  weight = 1 - (brightness / shadowThreshold);
                }
              } else {
                if (brightness < midThreshold && brightness > 0.05) {
                  const mid = midThreshold / 2;
                  weight = 1 - Math.abs(brightness - mid) / mid;
                  weight = Math.max(0, weight);
                }
              }

              const radius = weight * (dotSize / 2) * density;
              if (radius > 0.2) {
                layerCtx.moveTo(x + radius, y);
                layerCtx.arc(x, y, radius, 0, Math.PI * 2);
              }
            }
          }
        }
        layerCtx.fill();
        layerCtx.restore();
        return layerCanvas;
      };

      // Draw Ink 1
      const layer1 = drawHalftoneLayer(params.ink1, false);
      if (layer1) {
        risoCtx.globalCompositeOperation = 'multiply';
        risoCtx.drawImage(layer1, 0, 0);
      }

      // Draw Ink 2
      if (params.ink2.enabled) {
        const layer2 = drawHalftoneLayer(params.ink2, true);
        if (layer2) {
          risoCtx.globalCompositeOperation = 'multiply';
          risoCtx.drawImage(layer2, params.offsetX, params.offsetY);
        }
      }

      risoCtx.globalCompositeOperation = 'source-over';

      // Apply Noise
      if (params.noiseLevel > 0) {
        const noiseData = risoCtx.getImageData(0, 0, width, height);
        const data = noiseData.data;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * params.noiseLevel * 2.55;
          data[i] = Math.min(255, Math.max(0, data[i] + noise));
          data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
          data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
        }
        risoCtx.putImageData(noiseData, 0, 0);
      }

      finalRiso = risoCanvas;
      finalOrig = origCanvas;

      if (!isExport) {
        cachedRisoRef.current = risoCanvas;
        cachedOrigRef.current = origCanvas;
        lastParamsRef.current = currentParamsStr;
        lastImageRef.current = sourceImage;
        setIsProcessing(false);
      }
    } else {
      finalOrig = cachedOrigRef.current!;
      finalRiso = cachedRisoRef.current!;
    }

    // --- Compositing Phase (Split View) ---
    ctx.clearRect(0, 0, width, height);
    const splitX = (params.splitPosition / 100) * width;

    if (params.splitPosition === 100) {
      ctx.drawImage(finalRiso, 0, 0);
    } else if (params.splitPosition === 0) {
      ctx.drawImage(finalOrig, 0, 0, width, height);
    } else {
      // Left: Original
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, height);
      ctx.clip();
      ctx.drawImage(finalOrig, 0, 0, width, height);
      ctx.restore();

      // Right: Riso
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, width - splitX, height);
      ctx.clip();
      ctx.drawImage(finalRiso, 0, 0);
      ctx.restore();

      // Split Line
      ctx.fillStyle = '#000';
      ctx.fillRect(splitX - 1, 0, 2, height);
      
      // Split Handle
      ctx.save();
      ctx.translate(splitX, height / 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(-16, -24, 32, 48);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-14, -22, 28, 44);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('<|>', 0, 0);
      ctx.restore();
    }
  }, [params]);

  useEffect(() => {
    if (image && canvasRef.current) {
      processImage(canvasRef.current, image, false);
    }
  }, [image, params, processImage]);

  const handleDownload = async () => {
    if (!image) return;
    const exportCanvas = document.createElement('canvas');
    await processImage(exportCanvas, image, true);
    const link = document.createElement('a');
    link.download = 'riso-export.png';
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const updateParam = (section: 'global' | 'baseLayer' | 'ink1' | 'ink2', key: string, value: any) => {
    setParams(prev => {
      if (section === 'global') {
        return { ...prev, [key]: value };
      }
      return {
        ...prev,
        [section]: {
          ...(prev[section as keyof RisoParams] as any),
          [key]: value
        }
      };
    });
  };

  // Interactive Split Dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!image || !canvasRef.current) return;
    setIsDraggingSplit(true);
    updateSplitFromEvent(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSplit || !image || !canvasRef.current) return;
    updateSplitFromEvent(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDraggingSplit(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const updateSplitFromEvent = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let percent = (x / rect.width) * 100;
    percent = Math.max(0, Math.min(100, percent));
    updateParam('global', 'splitPosition', percent);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white text-black font-sans">
      {/* Sidebar Controls */}
      <div className="w-full md:w-80 border-r-2 border-black bg-white flex flex-col h-screen overflow-y-auto">
        <div className="p-6 border-b-2 border-black bg-[#00ffcc]">
          <h1 className="font-display text-4xl uppercase tracking-tight leading-none mb-2">Riso<br/>Processor</h1>
          <p className="font-mono text-xs uppercase font-bold">Digital Halftone Generator</p>
        </div>

        <div className="p-6 space-y-8 flex-grow">
          {/* Global Settings */}
          <section>
            <h2 className="font-display text-xl uppercase mb-4 flex items-center gap-2">
              <Settings2 className="w-5 h-5" /> Global
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                  <span>Split View (Before/After)</span>
                  <span>{Math.round(params.splitPosition)}%</span>
                </label>
                <input 
                  type="range" min="0" max="100" 
                  value={params.splitPosition}
                  onChange={(e) => updateParam('global', 'splitPosition', parseInt(e.target.value))}
                  className="w-full accent-black"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase font-bold mb-1">Paper Color</label>
                <input 
                  type="color" 
                  value={params.bgColor}
                  onChange={(e) => updateParam('global', 'bgColor', e.target.value)}
                  className="w-full h-10 border-2 border-black cursor-pointer"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                  <span>Noise</span>
                  <span>{params.noiseLevel}</span>
                </label>
                <input 
                  type="range" min="0" max="100" 
                  value={params.noiseLevel}
                  onChange={(e) => updateParam('global', 'noiseLevel', parseInt(e.target.value))}
                  className="w-full accent-black"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-xs uppercase font-bold mb-1">Offset X</label>
                  <input 
                    type="number" 
                    value={params.offsetX}
                    onChange={(e) => updateParam('global', 'offsetX', parseInt(e.target.value))}
                    className="w-full border-2 border-black p-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs uppercase font-bold mb-1">Offset Y</label>
                  <input 
                    type="number" 
                    value={params.offsetY}
                    onChange={(e) => updateParam('global', 'offsetY', parseInt(e.target.value))}
                    className="w-full border-2 border-black p-1 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Base Layer */}
          <section className="border-t-2 border-black pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl uppercase flex items-center gap-2">
                <Layers className="w-5 h-5" /> Base Layer
              </h2>
              <input 
                type="checkbox" 
                checked={params.baseLayer.enabled}
                onChange={(e) => updateParam('baseLayer', 'enabled', e.target.checked)}
                className="w-5 h-5 accent-black border-2 border-black"
              />
            </div>
            {params.baseLayer.enabled && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => updateParam('baseLayer', 'mode', 'grayscale')}
                    className={`flex-1 py-1 font-mono text-xs uppercase font-bold border-2 border-black transition-colors ${params.baseLayer.mode === 'grayscale' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}
                  >
                    Grayscale
                  </button>
                  <button
                    onClick={() => updateParam('baseLayer', 'mode', 'color')}
                    className={`flex-1 py-1 font-mono text-xs uppercase font-bold border-2 border-black transition-colors ${params.baseLayer.mode === 'color' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}
                  >
                    Color
                  </button>
                </div>
                <div>
                  <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                    <span>Opacity</span>
                    <span>{params.baseLayer.opacity}%</span>
                  </label>
                  <input 
                    type="range" min="0" max="100" 
                    value={params.baseLayer.opacity}
                    onChange={(e) => updateParam('baseLayer', 'opacity', parseInt(e.target.value))}
                    className="w-full accent-black"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Ink 1 */}
          <section className="border-t-2 border-black pt-6">
            <h2 className="font-display text-xl uppercase mb-4">Ink 1 (Shadows)</h2>
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs uppercase font-bold mb-1">Color</label>
                <input 
                  type="color" 
                  value={params.ink1.color}
                  onChange={(e) => updateParam('ink1', 'color', e.target.value)}
                  className="w-full h-10 border-2 border-black cursor-pointer"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                  <span>Dot Size</span>
                  <span>{params.ink1.dotSize}px</span>
                </label>
                <input 
                  type="range" min="1" max="20" step="1"
                  value={params.ink1.dotSize}
                  onChange={(e) => updateParam('ink1', 'dotSize', parseInt(e.target.value))}
                  className="w-full accent-black"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                  <span>Angle</span>
                  <span>{params.ink1.angle}°</span>
                </label>
                <input 
                  type="range" min="0" max="90" 
                  value={params.ink1.angle}
                  onChange={(e) => updateParam('ink1', 'angle', parseInt(e.target.value))}
                  className="w-full accent-black"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                  <span>Density</span>
                  <span>{params.ink1.density.toFixed(1)}</span>
                </label>
                <input 
                  type="range" min="0.1" max="3" step="0.1"
                  value={params.ink1.density}
                  onChange={(e) => updateParam('ink1', 'density', parseFloat(e.target.value))}
                  className="w-full accent-black"
                />
              </div>
            </div>
          </section>

          {/* Ink 2 */}
          <section className="border-t-2 border-black pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl uppercase">Ink 2 (Midtones)</h2>
              <input 
                type="checkbox" 
                checked={params.ink2.enabled}
                onChange={(e) => updateParam('ink2', 'enabled', e.target.checked)}
                className="w-5 h-5 accent-black border-2 border-black"
              />
            </div>
            
            {params.ink2.enabled && (
              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-xs uppercase font-bold mb-1">Color</label>
                  <input 
                    type="color" 
                    value={params.ink2.color}
                    onChange={(e) => updateParam('ink2', 'color', e.target.value)}
                    className="w-full h-10 border-2 border-black cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                    <span>Dot Size</span>
                    <span>{params.ink2.dotSize}px</span>
                  </label>
                  <input 
                    type="range" min="1" max="20" step="1"
                    value={params.ink2.dotSize}
                    onChange={(e) => updateParam('ink2', 'dotSize', parseInt(e.target.value))}
                    className="w-full accent-black"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                    <span>Angle</span>
                    <span>{params.ink2.angle}°</span>
                  </label>
                  <input 
                    type="range" min="0" max="90" 
                    value={params.ink2.angle}
                    onChange={(e) => updateParam('ink2', 'angle', parseInt(e.target.value))}
                    className="w-full accent-black"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs uppercase font-bold mb-1 flex justify-between">
                    <span>Density</span>
                    <span>{params.ink2.density.toFixed(1)}</span>
                  </label>
                  <input 
                    type="range" min="0.1" max="3" step="0.1"
                    value={params.ink2.density}
                    onChange={(e) => updateParam('ink2', 'density', parseFloat(e.target.value))}
                    className="w-full accent-black"
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 bg-[#e5e5e5] relative flex flex-col items-center justify-center p-8 overflow-hidden" ref={containerRef}>
        
        {/* Top Actions */}
        <div className="absolute top-6 right-6 flex gap-4 z-10">
          <label className="flex items-center gap-2 bg-black text-white px-4 py-2 font-mono text-sm uppercase font-bold cursor-pointer hover:bg-[#ff3366] transition-colors border-2 border-black">
            <Upload className="w-4 h-4" />
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
          
          <button 
            onClick={handleDownload}
            disabled={!image || isProcessing}
            className="flex items-center gap-2 bg-white text-black px-4 py-2 font-mono text-sm uppercase font-bold cursor-pointer hover:bg-[#00ffcc] transition-colors border-2 border-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Save High-Res
          </button>
        </div>

        {/* Canvas / Empty State */}
        <div className="w-full h-full flex items-center justify-center">
          {!image ? (
            <div className="text-center border-4 border-dashed border-black p-12 bg-white max-w-md w-full">
              <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="font-display text-2xl uppercase mb-2">No Image Loaded</h3>
              <p className="font-mono text-sm text-gray-600 mb-6">Upload a photo to start processing</p>
              <label className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 font-mono text-sm uppercase font-bold cursor-pointer hover:bg-[#ff3366] transition-colors border-2 border-black">
                <Upload className="w-4 h-4" />
                Select Photo
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>
          ) : (
            <div 
              className={`relative shadow-[20px_20px_0px_0px_rgba(0,0,0,1)] border-4 border-black bg-white transition-transform duration-300 ${isDraggingSplit ? 'cursor-col-resize scale-[1.02]' : 'cursor-col-resize hover:scale-[1.02]'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <canvas 
                ref={canvasRef} 
                className="max-w-full max-h-[80vh] object-contain block touch-none"
                style={{ opacity: isProcessing ? 0.5 : 1 }}
              />
              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm pointer-events-none">
                  <RefreshCw className="w-12 h-12 animate-spin text-black" />
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Brutalist Decorative Elements */}
        <div className="absolute bottom-6 left-6 font-mono text-xs uppercase font-bold tracking-widest opacity-30 pointer-events-none">
          SYS.RISO.GEN // v2.0.0
        </div>
      </div>
    </div>
  );
}
