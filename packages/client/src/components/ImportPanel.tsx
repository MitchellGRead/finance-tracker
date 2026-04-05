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
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const getUserId = (name: string) =>
    usersQuery.data?.find((u) => u.name === name)?.id;

  const uploadMutation = useMutation(
    trpc.statements.upload.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.lineItems.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.lineItems.countByMonth.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.statements.list.queryKey() });
        setFile(null);
        uploadMutation.reset();
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    })
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith(".csv")) {
      setFile(droppedFile);
      uploadMutation.reset();
    }
  }, [uploadMutation]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      uploadMutation.reset();
    }
  };

  const handleUpload = async () => {
    const userId = getUserId(userName);
    if (!file || !userId) return;

    const content = await file.text();
    uploadMutation.mutate({
      userId,
      sourceType,
      fileName: file.name,
      content,
      periodMonth: month,
      periodYear: year,
    });
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
            onValueChange={(v) => { if (v) setSourceType(v as "amex" | "td"); }}
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
          <Select value={userName} onValueChange={(v) => { if (v) setUserName(v); }}>
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
        {file ? (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{file.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null);
                uploadMutation.reset();
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="h-6 text-xs"
            >
              Clear
            </Button>
          </div>
        ) : (
          <label className="cursor-pointer text-muted-foreground">
            Drop CSV here or{" "}
            <span className="text-primary underline">browse</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        )}
      </div>

      <Button
        className="mt-3 w-full h-8 text-sm"
        onClick={handleUpload}
        disabled={!file || !userName || uploadMutation.isPending}
      >
        {uploadMutation.isPending ? "Importing..." : "Import"}
      </Button>

      {uploadMutation.isError && (
        <p className="mt-2 text-xs text-destructive">
          {uploadMutation.error.message}
        </p>
      )}
    </div>
  );
}
