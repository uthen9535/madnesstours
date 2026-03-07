"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";

type TripMediaUploadDropzoneProps = {
  inputName?: string;
  onSelectionChange?: (count: number) => void;
  resetSignal?: number;
  multiple?: boolean;
  required?: boolean;
  accept?: string;
  title?: string;
  helperText?: string;
  maxBytesPerFile?: number;
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

export function TripMediaUploadDropzone({
  inputName = "files",
  onSelectionChange,
  resetSignal = 0,
  multiple = true,
  required = true,
  accept = "image/*,video/*",
  title = "Click to add files or drag and drop here",
  helperText = "Upload one or more images/videos at once (max 25 MB per file).",
  maxBytesPerFile = 25 * 1024 * 1024
}: TripMediaUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFiles([]);
    setErrorMessage(null);
    onSelectionChange?.(0);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [resetSignal, onSelectionChange]);

  const selectedCountLabel = useMemo(() => {
    if (selectedFiles.length === 0) {
      return multiple ? "No files selected" : "No file selected";
    }

    if (!multiple || selectedFiles.length === 1) {
      return "1 file selected";
    }

    return `${selectedFiles.length} files selected`;
  }, [multiple, selectedFiles]);

  function syncFiles(fileList: FileList | null) {
    if (!fileList) {
      setSelectedFiles([]);
      setErrorMessage(null);
      onSelectionChange?.(0);
      return;
    }

    const files = multiple ? Array.from(fileList) : Array.from(fileList).slice(0, 1);
    const oversized = files.find((file) => file.size > maxBytesPerFile);
    if (oversized) {
      setSelectedFiles([]);
      setErrorMessage(`${oversized.name} is too large. Max ${formatFileSize(maxBytesPerFile)} per file.`);
      onSelectionChange?.(0);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    setErrorMessage(null);
    setSelectedFiles(files);
    onSelectionChange?.(files.length);
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
    const filesToAdd = multiple ? Array.from(droppedFiles) : Array.from(droppedFiles).slice(0, 1);
    filesToAdd.forEach((file) => {
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
        multiple={multiple}
        required={required}
        accept={accept}
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
        aria-label={title}
      >
        <p className="trip-media-dropzone__title">{title}</p>
        <p className="meta">{helperText}</p>
      </div>
      <p className="meta">{selectedCountLabel}</p>
      {errorMessage ? <p className="meta" style={{ color: "#ff6b6b" }}>{errorMessage}</p> : null}
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
