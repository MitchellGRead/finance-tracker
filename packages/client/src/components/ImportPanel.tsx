import { useState, useCallback, useRef } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Label } from "./ui/label";

interface ImportPanelProps {
  month: number;
  year: number;
}

export function ImportPanel({ month, year }: ImportPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [sourceType, setSourceType] = useState<"amex" | "td">("amex");
  const [userName, setUserName] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const getUserId = (name: string) =>
    usersQuery.data?.find((u) => u.name === name)?.id;

  const uploadMutation = useMutation(
    trpc.statements.upload.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.lineItems.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.lineItems.countByMonth.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.statements.list.queryKey(),
        });
      },
    })
  );

  const addFiles = (newFiles: FileList | File[]) => {
    const csvFiles = Array.from(newFiles).filter((f) =>
      f.name.endsWith(".csv")
    );
    if (csvFiles.length > 0) {
      setFiles((prev) => [...prev, ...csvFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    []
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    const userId = getUserId(userName);
    if (files.length === 0 || !userId) return;

    setImporting(true);
    setProgress({ current: 0, total: files.length });

    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length });
      const content = await files[i].text();
      await uploadMutation.mutateAsync({
        userId,
        sourceType,
        fileName: files[i].name,
        content,
        periodMonth: month,
        periodYear: year,
      });
    }

    setFiles([]);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">
        Import Statement
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <Label className="text-xs mb-1">Source</Label>
          <Select
            value={sourceType}
            onValueChange={(v) => {
              if (v) setSourceType(v as "amex" | "td");
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="amex">American Express</SelectItem>
              <SelectItem value="td">TD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs mb-1">User</Label>
          <Select
            value={userName}
            onValueChange={(v) => {
              if (v) setUserName(v);
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              {usersQuery.data?.map((user) => (
                <SelectItem key={user.id} value={user.name}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        className={`relative rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {files.length > 0 ? (
          <div className="space-y-1 text-left">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground truncate">
                  {file.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(i)}
                  className="h-5 px-1 text-[10px] text-muted-foreground hover:text-destructive"
                >
                  x
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <label className="cursor-pointer text-muted-foreground">
            Drop CSV(s) here or{" "}
            <span className="text-primary underline">browse</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        )}
      </div>

      {files.length > 0 && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {files.length} file{files.length > 1 ? "s" : ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              setFiles([]);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            Clear all
          </Button>
        </div>
      )}

      <Button
        className="mt-3 w-full h-8 text-sm"
        onClick={handleUpload}
        disabled={files.length === 0 || !userName || importing}
      >
        {importing
          ? `Importing ${progress.current}/${progress.total}...`
          : `Import${files.length > 1 ? ` (${files.length} files)` : ""}`}
      </Button>

      {uploadMutation.isError && (
        <p className="mt-2 text-xs text-destructive">
          {uploadMutation.error.message}
        </p>
      )}
    </div>
  );
}
