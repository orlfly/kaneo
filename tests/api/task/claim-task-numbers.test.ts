import { beforeEach, describe, expect, it, vi } from "vitest";

type UpdateCall = { lastTaskNumber: number };

const mocks = vi.hoisted(() => {
  const projectRow: { lastTaskNumber: number } = { lastTaskNumber: 0 };
  let maxNumber = 0;
  const updateCalls: UpdateCall[] = [];
  let selectCall = 0;

  const txSelect = vi.fn().mockImplementation(() => {
    selectCall += 1;
    if (selectCall % 2 === 1) {
      return {
        from: () => ({
          where: () => ({
            for: async () => [projectRow],
          }),
        }),
      };
    }
    return {
      from: () => ({
        where: async () => [{ maxNumber }],
      }),
    };
  });

  const txUpdate = vi.fn().mockImplementation(() => ({
    set: (values: { lastTaskNumber: number }) => ({
      where: async () => {
        updateCalls.push(values);
        projectRow.lastTaskNumber = values.lastTaskNumber;
        return [];
      },
    }),
  }));

  const tx = {
    select: txSelect,
    update: txUpdate,
  };

  const db = {
    transaction: async <T>(cb: (t: typeof tx) => Promise<T>): Promise<T> =>
      cb(tx),
  };

  return {
    projectRow,
    getMaxNumber: () => maxNumber,
    setMaxNumber: (v: number) => {
      maxNumber = v;
    },
    getUpdateCalls: () => updateCalls,
    resetUpdateCalls: () => {
      updateCalls.length = 0;
    },
    resetSelectCall: () => {
      selectCall = 0;
    },
    db,
    tx,
  };
});

vi.mock("../../../apps/api/src/database", () => ({
  default: mocks.db,
}));

import claimTaskNumbers, {
  claimTaskNumber,
} from "../../../apps/api/src/task/controllers/claim-task-numbers";

describe("claimTaskNumbers", () => {
  beforeEach(() => {
    mocks.projectRow.lastTaskNumber = 0;
    mocks.setMaxNumber(0);
    mocks.getUpdateCalls().length = 0;
    mocks.resetSelectCall();
  });

  it("returns counter+1 and bumps the counter when counter is in sync", async () => {
    mocks.projectRow.lastTaskNumber = 5;
    mocks.setMaxNumber(5);

    const n = await claimTaskNumbers("p-1", 1);

    expect(n).toBe(6);
    expect(mocks.getUpdateCalls()).toEqual([{ lastTaskNumber: 6 }]);
  });

  it("skips forward to MAX(number)+1 when counter is behind (counter drift)", async () => {
    // The original bug: counter=131, MAX(task.number)=135
    mocks.projectRow.lastTaskNumber = 131;
    mocks.setMaxNumber(135);

    const n = await claimTaskNumbers("p-1", 1);

    expect(n).toBe(136);
    expect(mocks.getUpdateCalls()).toEqual([{ lastTaskNumber: 136 }]);
  });

  it("skips forward when counter is at 0 (cold start with existing tasks)", async () => {
    mocks.projectRow.lastTaskNumber = 0;
    mocks.setMaxNumber(42);

    const n = await claimTaskNumbers("p-1", 1);

    expect(n).toBe(43);
    expect(mocks.getUpdateCalls()).toEqual([{ lastTaskNumber: 43 }]);
  });

  it("returns current+1 (not MAX+1) when counter is ahead of MAX", async () => {
    // When counter > MAX, the safe value is current+count (no skip forward).
    // The UPDATE is still issued because the counter always advances by
    // count, but the returned number is current+1, not max+1.
    mocks.projectRow.lastTaskNumber = 10;
    mocks.setMaxNumber(9);

    const n = await claimTaskNumbers("p-1", 1);

    expect(n).toBe(11);
    // No skip-forward: returned number equals current+1, not maxExisting+1.
    expect(n).not.toBe(10);
    expect(mocks.getUpdateCalls()).toEqual([{ lastTaskNumber: 11 }]);
  });

  it("reserves a contiguous range when count > 1", async () => {
    mocks.projectRow.lastTaskNumber = 5;
    mocks.setMaxNumber(5);

    const n = await claimTaskNumbers("p-1", 3);

    expect(n).toBe(6);
    expect(mocks.getUpdateCalls()).toEqual([{ lastTaskNumber: 8 }]);
  });

  it("rejects non-positive count", async () => {
    await expect(claimTaskNumbers("p-1", 0)).rejects.toMatchObject({
      status: 400,
    });
    await expect(claimTaskNumbers("p-1", -1)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("claimTaskNumber (singular)", () => {
  beforeEach(() => {
    mocks.projectRow.lastTaskNumber = 0;
    mocks.setMaxNumber(0);
    mocks.getUpdateCalls().length = 0;
    mocks.resetSelectCall();
  });

  it("is an alias for claimTaskNumbers with count=1", async () => {
    mocks.projectRow.lastTaskNumber = 100;
    mocks.setMaxNumber(50);

    const n = await claimTaskNumber("p-1");

    expect(n).toBe(101);
    expect(mocks.getUpdateCalls()).toEqual([{ lastTaskNumber: 101 }]);
  });
});
