import { client } from "@kaneo/libs";

export type UpdateUserRequest = {
  name?: string;
  role?: "user" | "admin";
  banned?: boolean;
};

async function updateUser(userId: string, request: UpdateUserRequest) {
  const response = await client.admin.users[":id"].$patch({
    param: { id: userId },
    json: request,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to update user");
  }

  return response.json();
}

export default updateUser;
