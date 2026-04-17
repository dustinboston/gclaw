import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockFilesList,
  mockFilesGet,
  mockFilesCreate,
  mockFilesUpdate,
  mockFilesExport,
} = vi.hoisted(() => ({
  mockFilesList: vi.fn(),
  mockFilesGet: vi.fn(),
  mockFilesCreate: vi.fn(),
  mockFilesUpdate: vi.fn().mockResolvedValue({}),
  mockFilesExport: vi.fn(),
}));

vi.mock("../providers/drive.ts", () => ({
  drive: {
    files: {
      list: mockFilesList,
      get: mockFilesGet,
      create: mockFilesCreate,
      update: mockFilesUpdate,
      export: mockFilesExport,
    },
  },
  driveRequest: vi.fn((fn: () => any) => fn()),
}));

const { mockLogAudit } = vi.hoisted(() => ({
  mockLogAudit: vi.fn(),
}));

vi.mock("../audit.ts", () => ({
  logAudit: mockLogAudit,
}));

import {
  driveListFiles,
  driveReadFile,
  driveCreateFolder,
  driveMoveFile,
  driveRenameFile,
  driveUploadTextFile,
  driveTrashFile,
  driveUntrashFile,
} from "./drive.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("driveListFiles", () => {
  it("lists files with the default 'trashed = false' filter", async () => {
    mockFilesList.mockResolvedValue({
      data: { files: [{ id: "f1", name: "A", mimeType: "text/plain" }] },
    });

    const result = await driveListFiles.invoke({ pageSize: 50, includeTrashed: false });

    expect(mockFilesList).toHaveBeenCalledWith({
      q: "trashed = false",
      pageSize: 50,
      fields: expect.stringContaining("files("),
      spaces: "drive",
    });
    expect(JSON.parse(result)).toEqual([{ id: "f1", name: "A", mimeType: "text/plain" }]);
  });

  it("passes a custom query through verbatim", async () => {
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    await driveListFiles.invoke({
      query: "name contains 'report'",
      pageSize: 25,
      includeTrashed: false,
    });
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ q: "name contains 'report'" }),
    );
  });

  it("omits the query when includeTrashed is true and no query given", async () => {
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    await driveListFiles.invoke({ pageSize: 50, includeTrashed: true });
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ q: undefined }),
    );
  });

  it("returns '[]' when data.files is missing", async () => {
    mockFilesList.mockResolvedValue({ data: {} });
    const result = await driveListFiles.invoke({ pageSize: 50, includeTrashed: false });
    expect(result).toBe("[]");
  });
});

describe("driveReadFile", () => {
  it("returns metadata only for non-Docs files", async () => {
    mockFilesGet.mockResolvedValue({
      data: {
        id: "f1",
        name: "notes.txt",
        mimeType: "text/plain",
        size: "42",
      },
    });

    const result = JSON.parse(await driveReadFile.invoke({ id: "f1" }));

    expect(mockFilesGet).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1" }),
    );
    expect(mockFilesExport).not.toHaveBeenCalled();
    expect(result.id).toBe("f1");
    expect(result.body).toBeUndefined();
  });

  it("exports plain-text body for Google Docs files", async () => {
    mockFilesGet.mockResolvedValue({
      data: {
        id: "doc1",
        name: "Design doc",
        mimeType: "application/vnd.google-apps.document",
      },
    });
    mockFilesExport.mockResolvedValue({ data: "the document body" });

    const result = JSON.parse(await driveReadFile.invoke({ id: "doc1" }));

    expect(mockFilesExport).toHaveBeenCalledWith(
      { fileId: "doc1", mimeType: "text/plain" },
      { responseType: "text" },
    );
    expect(result.body).toBe("the document body");
  });
});

describe("driveCreateFolder", () => {
  it("creates a folder and logs a success audit entry", async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: "folder-123" } });

    const result = await driveCreateFolder.invoke({
      name: "Receipts",
      parentId: "parent-1",
      reason: "Organizing",
    });

    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: "Receipts",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["parent-1"],
        }),
      }),
    );
    expect(result).toBe('Folder "Receipts" created (id: folder-123).');
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "create_folder",
      "folder-123",
      "success",
      { subject: "Receipts", from: "parent-1", reason: "Organizing" },
    );
  });

  it("defaults to the Drive root when parentId is omitted", async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: "f2" } });
    await driveCreateFolder.invoke({ name: "Top" });
    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ parents: undefined }),
      }),
    );
  });

  it("logs a failure audit entry and re-throws when create fails", async () => {
    mockFilesCreate.mockRejectedValue(new Error("quota"));

    await expect(
      driveCreateFolder.invoke({ name: "Receipts" }),
    ).rejects.toThrow("quota");

    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "create_folder",
      "Receipts",
      "failure",
      "quota",
    );
  });
});

