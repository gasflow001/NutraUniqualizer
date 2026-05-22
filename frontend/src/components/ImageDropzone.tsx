import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "../lib/cn";

type Props = {
  onDrop: (file: File) => void;
  preview?: string | null;
  label?: string;
  accept?: Record<string, string[]>;
  className?: string;
};

const DEFAULT_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export default function ImageDropzone({
  onDrop,
  preview,
  label = "Перетащите картинку сюда или кликните",
  accept = DEFAULT_ACCEPT,
  className,
}: Props) {
  const handleDrop = useCallback(
    (files: File[]) => {
      if (files[0]) onDrop(files[0]);
    },
    [onDrop]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept,
    multiple: false,
    maxSize: 10 * 1024 * 1024,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative cursor-pointer rounded-xl border-2 border-dashed bg-zinc-900/40 transition",
        isDragActive ? "border-primary bg-primary/10" : "border-zinc-700 hover:border-zinc-500",
        "min-h-[260px] flex items-center justify-center p-4",
        className
      )}
    >
      <input {...getInputProps()} />
      {preview ? (
        <img
          src={preview}
          className="max-h-[420px] max-w-full object-contain rounded-lg"
          alt="preview"
        />
      ) : (
        <p className="text-sm text-zinc-500 text-center">
          {label}
          <br />
          <span className="text-xs">JPG / PNG / WebP, до 10 МБ</span>
        </p>
      )}
    </div>
  );
}
