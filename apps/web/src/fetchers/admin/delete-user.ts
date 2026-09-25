import { client } from "@kaneo/libs";

async function deleteUser(userId: string) {
  const response = await client.admin.users[":id"].$delete({
    param: { id: userId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to delete user");
  }

  return response.json();
}

export default deleteUser;
