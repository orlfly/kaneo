import { client } from "@kaneo/libs";

async function resetUserPassword(userId: string, password: string) {
  const response = await client.admin.users[":id"].password.$post({
    param: { id: userId },
    json: { password },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to reset password");
  }

  return response.json();
}

export default resetUserPassword;
