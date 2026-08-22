import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useActiveTeam from "@/hooks/queries/team/use-active-team";

export default function TeamCrumbSelect() {
  const { t } = useTranslation();
  const { data: team } = useActiveTeam();
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="xs"
      className="h-7 justify-between px-2 text-xs text-foreground"
      onClick={() => {
        navigate({
          to: "/dashboard/team/$teamId",
          params: { teamId: team?.id },
        });
      }}
    >
      <span className="truncate text-left">
        {team?.name || t("navigation:teamSwitcher.selectTeam")}
      </span>
    </Button>
  );
}
