import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// Testing Library defaults its async queries to 1s, independently of vitest's
// testTimeout. Suites that wait on real timers and user-driven settling cross
// that whenever the machine is busy, which surfaced as a different test file
// failing on each run. The default is raised here rather than at each of the 77
// call sites, and the slower files can still opt into their own value.
configure({ asyncUtilTimeout: 10_000 });
