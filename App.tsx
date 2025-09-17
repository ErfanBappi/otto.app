import React, { useState, useCallback } from 'react';
import type { ImageData, GenerationSettings, ImageFile } from './types';
import { getSceneIdeasFromText, getSceneIdeaFromImage, generateImage, editImage } from './services/geminiService';
import { LIGHTING_OPTIONS, ASPECT_RATIO_OPTIONS, CAMERA_PERSPECTIVE_OPTIONS } from './constants';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import ControlPanel from './components/ControlPanel';
import HistoryPanel from './components/HistoryPanel';
import GeneratedImageDisplay from './components/GeneratedImageDisplay';

const padImageToAspectRatio = (
    imageFile: ImageFile,
    aspectRatio: string
  ): Promise<ImageFile> => {
    return new Promise((resolve, reject) => {
      const [w, h] = aspectRatio.split(':').map(Number);
      if (!w || !h) {
          return reject(new Error('Invalid aspect ratio format'));
      }
      const targetRatio = w / h;
  
      const img = new Image();
      img.onload = () => {
        const sourceWidth = img.width;
        const sourceHeight = img.height;
        const sourceRatio = sourceWidth / sourceHeight;
  
        // Check if padding is needed (with a small tolerance)
        if (Math.abs(sourceRatio - targetRatio) < 0.01) {
          resolve(imageFile);
          return;
        }
        
        let canvasWidth = sourceWidth;
        let canvasHeight = sourceHeight;
  
        if (sourceRatio > targetRatio) {
          // Source is wider than target, need to add height (padding top/bottom)
          canvasHeight = sourceWidth / targetRatio;
        } else {
          // Source is taller than target, need to add width (padding left/right)
          canvasWidth = sourceHeight * targetRatio;
        }
  
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }
        
        // The model is asked to replace the background, so white is a safe bet.
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        const drawX = (canvasWidth - sourceWidth) / 2;
        const drawY = (canvasHeight - sourceHeight) / 2;
        
        ctx.drawImage(img, drawX, drawY, sourceWidth, sourceHeight);
  
        const newDataUrl = canvas.toDataURL(imageFile.mimeType);
        resolve({
          dataUrl: newDataUrl,
          mimeType: imageFile.mimeType,
        });
      };
      img.onerror = (err) => reject(new Error('Failed to load image for padding: ' + err));
      img.src = imageFile.dataUrl;
    });
};

const getAspectRatioClass = (ratio: string) => {
    const ratioValue = ratio.split(' ')[0];
    switch (ratioValue) {
        case '16:9': return 'aspect-[16/9]';
        case '4:3': return 'aspect-[4/3]';
        case '3:2': return 'aspect-[3/2]';
        case '9:16': return 'aspect-[9/16]';
        case '3:4': return 'aspect-[3/4]';
        case '4:5': return 'aspect-[4/5]';
        case '2:3': return 'aspect-[2/3]';
        case '1:1':
        default:
            return 'aspect-square';
    }
}

