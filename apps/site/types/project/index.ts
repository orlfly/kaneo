import type Task from "@/types/task";

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  teamId: string;
  icon: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectWithTasks = Project & {
  columns: Array<{
    id: string;
    name: string;
    order: number;
    isFinal: boolean;
    projectId: string;
    tasks: Task[];
  }>;
};
