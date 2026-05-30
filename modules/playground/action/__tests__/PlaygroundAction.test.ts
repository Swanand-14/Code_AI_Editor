
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    playground: { findUnique: vi.fn() },
    templateFile: { upsert: vi.fn() },
  },
}));
 
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/modules/auth/actions", () => ({ currentUser: vi.fn() }));
 
import { currentUser } from "@/modules/auth/actions";
import { getPlaygroundById, SaveUpdatedCode } from "@/modules/playground/action";

const OWNER_ID = "user-123";
const PLAYGROUND_ID = "pg-abc";
 
const makeUser = (id = OWNER_ID) => ({ id, email: "dev@test.com" });
 
const makePlayground = (overrides = {}) => ({
  id: PLAYGROUND_ID,
  userId: OWNER_ID,
  name: "Test Playground",
  templateFiles: [{ id: "tf-1", content: JSON.stringify({ folderName: "Root", items: [] }), plagroundId: PLAYGROUND_ID }],
  Starmark: [],
  ...overrides,
});
 
const makeTemplateFolder = () => ({ folderName: "Root", items: [] });

describe("getPlaygroundById", () => {
  beforeEach(() => vi.clearAllMocks());
 
  it("returns playground with templateFiles for the owner", async () => {
    vi.mocked(currentUser).mockResolvedValue(makeUser());
    mockPrisma.playground.findUnique.mockResolvedValue(makePlayground());
 
    const result = await getPlaygroundById(PLAYGROUND_ID);
 
    expect(result.id).toBe(PLAYGROUND_ID);
    expect(result.templateFiles).toHaveLength(1);
  });
 
  it("throws when playground does not exist", async () => {
    vi.mocked(currentUser).mockResolvedValue(makeUser());
    mockPrisma.playground.findUnique.mockResolvedValue(null);
 
    await expect(getPlaygroundById("nonexistent")).rejects.toThrow("Playground not found");
  });
 
  it("throws when user does not own the playground", async () => {
    vi.mocked(currentUser).mockResolvedValue(makeUser("other-user"));
    mockPrisma.playground.findUnique.mockResolvedValue(makePlayground());
 
    await expect(getPlaygroundById(PLAYGROUND_ID)).rejects.toThrow("Unauthorized");
  });
 
  it("throws when user session is missing", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
 
    await expect(getPlaygroundById(PLAYGROUND_ID)).rejects.toThrow("Unauthorized");
  });
 
  it("handles templateFiles with corrupted JSON content without crashing the fetch", async () => {
    // The action itself just returns raw DB data — JSON parsing happens in the hook.
    // So the action should still return even if content is garbage.
    vi.mocked(currentUser).mockResolvedValue(makeUser());
    mockPrisma.playground.findUnique.mockResolvedValue(
      makePlayground({ templateFiles: [{ id: "tf-bad", content: "{{NOT_JSON}}", plagroundId: PLAYGROUND_ID }] })
    );
 
    const result = await getPlaygroundById(PLAYGROUND_ID);
    expect(result.templateFiles[0].content).toBe("{{NOT_JSON}}"); // raw, not parsed
  });
});

describe("SaveUpdatedCode", () => {
  beforeEach(() => vi.clearAllMocks());
 
  it("persists template data and returns the upserted record", async () => {
    vi.mocked(currentUser).mockResolvedValue(makeUser());
    mockPrisma.playground.findUnique.mockResolvedValue({ userId: OWNER_ID });
 
    const expectedRecord = { id: "tf-1", plagroundId: PLAYGROUND_ID, content: JSON.stringify(makeTemplateFolder()) };
    mockPrisma.templateFile.upsert.mockResolvedValue(expectedRecord);
 
    const result = await SaveUpdatedCode(PLAYGROUND_ID, makeTemplateFolder());
 
    expect(mockPrisma.templateFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plagroundId: PLAYGROUND_ID },
        update: { content: JSON.stringify(makeTemplateFolder()) },
      })
    );
    expect(result).toEqual(expectedRecord);
  });
 
  it("returns null when user session is missing", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
 
    const result = await SaveUpdatedCode(PLAYGROUND_ID, makeTemplateFolder());
 
    expect(result).toBeNull();
    expect(mockPrisma.templateFile.upsert).not.toHaveBeenCalled();
  });
 
  it("returns null when user does not own the playground", async () => {
    vi.mocked(currentUser).mockResolvedValue(makeUser("attacker-999"));
    mockPrisma.playground.findUnique.mockResolvedValue({ userId: OWNER_ID });
 
    const result = await SaveUpdatedCode(PLAYGROUND_ID, makeTemplateFolder());
 
    expect(result).toBeNull();
    expect(mockPrisma.templateFile.upsert).not.toHaveBeenCalled();
  });
 
  it("last write wins — second upsert overwrites first", async () => {
    vi.mocked(currentUser).mockResolvedValue(makeUser());
    mockPrisma.playground.findUnique.mockResolvedValue({ userId: OWNER_ID });
 
    const v1 = { folderName: "Root", items: [{ filename: "index", fileExtension: "ts", content: "v1" }] };
    const v2 = { folderName: "Root", items: [{ filename: "index", fileExtension: "ts", content: "v2" }] };
 
    mockPrisma.templateFile.upsert
      .mockResolvedValueOnce({ content: JSON.stringify(v1) })
      .mockResolvedValueOnce({ content: JSON.stringify(v2) });
 
    await SaveUpdatedCode(PLAYGROUND_ID, v1 as any);
    const result = await SaveUpdatedCode(PLAYGROUND_ID, v2 as any);
 
    expect(JSON.parse((result as any).content).items[0].content).toBe("v2");
    expect(mockPrisma.templateFile.upsert).toHaveBeenCalledTimes(2);
  });
 
  it("serialises large templateFiles (>1MB) without truncation", async () => {
    vi.mocked(currentUser).mockResolvedValue(makeUser());
    mockPrisma.playground.findUnique.mockResolvedValue({ userId: OWNER_ID });
 
    const largeContent = "x".repeat(1_100_000);
    const bigTemplate = { folderName: "Root", items: [{ filename: "big", fileExtension: "ts", content: largeContent }] };
 
    mockPrisma.templateFile.upsert.mockResolvedValue({ content: JSON.stringify(bigTemplate) });
 
    await SaveUpdatedCode(PLAYGROUND_ID, bigTemplate as any);
 
    const serialised: string = mockPrisma.templateFile.upsert.mock.calls[0][0].update.content;
    expect(serialised.length).toBeGreaterThan(1_000_000);
    expect(JSON.parse(serialised).items[0].content).toBe(largeContent);
  });
});
 