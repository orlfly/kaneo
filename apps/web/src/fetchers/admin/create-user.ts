import { client } from "@kaneo/libs";

export type CreateUserRequest = {
  username: string;
  name: string;
  email?: string;
  password: string;
  role?: "user" | "admin";
  teamId?: string;
};

async function createUser(request: CreateUserRequest) {
  const response = await client.admin.users.$post({ json: request });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to create user");
  }

  return response.json();
}

export default createUser;
