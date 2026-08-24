import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatPanel from "./chat-panel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
    expect(await screen.findByText("chat:notEnabledTitle")).toBeDefined();
    expect(screen.queryByPlaceholderText("chat:placeholder")).toBeNull();
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
    const input = await screen.findByPlaceholderText("chat:placeholder");
    await waitFor(() => expect(input).not.toBeDisabled());
  });

  it("sends the message on Enter and renders the streamed reply", async () => {
    mockStreamChatMessage.mockImplementation(
      async (_projectId, _content, onToken) => {
        onToken("来自 ");
        onToken("pi-agent 的回复");
        return "来自 pi-agent 的回复";
      },
    );
    renderPanel(true);
    const input = await screen.findByPlaceholderText("chat:placeholder");
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

  it("clears history via the clear button and confirm dialog", async () => {
    mockClearChatHistory.mockResolvedValue(undefined);
    renderPanel(true);
    const input = await screen.findByPlaceholderText("chat:placeholder");
    expect(input).not.toBeDisabled();

    // Click the clear-history (trash) button.
    const clearBtn = screen.getByLabelText("chat:clearHistory");
    fireEvent.click(clearBtn);
    // Confirm action is inside the alert dialog; click the confirm button.
    const confirm = await screen.findByText("chat:clearHistoryConfirm");
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mockClearChatHistory).toHaveBeenCalledWith("project-1"),
    );
  });
});
