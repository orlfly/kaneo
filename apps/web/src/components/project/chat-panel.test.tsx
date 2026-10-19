import enUS from "@i18n/en-US.json";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPanel from "./chat-panel";

// A dedicated instance: the app singleton must not be imported beside a
// react-i18next mock. Inline resources keep the copy available synchronously.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

beforeEach(async () => {
  await translations;
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  // Bind once: a fresh `t` on every render re-creates anything keyed on it.
  const t = i18next.t.bind(i18next);
  return { ...actual, useTranslation: () => ({ t, i18n: i18next }) };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/queries/project/use-chat-messages", () => ({
  default: () => ({
    data: [
      {
        id: "m1",
        projectId: "project-1",
        role: "user",
        content: "历史消息",
        createdAt: "2026-08-24T00:00:00.000Z",
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/fetchers/project/chat", () => ({
  getChatStatus: vi.fn(),
  streamChatMessage: vi.fn(),
  clearChatHistory: vi.fn(),
}));

vi.mock("@/components/public-project/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("lucide-react", () => ({
  BotIcon: () => null,
  CheckIcon: () => null,
  Loader2Icon: () => null,
  Paperclip: () => null,
  SendIcon: () => null,
  Trash2: () => null,
  UserIcon: () => null,
}));

import {
  clearChatHistory,
  getChatStatus,
  streamChatMessage,
} from "@/fetchers/project/chat";

const mockGetChatStatus = vi.mocked(getChatStatus);
const mockStreamChatMessage = vi.mocked(streamChatMessage);
const mockClearChatHistory = vi.mocked(clearChatHistory);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel(enabled: boolean) {
  mockGetChatStatus.mockResolvedValue({ enabled });
  return render(<ChatPanel projectId="project-1" />);
}

describe("ChatPanel", () => {
  it("renders the not-enabled notice instead of an input when AI is off", async () => {
    renderPanel(false);
    // Status resolves to disabled => full-page notice, no input.
    expect(await screen.findByText("AI assistant not enabled")).toBeDefined();
    expect(
      screen.queryByPlaceholderText("Send a message to pi-agent…"),
    ).toBeNull();
  });

  it("keeps the input editable while the status is still loading", () => {
    mockGetChatStatus.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ChatPanel projectId="project-1" />);
    const input = container.querySelector("input") as HTMLInputElement | null;
    expect(input).not.toBeNull();
    if (input) {
      expect(input.disabled).toBe(false);
    }
  });

  it("enables the input when AI is enabled", async () => {
    renderPanel(true);
    const input = await screen.findByPlaceholderText(
      "Send a message to pi-agent…",
    );
    await waitFor(() => expect(input).not.toBeDisabled());
  });

  it("sends the message on Enter and renders the streamed reply", async () => {
    mockStreamChatMessage.mockImplementation(
      async (_projectId, _content, onToken) => {
        onToken("来自 ");
        onToken("pi-agent 的回复");
        return { content: "来自 pi-agent 的回复", progressLog: [] };
      },
    );
    renderPanel(true);
    const input = await screen.findByPlaceholderText(
      "Send a message to pi-agent…",
    );
    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // The streamed reply is shown in the streaming message while awaiting.
    await waitFor(() =>
      expect(screen.getByTestId("markdown").textContent).toContain(
        "来自 pi-agent 的回复",
      ),
    );
    expect(mockStreamChatMessage).toHaveBeenCalled();
  });

  it("renders the progress list above the streaming bubble and hides it after done", async () => {
    mockStreamChatMessage.mockImplementation(
      async (_projectId, _content, _onToken, onProgress) => {
        onProgress?.({
          round: 0,
          tool: "list_tasks",
          label: "正在查询任务列表",
        });
        onProgress?.({
          round: 1,
          tool: "get_project_summary",
          label: "正在汇总项目状态",
        });
        return {
          content: "项目状态如下：\n- 任务：3 个。",
          progressLog: [
            { round: 0, tool: "list_tasks", label: "正在查询任务列表" },
            {
              round: 1,
              tool: "get_project_summary",
              label: "正在汇总项目状态",
            },
          ],
        };
      },
    );
    renderPanel(true);
    const input = await screen.findByPlaceholderText(
      "Send a message to pi-agent…",
    );
    fireEvent.change(input, { target: { value: "看看项目" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Both progress items appear together; assert them in a single waitFor so
    // we observe the populated list before the stream resolves and clears it.
    await waitFor(() => {
      expect(screen.getByText("正在查询任务列表")).toBeDefined();
      expect(screen.getByText("正在汇总项目状态")).toBeDefined();
    });

    // After the stream resolves the component clears the progress list. The
    // streaming message also disappears because the test mocks the message
    // history; the surrounding test below covers the streamed markdown.
    await waitFor(() =>
      expect(screen.queryByText("正在查询任务列表")).toBeNull(),
    );
    expect(screen.queryByText("正在汇总项目状态")).toBeNull();
  });

  it("clears history via the clear button and confirm dialog", async () => {
    mockClearChatHistory.mockResolvedValue(undefined);
    renderPanel(true);
    const input = await screen.findByPlaceholderText(
      "Send a message to pi-agent…",
    );
    expect(input).not.toBeDisabled();

    // Click the clear-history (trash) button.
    const clearBtn = screen.getByLabelText("Clear history");
    fireEvent.click(clearBtn);
    // Confirm action is inside the alert dialog; click the confirm button.
    const confirm = await screen.findByText("Clear history");
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mockClearChatHistory).toHaveBeenCalledWith("project-1"),
    );
  });
});
