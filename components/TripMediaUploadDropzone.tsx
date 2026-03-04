"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";

type TripMediaUploadDropzoneProps = {
  inputName?: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function TripMediaUploadDropzone({ inputName = "files" }: TripMediaUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const selectedCountLabel = useMemo(() => {
    if (selectedFiles.length === 0) {
      return "No files selected";
    }

    if (selectedFiles.length === 1) {
      return "1 file selected";
    }

    return `${selectedFiles.length} files selected`;
  }, [selectedFiles]);

  function syncFiles(fileList: FileList | null) {
    if (!fileList) {
      setSelectedFiles([]);
      return;
    }

    setSelectedFiles(Array.from(fileList));
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    syncFiles(event.currentTarget.files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!isDragging) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    const input = inputRef.current;
    const droppedFiles = event.dataTransfer.files;
    if (!input || droppedFiles.length === 0) {
      return;
    }

    const transfer = new DataTransfer();
    Array.from(droppedFiles).forEach((file) => {
      transfer.items.add(file);
    });
    input.files = transfer.files;
    syncFiles(transfer.files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openFilePicker();
  }

  return (
    <div className="trip-media-dropzone-stack">
      <input
        ref={inputRef}
        className="trip-media-dropzone__input"
        type="file"
        name={inputName}
        multiple
        required
        accept="image/*,video/*"
        onChange={handleInputChange}
      />
      <div
        className={`trip-media-dropzone${isDragging ? " trip-media-dropzone--dragging" : ""}`}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="Click to add media files or drag and drop files"
      >
        <p className="trip-media-dropzone__title">Click to add files or drag and drop here</p>
        <p className="meta">Upload one or more images/videos at once (max 25 MB per file).</p>
      </div>
      <p className="meta">{selectedCountLabel}</p>
      {selectedFiles.length > 0 ? (
        <div className="trip-media-dropzone__file-list">
          {selectedFiles.map((file) => (
            <p key={`${file.name}-${file.lastModified}`}>
              {file.name} ({formatFileSize(file.size)})
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