const App: React.FC = () => {
    const [productImage, setProductImage] = useState<ImageFile | null>(null);
    const [generatedImage, setGeneratedImage] = useState<ImageData | null>(null);
    
    const [settings, setSettings] = useState<GenerationSettings>({
        lighting: LIGHTING_OPTIONS[0],
        aspectRatio: ASPECT_RATIO_OPTIONS[0],
        cameraPerspective: CAMERA_PERSPECTIVE_OPTIONS[0],
    });
    const [customPrompt, setCustomPrompt] = useState('');
    const [history, setHistory] = useState<ImageData[]>([]);
    const [environmentIdeas, setEnvironmentIdeas] = useState<string[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isTextIdeaLoading, setIsTextIdeaLoading] = useState(false);
    const [isImageIdeaLoading, setIsImageIdeaLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSettingsChange = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleGetIdeasFromText = async (description: string) => {
        if (!description.trim()) return;
        setIsTextIdeaLoading(true);
        setError(null);
        setEnvironmentIdeas([]);
        try {
            const ideas = await getSceneIdeasFromText(description);
            setEnvironmentIdeas(ideas);
        } catch (err) {
            setError((err as Error).message);
            console.error(err);
        } finally {
            setIsTextIdeaLoading(false);
        }
    };

    const handleGetIdeaFromImage = async (file: ImageFile) => {
        setIsImageIdeaLoading(true);
        setError(null);
        setEnvironmentIdeas([]);
        try {
            const ideas = await getSceneIdeaFromImage(file.dataUrl, file.mimeType);
            if (ideas && ideas.length > 0) {
                setEnvironmentIdeas(ideas);
            } else {
                setError('Failed to generate ideas from the image.');
            }
        } catch (err) {
            setError((err as Error).message);
            console.error(err);
        } finally {
            setIsImageIdeaLoading(false);
        }
    };
    
    const handleUsePromptIdea = (prompt: string) => {
        setCustomPrompt(prompt);
        setEnvironmentIdeas([]);
    };

    const handleGenerateImage = async () => {
        if (!productImage) {
            setError("Please upload a product image first.");
            return;
        }
        if (!customPrompt.trim()) {
            setError("Please provide a prompt for the background scene.");
            return;
        }
        setIsLoading(true);
        setError(null);
        
        const placeholderImage = generatedImage || {
            dataUrl: productImage.dataUrl,
            id: 'loading-placeholder',
            prompt: customPrompt,
            createdAt: new Date(),
            settings,
        };
        setGeneratedImage(placeholderImage);

        try {
            const apiSettings = {
                ...settings,
                aspectRatio: settings.aspectRatio.split(' ')[0],
            };

            const paddedImageFile = await padImageToAspectRatio(productImage, apiSettings.aspectRatio);
            const base64Data = paddedImageFile.dataUrl.split(',')[1];
            
            const resultBase64 = await generateImage(base64Data, paddedImageFile.mimeType, customPrompt, apiSettings);
            
            const newImage: ImageData = {
                id: new Date().toISOString(),
                dataUrl: `data:${paddedImageFile.mimeType};base64,${resultBase64}`,
                prompt: customPrompt,
                createdAt: new Date(),
                settings
            };
            setGeneratedImage(newImage);
            setHistory(prev => [newImage, ...prev].slice(0, 20)); 
        } catch (err) {
            setError((err as Error).message || 'An unknown error occurred during image generation.');
            console.error(err);
            setGeneratedImage(productImage ? {
                id: 'failed-generation',
                dataUrl: productImage.dataUrl,
                prompt: '',
                createdAt: new Date(),
                settings,
            } : null); 
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditImage = async (editPrompt: string) => {
        if (!generatedImage) {
            setError("There is no image to edit.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const base64Data = generatedImage.dataUrl.split(',')[1];
            const mimeType = generatedImage.dataUrl.match(/:(.*?);/)?.[1] || 'image/png';

            const resultBase64 = await editImage(base64Data, mimeType, editPrompt);

            const newImage: ImageData = {
                id: new Date().toISOString(),
                dataUrl: `data:${mimeType};base64,${resultBase64}`,
                prompt: `${generatedImage.prompt} (Edited: ${editPrompt})`,
                createdAt: new Date(),
                settings: generatedImage.settings,
            };
            setGeneratedImage(newImage);
            setHistory(prev => [newImage, ...prev].slice(0, 20));
        } catch (err) {
            setError((err as Error).message || 'An unknown error occurred while editing the image.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }

    const handleHistorySelect = async (image: ImageData) => {
        setSettings(image.settings);
        setCustomPrompt(image.prompt);
        setGeneratedImage(image);
        const imageFile = { dataUrl: image.dataUrl, mimeType: image.dataUrl.match(/:(.*?);/)?.[1] || 'image/png' };
        setProductImage(imageFile);
        window.scrollTo(0, 0);
    }
    
    return (
        <div className="min-h-screen bg-[#F7F9FC] text-gray-800 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <Header />
                {error && <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg cursor-pointer" onClick={() => setError(null)}>{error}</div>}

                <main className="grid grid-cols-1 lg:grid-cols-[1fr,minmax(400px,450px)] gap-8 items-start">
                    <div className="space-y-4">
                      {generatedImage ? (
                         <GeneratedImageDisplay 
                            image={generatedImage} 
                            isLoading={isLoading} 
                            onEditImage={handleEditImage}
                            onGenerateNew={() => { setGeneratedImage(null); setProductImage(null); }}
                         />
                      ) : productImage ? (
                        <div className={`w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-2 ${getAspectRatioClass(settings.aspectRatio)}`}>
                            <div className="relative w-full h-full rounded-xl overflow-hidden bg-gray-100">
                                <img src={productImage.dataUrl} alt="Product to edit" className="w-full h-full object-contain"/>
                            </div>
                        </div>
                      ) : (
                         <ImageUploader onImageUpload={(file) => { setProductImage(file); setGeneratedImage(null); }} aspectRatio={settings.aspectRatio} />
                      )}

                        <button
                            onClick={handleGenerateImage}
                            className="w-full py-4 px-6 bg-[#adff00] text-black text-lg font-bold rounded-2xl hover:opacity-90 transition-opacity shadow-sm"
                        >
                            {isLoading && !generatedImage?.id.startsWith('loading') ? '...' : 'Generate Image'}
                        </button>
                    </div>
                    <div className="space-y-6">
                      <ControlPanel 
                          settings={settings}
                          onSettingsChange={handleSettingsChange}
                          customPrompt={customPrompt}
                          onCustomPromptChange={setCustomPrompt}
                          onGetIdeasFromText={handleGetIdeasFromText}
                          onGetIdeaFromImage={handleGetIdeaFromImage}
                          isTextIdeaLoading={isTextIdeaLoading}
                          isImageIdeaLoading={isImageIdeaLoading}
                          environmentIdeas={environmentIdeas}
                          onUsePromptIdea={handleUsePromptIdea}
                      />
                    </div>
                </main>
                
                <HistoryPanel history={history} onSelect={handleHistorySelect}/>
            </div>
        </div>
    );
};

export default App;