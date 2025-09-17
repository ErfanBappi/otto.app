
export interface ImageData {
  id: string;
  dataUrl: string;
  prompt: string;
  createdAt: Date;
  settings: GenerationSettings;
}

export interface GenerationSettings {
  lighting: string;
  aspectRatio: string;
  cameraPerspective: string;
}

export interface ImageFile {
  dataUrl: string;
  mimeType: string;
}
