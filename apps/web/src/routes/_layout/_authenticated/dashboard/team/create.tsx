import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import useSetActiveTeam from "@/hooks/mutations/team/use-set-active-team";
import useCreateTeam from "@/hooks/queries/team/use-create-team";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/team/create",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useCreateTeam();
  const { mutateAsync: setActiveTeam } = useSetActiveTeam();

  useEffect(() => {
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const createdTeam = await mutateAsync({ name });
      toast.success(t("team:create.success"));
      await queryClient.invalidateQueries({ queryKey: ["teams"] });

      await setActiveTeam({ teamId: createdTeam.id });

      navigate({
        to: "/dashboard/team/$teamId",
        params: {
          teamId: createdTeam.id,
        },
        replace: true,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("team:create.error"),
      );
    }
  };

  return (
    <>
      <PageTitle title={t("team:create.pageTitle")} />
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-md">
          <Card className="shadow-sm">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>

                <h1 className="text-2xl font-semibold text-foreground mb-2">
                  {t("team:create.heading")}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {t("team:create.subtitle")}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="team-name"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      {t("team:create.nameLabel")}
                    </label>
                    <Input
                      ref={inputRef}
                      id="team-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("team:create.namePlaceholder")}
                      className="h-12 text-lg font-medium"
                      required
                    />
                    {!name.trim() && (
                      <p className="mt-1 text-destructive-foreground text-sm">
                        {t("team:create.required")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={!name.trim() || isPending}
                    className="w-full h-12 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending
                      ? t("team:create.creating")
                      : t("team:create.submit")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
