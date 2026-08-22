import { useMutation } from "@tanstack/react-query";
import createProject from "@/fetchers/project/create-project";

function useCreateProject({
  name,
  slug,
  teamId,
  icon,
}: {
  name: string;
  slug: string;
  teamId: string;
  icon: string;
}) {
  return useMutation({
    mutationFn: () => createProject({ name, slug, teamId, icon }),
  });
}

export default useCreateProject;
