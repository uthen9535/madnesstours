export type LibraryMemeSource = "asset" | "legacy";

export type LibraryMemeFileType = "IMAGE" | "GIF";

export type LibraryMemeDto = {
  id: string;
  imageDataUrl: string;
  thumbnailUrl: string;
  uploader: string;
  caption: string;
  createdAt: number;
  source: LibraryMemeSource;
  fileType: LibraryMemeFileType;
  copyUrl: string;
  canDelete: boolean;
};
