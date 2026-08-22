import { client } from "@kaneo/libs";

export type AdminUser = {
  id: string;
  name: string;
  username: string | null;
  displayUsername: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  createdAt: string;
};

async function listUsers(): Promise<AdminUser[]> {
  const response = await client.admin.users.$get();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to load users");
  }

  const data = await response.json();
  return data.users as AdminUser[];
}

export default listUsers;
