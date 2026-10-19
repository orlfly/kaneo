import { describe, expect, it } from "vitest";

import { i18n } from "@/lib/i18n";

// `agentConfig` is the one namespace only en-US defines. Other locales must
// still get its copy through the en-US fallback instead of the raw key.
describe("locale namespace fallback", () => {
  it("reads a namespace the active locale lacks from en-US", async () => {
    await i18n.changeLanguage("zh-CN");
    // changeLanguage resolves before the lazy backend has answered, so wait for
    // the namespaces the assertions read.
    await i18n.loadNamespaces(["agentConfig", "common"]);

    expect(i18n.t("agentConfig:title")).toBe("Agent Configuration");
    expect(i18n.t("common:actions.cancel")).toBe("取消");
  });
});
