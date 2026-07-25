"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileArchive,
  FileUp,
  History,
  Pencil,
  RefreshCcw,
  Search,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  normalizePublicFilePath,
  publicFileTitleFromPath,
  type PublicFileAccess,
  type PublicFileItem,
} from "@/lib/public-files";
import { cn } from "@/lib/utils";

type PublicFilesResponse = {
  files?: PublicFileItem[];
  file?: PublicFileItem;
  upload?: {
    path: string;
    versionId: string;
    s3Key: string;
    uploadUrl: string;
    headers: Record<string, string>;
  };
  error?: string;
};

const emptyUpload = {
  path: "",
  title: "",
  description: "",
  access: "public" as PublicFileAccess,
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 bytes";
  const units = ["bytes", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const amount = value / 1024 ** unitIndex;
  return `${amount.toLocaleString(undefined, {
    maximumFractionDigits: unitIndex ? 1 : 0,
  })} ${units[unitIndex]}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

async function responseBody(response: Response) {
  return (await response.json().catch(() => ({}))) as PublicFilesResponse;
}

export function PublicFileLibraryPanel() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PublicFileItem[]>([]);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [uploadForm, setUploadForm] = useState(emptyUpload);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAccess, setEditAccess] = useState<PublicFileAccess>("public");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/public-files", { cache: "no-store" });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || "Failed to load public files");
      setFiles(Array.isArray(body.files) ? body.files : []);
    } catch (loadError: any) {
      setError(loadError?.message || "Failed to load public files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return files.filter((file) => {
      if (!showArchived && file.status === "archived") return false;
      if (!normalizedQuery) return true;
      return [
        file.title,
        file.description,
        file.path,
        file.originalFileName,
        file.contentType,
        file.access,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [files, query, showArchived]);

  const activeCount = files.filter((file) => file.status === "active").length;
  const archivedCount = files.length - activeCount;

  const selectUploadFile = (file: File | null) => {
    setUploadFile(file);
    if (!file) return;
    try {
      const path = normalizePublicFilePath(file.name);
      setUploadForm((current) => ({
        path: current.path || path,
        title: current.title || publicFileTitleFromPath(path),
        description: current.description,
        access: current.access,
      }));
      setError(null);
    } catch (selectionError: any) {
      setError(selectionError?.message || "Choose a supported public file.");
    }
  };

  const uploadToStorage = async ({
    file,
    path,
    title,
    description,
    access,
    replace,
  }: {
    file: File;
    path: string;
    title: string;
    description: string;
    access: PublicFileAccess;
    replace: boolean;
  }) => {
    const prepareResponse = await fetch("/api/admin/public-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prepareUpload",
        path,
        title,
        description,
        access,
        fileName: file.name,
        fileSize: file.size,
        replace,
      }),
    });
    const prepared = await responseBody(prepareResponse);
    if (!prepareResponse.ok || !prepared.upload) {
      throw new Error(prepared.error || "Failed to prepare the public file upload");
    }

    const storageResponse = await fetch(prepared.upload.uploadUrl, {
      method: "PUT",
      headers: prepared.upload.headers,
      body: file,
    });
    if (!storageResponse.ok) {
      throw new Error("The file could not be uploaded to storage.");
    }

    const completeResponse = await fetch("/api/admin/public-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "completeUpload",
        path: prepared.upload.path,
        versionId: prepared.upload.versionId,
        s3Key: prepared.upload.s3Key,
        title,
        description,
        access,
        fileName: file.name,
        replace,
      }),
    });
    const completed = await responseBody(completeResponse);
    if (!completeResponse.ok || !completed.file) {
      throw new Error(completed.error || "Failed to finish the public file upload");
    }
    return completed.file;
  };

  const submitUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadFile) {
      setError("Choose a file to upload.");
      return;
    }

    setBusyKey("upload");
    setError(null);
    setNotice(null);
    try {
      const file = await uploadToStorage({
        file: uploadFile,
        path: uploadForm.path,
        title: uploadForm.title,
        description: uploadForm.description,
        access: uploadForm.access,
        replace: false,
      });
      setUploadForm(emptyUpload);
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      setNotice(
        file.access === "members"
          ? `Uploaded ${file.title} for members only at ${file.url}.`
          : `Published ${file.title} at ${file.url}.`,
      );
      await loadFiles();
    } catch (uploadError: any) {
      setError(uploadError?.message || "Failed to upload the public file");
    } finally {
      setBusyKey(null);
    }
  };

  const replaceFile = async (existing: PublicFileItem, file: File | null) => {
    if (!file) return;
    if (
      !window.confirm(
        `Replace "${existing.title}" with ${file.name}? The resource URL will stay the same and the current version will remain recoverable.`,
      )
    ) {
      return;
    }

    setBusyKey(`replace:${existing.path}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await uploadToStorage({
        file,
        path: existing.path,
        title: existing.title,
        description: existing.description,
        access: existing.access,
        replace: true,
      });
      setNotice(`Replaced ${updated.title}. Its resource URL did not change.`);
      await loadFiles();
    } catch (replaceError: any) {
      setError(replaceError?.message || "Failed to replace the public file");
    } finally {
      setBusyKey(null);
    }
  };

  const runAction = async (
    file: PublicFileItem,
    action: "archive" | "restore" | "restorePreviousVersion",
  ) => {
    const labels = {
      archive: "archive",
      restore: "restore",
      restorePreviousVersion: "restore the previous version of",
    } as const;
    if (
      !window.confirm(
        `${labels[action][0].toUpperCase()}${labels[action].slice(1)} "${file.title}"?`,
      )
    ) {
      return;
    }

    setBusyKey(`${action}:${file.path}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/public-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, path: file.path }),
      });
      const body = await responseBody(response);
      if (!response.ok || !body.file) {
        throw new Error(body.error || `Failed to ${labels[action]} the public file`);
      }
      setNotice(
        action === "archive"
          ? `${file.title} is archived and no longer accessible.`
          : action === "restore"
            ? `${file.title} is accessible again under its ${file.access === "members" ? "members-only" : "public"} setting.`
            : `Restored the previous version of ${file.title}.`,
      );
      await loadFiles();
    } catch (actionError: any) {
      setError(actionError?.message || "Failed to update the public file");
    } finally {
      setBusyKey(null);
    }
  };

  const beginEdit = (file: PublicFileItem) => {
    setEditingPath(file.path);
    setEditTitle(file.title);
    setEditDescription(file.description);
    setEditAccess(file.access);
    setError(null);
    setNotice(null);
  };

  const saveEdit = async (file: PublicFileItem) => {
    setBusyKey(`edit:${file.path}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/public-files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: file.path,
          title: editTitle,
          description: editDescription,
          access: editAccess,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok || !body.file) {
        throw new Error(body.error || "Failed to save public file details");
      }
      setEditingPath(null);
      setNotice(`Updated details for ${body.file.title}.`);
      await loadFiles();
    } catch (editError: any) {
      setError(editError?.message || "Failed to save public file details");
    } finally {
      setBusyKey(null);
    }
  };

  const copyUrl = async (file: PublicFileItem) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setNotice(`Copied ${file.url}`);
      setError(null);
    } catch {
      setError(`Copy failed. The resource URL is ${file.url}`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Active files", activeCount],
          ["Archived", archivedCount],
          ["Stored versions", files.reduce((sum, file) => sum + file.previousVersionCount + 1, 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white/85 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</div>
          </div>
        ))}
      </div>

      <form
        onSubmit={submitUpload}
        className="rounded-2xl border border-[rgba(245,168,0,0.35)] bg-white/90 p-5 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--brand-ink)] text-[var(--zcash-gold)]">
            <FileUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Upload a resource file</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Every file gets a stable
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">/resources/...</code>
              URL. Choose public access for anyone with the link, or members-only access to
              require a signed-in member of this site.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            File
            <input
              ref={uploadInputRef}
              type="file"
              onChange={(event) => selectUploadFile(event.target.files?.[0] || null)}
              accept=".pdf,.docx,.xlsx,.pptx,.csv,.txt,.png,.jpg,.jpeg,.webp,.zip"
              className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
              required
            />
            <span className="block text-xs font-normal text-slate-500">
              PDF, Office, CSV, text, common images, or ZIP; maximum 50 MB.
            </span>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Resource path
            <div className="flex rounded-md border bg-white focus-within:ring-2 focus-within:ring-[var(--zcash-gold)]">
              <span className="flex items-center border-r bg-slate-50 px-3 text-xs text-slate-500">
                /resources/
              </span>
              <input
                value={uploadForm.path}
                onChange={(event) =>
                  setUploadForm((current) => ({ ...current, path: event.target.value }))
                }
                placeholder="statements-for-the-record/example.pdf"
                className="min-w-0 flex-1 rounded-r-md px-3 py-2 text-sm outline-none"
                required
              />
            </div>
            <span className="block text-xs font-normal text-slate-500">
              Folders are supported. The path is normalized to lowercase URL-safe text.
            </span>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Display title
            <input
              value={uploadForm.title}
              onChange={(event) =>
                setUploadForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Statement for the Record"
              className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Description
            <input
              value={uploadForm.description}
              onChange={(event) =>
                setUploadForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Optional internal context for administrators"
              className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="space-y-1.5 text-sm text-slate-700">
            <label htmlFor="public-file-upload-access" className="block font-medium">
              Access
            </label>
            <select
              id="public-file-upload-access"
              value={uploadForm.access}
              onChange={(event) =>
                setUploadForm((current) => ({
                  ...current,
                  access: event.target.value as PublicFileAccess,
                }))
              }
              className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="public">Public — anyone with the link</option>
              <option value="members">Members only — sign-in required</option>
            </select>
            <span className="block text-xs font-normal text-slate-500">
              You can change access later without changing the URL.
            </span>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            disabled={busyKey === "upload"}
            isLoading={busyKey === "upload"}
          >
            <Upload className="h-4 w-4" />
            {busyKey === "upload" ? "Uploading" : "Upload file"}
          </Button>
        </div>
      </form>

      {error ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white/90 shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Resource file library</h2>
            <p className="mt-1 text-sm text-slate-500">
              Replace files without changing their URLs, switch between public and members-only
              access, edit labels, archive access, or restore the prior stored version.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search resource files"
                className="w-64 rounded-md border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="h-4 w-4 accent-[var(--zcash-gold)]"
              />
              Show archived
            </label>
            <Button type="button" variant="outline" onClick={loadFiles} disabled={loading}>
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading public files...</div>
        ) : visibleFiles.length ? (
          <div className="divide-y">
            {visibleFiles.map((file) => {
              const replacing = busyKey === `replace:${file.path}`;
              const editing = editingPath === file.path;
              return (
                <article key={file.path} className="p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileArchive className="h-5 w-5 text-[var(--brand-denim)]" />
                        <h3 className="font-semibold text-[var(--brand-ink)]">{file.title}</h3>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]",
                            file.status === "active"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {file.status}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]",
                            file.access === "members"
                              ? "bg-indigo-50 text-indigo-800"
                              : "bg-sky-50 text-sky-800",
                          )}
                        >
                          {file.access === "members" ? "Members only" : "Public"}
                        </span>
                      </div>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-all text-sm font-medium text-[var(--brand-denim)] underline"
                      >
                        {file.url}
                      </a>
                      {file.description ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">{file.description}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-slate-500">
                        {file.originalFileName} · {formatBytes(file.fileSize)} · Updated{" "}
                        {formatDateTime(file.updatedAt)}
                        {file.previousVersionCount
                          ? ` · ${file.previousVersionCount} previous ${file.previousVersionCount === 1 ? "version" : "versions"}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => copyUrl(file)}>
                        <Copy className="h-4 w-4" />
                        Copy URL
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => beginEdit(file)}>
                        <Pencil className="h-4 w-4" />
                        Edit details
                      </Button>
                      {file.status === "active" ? (
                        <>
                          <label
                            className={cn(
                              "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white px-3 text-sm font-medium shadow-sm hover:bg-slate-50",
                              replacing && "pointer-events-none opacity-60",
                            )}
                          >
                            <FileUp className="h-4 w-4" />
                            {replacing ? "Replacing" : "Replace"}
                            <input
                              type="file"
                              className="sr-only"
                              accept={`.${file.path.split(".").pop() || ""}`}
                              disabled={replacing}
                              onChange={(event) => {
                                void replaceFile(file, event.target.files?.[0] || null);
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                          {file.previousVersionCount ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyKey === `restorePreviousVersion:${file.path}`}
                              onClick={() => runAction(file, "restorePreviousVersion")}
                            >
                              <History className="h-4 w-4" />
                              Restore prior
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-amber-200 text-amber-800 hover:bg-amber-50"
                            disabled={busyKey === `archive:${file.path}`}
                            onClick={() => runAction(file, "archive")}
                          >
                            <Archive className="h-4 w-4" />
                            Archive
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyKey === `restore:${file.path}`}
                          onClick={() => runAction(file, "restore")}
                        >
                          <ArchiveRestore className="h-4 w-4" />
                          Restore access
                        </Button>
                      )}
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-4 grid gap-3 rounded-xl border bg-slate-50 p-4 lg:grid-cols-[1fr_1.5fr_0.8fr_auto] lg:items-end">
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Display title
                        <input
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Description
                        <input
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
                          className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <div className="space-y-1 text-sm text-slate-700">
                        <label htmlFor="public-file-edit-access" className="block font-medium">
                          Access
                        </label>
                        <select
                          id="public-file-edit-access"
                          value={editAccess}
                          onChange={(event) =>
                            setEditAccess(event.target.value as PublicFileAccess)
                          }
                          className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
                        >
                          <option value="public">Public</option>
                          <option value="members">Members only</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveEdit(file)}
                          disabled={busyKey === `edit:${file.path}`}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingPath(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-600">
            {files.length
              ? "No resource files match this view."
              : "No resource files have been uploaded yet."}
          </div>
        )}
      </div>
    </div>
  );
}