describe("driveMoveFile", () => {
  it("uses the supplied oldParentId directly when provided", async () => {
    await driveMoveFile.invoke({
      id: "f1",
      newParentId: "new-parent",
      oldParentId: "old-parent",
      reason: "reorg",
    });

    expect(mockFilesGet).not.toHaveBeenCalled();
    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "f1",
        addParents: "new-parent",
        removeParents: "old-parent",
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "move_file",
      "f1",
      "success",
      expect.objectContaining({ from: "old-parent", reason: "reorg" }),
    );
  });

  it("looks up current parents and name when oldParentId is omitted", async () => {
    mockFilesGet.mockResolvedValue({
      data: { parents: ["p1", "p2"], name: "notes.txt" },
    });

    await driveMoveFile.invoke({ id: "f1", newParentId: "new-parent" });

    expect(mockFilesGet).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f1" }),
    );
    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ removeParents: "p1,p2" }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "move_file",
      "f1",
      "success",
      expect.objectContaining({ subject: "notes.txt", from: "p1,p2" }),
    );
  });

  it("logs failure when the update call throws", async () => {
    mockFilesUpdate.mockRejectedValueOnce(new Error("perm"));
    await expect(
      driveMoveFile.invoke({ id: "f1", newParentId: "np", oldParentId: "op" }),
    ).rejects.toThrow("perm");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "move_file",
      "f1",
      "failure",
      "perm",
    );
  });
});

describe("driveRenameFile", () => {
  it("records the prior name in the audit log", async () => {
    mockFilesGet.mockResolvedValue({ data: { name: "old.txt" } });

    const result = await driveRenameFile.invoke({
      id: "f1",
      newName: "new.txt",
      reason: "typo",
    });

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "f1",
        requestBody: { name: "new.txt" },
      }),
    );
    expect(result).toBe('File f1 renamed to "new.txt" (was "old.txt").');
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "rename_file",
      "f1",
      "success",
      expect.objectContaining({ subject: "new.txt", from: "old.txt", reason: "typo" }),
    );
  });

  it("logs failure when the rename fails", async () => {
    mockFilesGet.mockResolvedValue({ data: { name: "old.txt" } });
    mockFilesUpdate.mockRejectedValueOnce(new Error("nope"));
    await expect(
      driveRenameFile.invoke({ id: "f1", newName: "new.txt" }),
    ).rejects.toThrow("nope");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "rename_file",
      "f1",
      "failure",
      "nope",
    );
  });
});

describe("driveUploadTextFile", () => {
  it("creates a file with the supplied content and mimeType and audits success", async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: "upl1" } });

    const result = await driveUploadTextFile.invoke({
      name: "todo.md",
      content: "- item",
      mimeType: "text/markdown",
      parentId: "p1",
      reason: "agent note",
    });

    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: "todo.md",
          parents: ["p1"],
        }),
        media: { mimeType: "text/markdown", body: "- item" },
      }),
    );
    expect(result).toBe('File "todo.md" uploaded (id: upl1).');
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "upload_file",
      "upl1",
      "success",
      { subject: "todo.md", from: "p1", reason: "agent note" },
    );
  });

  it("logs failure using the file name when create fails before an id exists", async () => {
    mockFilesCreate.mockRejectedValue(new Error("io error"));
    await expect(
      driveUploadTextFile.invoke({
        name: "todo.md",
        content: "x",
        mimeType: "text/plain",
      }),
    ).rejects.toThrow("io error");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "upload_file",
      "todo.md",
      "failure",
      "io error",
    );
  });
});

describe("driveTrashFile", () => {
  it("trashes a file and captures its current name for audit", async () => {
    mockFilesGet.mockResolvedValue({ data: { name: "stale.txt" } });

    const result = await driveTrashFile.invoke({ id: "f1", reason: "cleanup" });

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "f1",
        requestBody: { trashed: true },
      }),
    );
    expect(result).toBe("File f1 moved to trash.");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "trash_file",
      "f1",
      "success",
      { reason: "cleanup", subject: "stale.txt" },
    );
  });

  it("logs failure when the trash call fails", async () => {
    mockFilesGet.mockResolvedValue({ data: { name: "x" } });
    mockFilesUpdate.mockRejectedValueOnce(new Error("denied"));
    await expect(driveTrashFile.invoke({ id: "f1" })).rejects.toThrow("denied");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "trash_file",
      "f1",
      "failure",
      "denied",
    );
  });
});

describe("driveUntrashFile", () => {
  it("restores a file from trash and logs audit", async () => {
    const result = await driveUntrashFile.invoke({ id: "f1" });

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "f1",
        requestBody: { trashed: false },
      }),
    );
    expect(result).toBe("File f1 restored from trash.");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "untrash_file",
      "f1",
      "success",
    );
  });

  it("logs failure when the untrash call fails", async () => {
    mockFilesUpdate.mockRejectedValueOnce(new Error("missing"));
    await expect(driveUntrashFile.invoke({ id: "f1" })).rejects.toThrow("missing");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "drive",
      "untrash_file",
      "f1",
      "failure",
      "missing",
    );
  });
});
